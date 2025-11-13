import express from 'express';

import { fetchEmailsWithImagesForDateRange } from '../services/emailService.js';
import { storeGeneratedPosts } from '../services/postService.js';
import { generateInstagramCaptions } from '../services/aiGenerator.js';
import { listOrganizations } from '../services/organizationService.js';
import { sendDailyPostsNotification } from '../services/emailNotificationService.js';
import { runStorageCleanup } from '../jobs/cleanupStorageJob.js';

/**
 * Middleware to verify cron secret token
 */
function verifyCronSecret(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return res.status(500).json({ error: 'Cron secret not configured' });
  }

  const authHeader = req.headers.authorization;
  const providedSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  if (providedSecret !== cronSecret) {
    console.warn('Invalid cron secret provided');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

export function registerCronRoutes(app) {
  const router = express.Router();

  /**
   * POST /api/cron/generate-daily-posts
   * Generate Instagram captions from today's emails with images
   *
   * This endpoint should be triggered by a scheduled job (e.g., Render Cron Jobs)
   *
   * Headers:
   *   Authorization: Bearer <CRON_SECRET>
   */
  router.post('/generate-daily-posts', verifyCronSecret, async (req, res) => {
    const startTime = Date.now();

    try {
      if (!process.env.CLAUDE_API_KEY) {
        return res.status(500).json({
          error: 'Claude API key not configured'
        });
      }

      // Get timezone offset in hours (default to America/New_York = UTC-5)
      // Set TIMEZONE_OFFSET env var to your timezone offset, e.g., "-5" for EST, "-4" for EDT
      const timezoneOffsetHours = parseInt(process.env.TIMEZONE_OFFSET || '-5', 10);

      const now = new Date();

      // Calculate "today" in the target timezone
      // Convert current UTC time to target timezone, then get start/end of that day
      const utcNow = new Date(now.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));

      const start = new Date(utcNow);
      start.setUTCHours(0, 0, 0, 0);
      // Convert back to UTC by subtracting the offset
      start.setTime(start.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

      const end = new Date(utcNow);
      end.setUTCHours(23, 59, 59, 999);
      // Convert back to UTC by subtracting the offset
      end.setTime(end.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

      console.log(`[Cron] Starting daily post generation for ${now.toISOString()} (Timezone offset: ${timezoneOffsetHours}h)`);

      // Get all organizations
      const organizations = await listOrganizations();

      if (!organizations.length) {
        console.log('[Cron] No organizations found, skipping.');
        return res.json({
          success: true,
          message: 'No organizations found',
          processed: 0,
          duration: Date.now() - startTime
        });
      }

      console.log(`[Cron] Processing ${organizations.length} organizations...`);

      const results = [];

      // Process each organization separately
      for (const org of organizations) {
        try {
          // Fetch only emails that have images
          console.log(`[Cron][${org.name}] Querying date range: ${start.toISOString()} to ${end.toISOString()}`);
          const emails = await fetchEmailsWithImagesForDateRange(start, end, org.id);
          console.log(`[Cron][${org.name}] Found ${emails.length} emails with images`);

          if (!emails.length) {
            console.log(`[Cron][${org.name}] No emails with images for today, skipping.`);
            results.push({
              organization: org.name,
              success: true,
              captionsGenerated: 0,
              message: 'No emails with images'
            });
            continue;
          }

          // Count total images
          const totalImages = emails.reduce((sum, email) => sum + email.imageUrls.length, 0);

          console.log(`[Cron][${org.name}] Reviewing ${emails.length} emails with ${totalImages} images...`);

          const captions = await generateInstagramCaptions({
            emails,
            date: now
          });

          if (captions.length === 0) {
            console.log(`[Cron][${org.name}] Claude selected no images, skipping.`);
            results.push({
              organization: org.name,
              success: true,
              captionsGenerated: 0,
              message: 'No images selected by AI'
            });
            continue;
          }

          await storeGeneratedPosts(captions, org.id);
          console.log(`[Cron][${org.name}] Stored ${captions.length} new caption+image combinations.`);

          // Send email notification
          const notificationEmail = process.env.NOTIFICATION_EMAIL;
          if (notificationEmail) {
            try {
              await sendDailyPostsNotification({
                toEmail: notificationEmail,
                posts: captions,
                organizationName: org.name,
                date: now
              });
              console.log(`[Cron][${org.name}] Sent notification email to ${notificationEmail}`);
            } catch (emailError) {
              console.error(`[Cron][${org.name}] Failed to send notification email:`, emailError.message);
              // Don't fail the whole job if email fails
            }
          } else {
            console.log(`[Cron][${org.name}] NOTIFICATION_EMAIL not set, skipping email notification`);
          }

          results.push({
            organization: org.name,
            success: true,
            captionsGenerated: captions.length,
            emailsProcessed: emails.length,
            imagesReviewed: totalImages
          });
        } catch (orgError) {
          console.error(`[Cron][${org.name}] Failed:`, orgError);
          results.push({
            organization: org.name,
            success: false,
            error: orgError.message
          });
        }
      }

      const duration = Date.now() - startTime;
      const totalCaptions = results.reduce((sum, r) => sum + (r.captionsGenerated || 0), 0);

      console.log(`[Cron] Completed in ${duration}ms. Generated ${totalCaptions} captions.`);

      res.json({
        success: true,
        message: 'Daily post generation completed',
        organizations: results,
        totalCaptions,
        duration
      });
    } catch (error) {
      console.error('[Cron] Daily post generation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  });

  /**
   * POST /api/cron/cleanup-storage
   * Clean up old images from Supabase Storage
   * Deletes images older than IMAGE_RETENTION_DAYS (default: 60 days)
   *
   * This endpoint should be triggered weekly by a scheduled job
   *
   * Headers:
   *   Authorization: Bearer <CRON_SECRET>
   */
  router.post('/cleanup-storage', verifyCronSecret, async (req, res) => {
    const startTime = Date.now();

    try {
      const result = await runStorageCleanup();

      const duration = Date.now() - startTime;
      const freedSpaceMB = (result.freedSpace / (1024 * 1024)).toFixed(2);

      res.json({
        success: true,
        message: `Cleaned up ${result.deletedCount} images, freed ${freedSpaceMB}MB`,
        deletedCount: result.deletedCount,
        freedSpaceMB: parseFloat(freedSpaceMB),
        retentionDays: result.retentionDays,
        duration
      });
    } catch (error) {
      console.error('[Cron] Storage cleanup failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  });

  /**
   * GET /api/cron/health
   * Health check endpoint for cron jobs
   */
  router.get('/health', verifyCronSecret, (req, res) => {
    res.json({
      status: 'ok',
      claudeConfigured: !!process.env.CLAUDE_API_KEY,
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api/cron', router);
}
