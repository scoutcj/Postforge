import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { listDailyPosts, storeGeneratedPosts } from '../services/postService.js';
import { getUserOrganization } from '../services/organizationService.js';
import { fetchEmailsWithImagesForDateRange } from '../services/emailService.js';
import { generateInstagramCaptions, generateCombinedPost } from '../services/aiGenerator.js';

export function registerPostRoutes(app) {
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
      const limit = parseInt(req.query.limit, 10) || 30;
      const offset = parseInt(req.query.offset, 10) || 0;

      // List posts filtered by user's organization
      const posts = await listDailyPosts(organization.id, limit, offset);
      res.json({ data: posts });
    } catch (error) {
      console.error('Failed to list posts:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });

  /**
   * POST /api/daily-posts/generate
   * Generate a new Instagram post
   *
   * Body (optional):
   * {
   *   selectedImages: [
   *     {
   *       imageUrl: string,
   *       emailId: string,
   *       subject: string,
   *       sender: string,
   *       textContent: string
   *     }
   *   ]
   * }
   *
   * If selectedImages is empty/missing, uses today's emails with auto-selection
   * If selectedImages is provided, generates ONE combined post from those images
   */
  router.post('/generate', requireAuth, async (req, res) => {
    const startTime = Date.now();

    try {
      if (!process.env.CLAUDE_API_KEY) {
        return res.status(500).json({
          error: 'Claude API key not configured'
        });
      }

      // Get user's organization
      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(403).json({
          error: 'User not assigned to any organization'
        });
      }

      const { selectedImages } = req.body;
      const now = new Date();

      let posts = [];

      if (selectedImages && selectedImages.length > 0) {
        // Manual mode: Generate combined post from selected images
        console.log(`[GeneratePost][${organization.name}] Generating post from ${selectedImages.length} selected images`);

        if (selectedImages.length > 5) {
          return res.status(400).json({
            error: 'Maximum 5 images can be selected'
          });
        }

        const post = await generateCombinedPost({
          images: selectedImages,
          date: now
        });

        // Mark as user-generated
        post.is_user_generated = true;
        posts = [post];
      } else {
        // Auto mode: Use today's emails with auto-selection (same as cron)
        console.log(`[GeneratePost][${organization.name}] Generating posts from today's emails (auto-selection)`);

        // Get timezone offset in hours (default to America/New_York = UTC-5)
        const timezoneOffsetHours = parseInt(process.env.TIMEZONE_OFFSET || '-5', 10);

        // Calculate "today" in the target timezone
        const utcNow = new Date(now.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));

        const start = new Date(utcNow);
        start.setUTCHours(0, 0, 0, 0);
        start.setTime(start.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

        const end = new Date(utcNow);
        end.setUTCHours(23, 59, 59, 999);
        end.setTime(end.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

        // Fetch only emails that have images
        const emails = await fetchEmailsWithImagesForDateRange(start, end, organization.id);

        if (!emails.length) {
          return res.status(400).json({
            error: 'No emails with images found for today',
            message: 'Try selecting specific images from a different date range'
          });
        }

        console.log(`[GeneratePost][${organization.name}] Reviewing ${emails.length} emails...`);

        posts = await generateInstagramCaptions({
          emails,
          date: now
        });

        if (posts.length === 0) {
          return res.status(400).json({
            error: 'No suitable images found',
            message: 'Claude did not select any images from today\'s emails'
          });
        }

        // Mark as user-generated since it was manually triggered
        posts = posts.map(post => ({ ...post, is_user_generated: true }));
      }

      // Store the generated posts
      const savedPosts = await storeGeneratedPosts(posts, organization.id);
      console.log(`[GeneratePost][${organization.name}] Stored ${savedPosts.length} new post(s)`);

      const duration = Date.now() - startTime;

      res.json({
        success: true,
        posts: savedPosts,
        message: `Generated ${savedPosts.length} post(s) successfully`,
        duration
      });
    } catch (error) {
      console.error('[GeneratePost] Failed:', error);
      const duration = Date.now() - startTime;
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate post',
        duration
      });
    }
  });

  /**
   * DELETE /api/daily-posts/bulk/delete
   * Delete multiple posts
   * Body: { postIds: string[] }
   */
  router.delete('/bulk/delete', requireAuth, async (req, res) => {
    try {
      const { postIds } = req.body;

      if (!Array.isArray(postIds) || postIds.length === 0) {
        return res.status(400).json({ error: 'postIds array is required' });
      }

      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(403).json({ error: 'User not assigned to any organization' });
      }

      const { supabaseAdmin } = await import('../lib/supabaseClient.js');

      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Database client not configured' });
      }

      // Delete posts that belong to the user's organization
      const { data, error } = await supabaseAdmin
        .from('ai_generated_posts')
        .delete()
        .in('id', postIds)
        .eq('organization_id', organization.id)
        .select();

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;

      res.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} post(s) successfully`
      });
    } catch (error) {
      console.error('Failed to bulk delete posts:', error);
      res.status(500).json({ error: 'Failed to delete posts' });
    }
  });

  /**
   * DELETE /api/daily-posts/all
   * Delete all posts for the user's organization
   * Query params (optional): startDate, endDate (ISO date strings)
   */
  router.delete('/all', requireAuth, async (req, res) => {
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
      let query = supabaseAdmin
        .from('ai_generated_posts')
        .delete()
        .eq('organization_id', organization.id);

      // Add date range filtering if provided
      const { startDate, endDate } = req.query;
      if (startDate && endDate) {
        query = query
          .gte('created_at', startDate)
          .lte('created_at', endDate);
      }

      const { data, error } = await query.select();

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;

      res.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} post(s) successfully`
      });
    } catch (error) {
      console.error('Failed to delete all posts:', error);
      res.status(500).json({ error: 'Failed to delete all posts' });
    }
  });

  /**
   * DELETE /api/daily-posts/:id
   * Delete a single post
   */
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(403).json({ error: 'User not assigned to any organization' });
      }

      const { supabaseAdmin } = await import('../lib/supabaseClient.js');

      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Database client not configured' });
      }

      // Delete the post, ensuring it belongs to the user's organization
      const { data, error } = await supabaseAdmin
        .from('ai_generated_posts')
        .delete()
        .eq('id', id)
        .eq('organization_id', organization.id)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Post not found or unauthorized' });
      }

      res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
      console.error('Failed to delete post:', error);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  });

  app.use('/api/daily-posts', router);
}
