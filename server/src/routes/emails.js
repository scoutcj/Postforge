import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { listEmails } from '../services/emailService.js';
import { getUserOrganization } from '../services/organizationService.js';

export function registerEmailRoutes(app) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      // Get user's organization
      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(403).json({
          error: 'User not assigned to any organization'
        });
      }

      // Parse pagination params
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;

      // List emails filtered by user's organization
      const emails = await listEmails(organization.id, limit, offset);
      res.json({ data: emails });
    } catch (error) {
      console.error('Failed to list emails:', error);
      res.status(500).json({ error: 'Failed to fetch emails' });
    }
  });

  /**
   * DELETE /api/emails/:emailId/images/:index
   * Delete a specific image from an email
   */
  router.delete('/:emailId/images/:index', requireAuth, async (req, res) => {
    try {
      const { emailId, index } = req.params;
      const imageIndex = parseInt(index, 10);

      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(403).json({ error: 'User not assigned to any organization' });
      }

      const { supabaseAdmin } = await import('../lib/supabaseClient.js');

      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Database client not configured' });
      }

      // Verify email belongs to organization
      const { data: emailData, error: emailError } = await supabaseAdmin
        .from('emails')
        .select('id')
        .eq('id', emailId)
        .eq('organization_id', organization.id)
        .single();

      if (emailError || !emailData) {
        return res.status(404).json({ error: 'Email not found or unauthorized' });
      }

      // Get current image URLs
      const { data: contentData, error: contentError } = await supabaseAdmin
        .from('parsed_email_content')
        .select('image_urls')
        .eq('email_id', emailId)
        .single();

      if (contentError || !contentData) {
        return res.status(404).json({ error: 'Email content not found' });
      }

      const currentUrls = contentData.image_urls || [];
      
      // Remove the image at the specified index
      if (imageIndex >= 0 && imageIndex < currentUrls.length) {
        const newUrls = [...currentUrls];
        newUrls.splice(imageIndex, 1);

        const { error: updateError } = await supabaseAdmin
          .from('parsed_email_content')
          .update({ image_urls: newUrls })
          .eq('email_id', emailId);

        if (updateError) {
          throw updateError;
        }
      }

      res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
      console.error('Failed to delete image:', error);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  });

  /**
   * DELETE /api/emails/images/bulk
   * Delete multiple images
   * Body: { images: [{ emailId: string, index: number }] }
   */
  router.delete('/images/bulk', requireAuth, async (req, res) => {
    try {
      console.log('Bulk delete request body:', req.body);
      const { images } = req.body;

      if (!Array.isArray(images) || images.length === 0) {
        console.error('Invalid images array:', images);
        return res.status(400).json({ error: 'images array is required' });
      }

      const organization = await getUserOrganization(req.user.id);
      console.log('User organization:', organization?.id);

      if (!organization) {
        return res.status(403).json({ error: 'User not assigned to any organization' });
      }

      const { supabaseAdmin } = await import('../lib/supabaseClient.js');

      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Database client not configured' });
      }

      // Group images by emailId
      const imagesByEmail = images.reduce((acc, img) => {
        if (!acc[img.emailId]) {
          acc[img.emailId] = [];
        }
        acc[img.emailId].push(img.index);
        return acc;
      }, {});

      console.log('Images grouped by email:', imagesByEmail);

      let deletedCount = 0;

      // Process each email's images
      for (const [emailId, indices] of Object.entries(imagesByEmail)) {
        console.log(`Processing email ${emailId}, indices:`, indices);

        // Verify email belongs to organization
        const { data: emailData, error: emailError } = await supabaseAdmin
          .from('emails')
          .select('id')
          .eq('id', emailId)
          .eq('organization_id', organization.id)
          .single();

        if (emailError || !emailData) {
          console.log(`Email ${emailId} not found or unauthorized`);
          continue;
        }

        // Get current image URLs
        const { data: contentData, error: contentError } = await supabaseAdmin
          .from('parsed_email_content')
          .select('image_urls')
          .eq('email_id', emailId)
          .single();

        if (contentError || !contentData) {
          console.log(`No content found for email ${emailId}`);
          continue;
        }

        const currentUrls = contentData.image_urls || [];
        console.log(`Current URLs for email ${emailId}:`, currentUrls);

        // Remove images at specified indices (sort in descending order to maintain indices)
        const sortedIndices = indices.sort((a, b) => b - a);
        const newUrls = [...currentUrls];

        for (const index of sortedIndices) {
          if (index >= 0 && index < newUrls.length) {
            newUrls.splice(index, 1);
            deletedCount++;
          }
        }

        console.log(`New URLs for email ${emailId}:`, newUrls);

        // Update the email content
        const { error: updateError } = await supabaseAdmin
          .from('parsed_email_content')
          .update({ image_urls: newUrls })
          .eq('email_id', emailId);

        if (updateError) {
          console.error(`Failed to update email ${emailId}:`, updateError);
          throw updateError;
        }
      }

      console.log(`Successfully deleted ${deletedCount} image(s)`);

      res.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} image(s) successfully`
      });
    } catch (error) {
      console.error('Failed to bulk delete images:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to delete images', details: error.message });
    }
  });

  /**
   * DELETE /api/emails/images/all
   * Delete all images for the user's organization
   * Query params (optional): startDate, endDate (ISO date strings)
   */
  router.delete('/images/all', requireAuth, async (req, res) => {
    try {
      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(403).json({ error: 'User not assigned to any organization' });
      }

      const { supabaseAdmin } = await import('../lib/supabaseClient.js');

      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Database client not configured' });
      }

      // Build query with optional date filtering
      let emailQuery = supabaseAdmin
        .from('emails')
        .select(`
          id,
          parsed_content:parsed_email_content (
            image_urls
          )
        `)
        .eq('organization_id', organization.id);

      // Add date range filtering if provided
      const { startDate, endDate } = req.query;
      if (startDate && endDate) {
        emailQuery = emailQuery
          .gte('received_at', startDate)
          .lte('received_at', endDate);
      }

      const { data: emailsData, error: emailsError } = await emailQuery;

      if (emailsError) {
        throw emailsError;
      }

      // Count total images
      let totalImages = 0;
      const emailIds = [];

      for (const email of emailsData || []) {
        if (email.parsed_content?.image_urls) {
          totalImages += email.parsed_content.image_urls.length;
          emailIds.push(email.id);
        }
      }

      // Clear all image URLs for these emails
      if (emailIds.length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('parsed_email_content')
          .update({ image_urls: [] })
          .in('email_id', emailIds);

        if (updateError) {
          throw updateError;
        }
      }

      res.json({
        success: true,
        deletedCount: totalImages,
        message: `Deleted ${totalImages} image(s) successfully`
      });
    } catch (error) {
      console.error('Failed to delete all images:', error);
      res.status(500).json({ error: 'Failed to delete all images' });
    }
  });

  app.use('/api/emails', router);
}
