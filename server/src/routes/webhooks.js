import express from 'express';
import multer from 'multer';

import { parseMailgunPayload } from '../services/emailParser.js';
import { insertEmail } from '../services/emailService.js';
import { getOrganizationByRecipient } from '../services/organizationService.js';
import { uploadImageToStorage } from '../services/storageService.js';

const upload = multer();

export function registerWebhookRoutes(app) {
  const router = express.Router();

  router.post('/mailgun', upload.any(), async (req, res) => {
    try {
      const payload = req.body;
      const files = req.files || [];

      console.log('=== MAILGUN PAYLOAD ===');
      console.log('Available keys:', Object.keys(payload));
      console.log('Files count:', files.length);
      if (files.length > 0) {
        console.log('Files:', files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, mimetype: f.mimetype, size: f.size })));
      }
      // Log payload without base64 data
      const payloadSummary = {
        sender: payload.sender ?? payload.From,
        recipient: payload.recipient ?? payload.To,
        subject: payload.subject ?? payload.Subject,
        timestamp: payload.timestamp,
        'has-body-mime': !!payload['body-mime'],
        'has-body-html': !!payload['body-html'],
        'has-body-plain': !!payload['body-plain'],
        'body-plain-preview': payload['body-plain']?.slice(0, 100),
        attachmentCount: payload.attachments ? parseInt(payload.attachments, 10) : 0
      };
      console.log('Payload summary:', JSON.stringify(payloadSummary, null, 2));
      console.log('=====================');

      const sender = payload.sender ?? payload.From ?? 'unknown@unknown';
      const recipient = payload.recipient ?? payload.To ?? 'unknown@unknown';
      const subject = payload.subject ?? payload.Subject ?? '(no subject)';
      const timestamp = payload.timestamp
        ? new Date(Number(payload.timestamp) * 1000)
        : new Date();

      // Look up organization by recipient email
      const organization = await getOrganizationByRecipient(recipient);

      if (!organization) {
        console.error(`No organization found for recipient: ${recipient}`);
        return res.status(400).json({
          error: 'No organization found for this recipient address'
        });
      }

      console.log(`Email matched to organization: ${organization.name} (${organization.id})`);

      const parsed = await parseMailgunPayload(payload, files);

      // Upload images to Supabase Storage and get public URLs
      const imageUrls = await Promise.all(
        parsed.attachments.map(async (attachment) => {
          try {
            console.log(`[Webhook] Uploading: ${attachment.filename} (${attachment.contentType}, ${attachment.content.length} bytes)`);
            const publicUrl = await uploadImageToStorage(
              attachment.content,
              attachment.contentType,
              attachment.filename || 'image.png'
            );
            console.log(`[Webhook] ✓ Uploaded to storage`);
            return publicUrl;
          } catch (error) {
            console.error(`[Webhook] ✗ Upload failed for ${attachment.filename}:`, error.message);
            // Fallback to base64 if upload fails
            const base64 = attachment.content.toString('base64');
            console.warn(`[Webhook] → Falling back to base64 (${base64.length} chars)`);
            return `data:${attachment.contentType};base64,${base64}`;
          }
        })
      );

      await insertEmail({
        sender,
        recipient,
        subject,
        receivedAt: timestamp.toISOString(),
        rawText: parsed.text || parsed.html,
        textContent: parsed.text,
        imageUrls,
        organizationId: organization.id
      });

      res.status(204).end();
    } catch (error) {
      console.error('Mailgun webhook error:', error);
      res.status(400).json({ error: 'Failed to ingest email' });
    }
  });

  app.use('/api/webhooks', router);
}
