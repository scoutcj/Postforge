import formData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(formData);

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL ?? `noreply@${MAILGUN_DOMAIN}`;

let mg = null;

if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
  mg = mailgun.client({
    username: 'api',
    key: MAILGUN_API_KEY
  });
}

/**
 * Send daily posts notification email
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email address
 * @param {Array} params.posts - Array of generated posts with caption_text and source_image_url
 * @param {string} params.organizationName - Name of the organization
 * @param {Date} params.date - Date the posts were generated for
 */
export async function sendDailyPostsNotification({ toEmail, posts, organizationName, date }) {
  if (!mg) {
    throw new Error('Mailgun not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN.');
  }

  if (!posts || posts.length === 0) {
    console.log('No posts to send notification for');
    return null;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Build the email content
  const captionsText = posts
    .map((post, index) => `${index + 1}. ${post.caption_text}`)
    .join('\n\n');

  const htmlCaptions = posts
    .map((post, index) => `
      <div style="margin-bottom: 30px; padding: 20px; background: #f9f9f9; border-radius: 8px;">
        <h3 style="color: #333; margin-top: 0;">Caption ${index + 1}</h3>
        <p style="font-size: 16px; line-height: 1.6; color: #555;">${escapeHtml(post.caption_text)}</p>
        ${post.source_image_url ? '<p style="color: #888; font-size: 14px;">📷 Image included</p>' : ''}
      </div>
    `)
    .join('');

  const textContent = `Daily Instagram Posts Ready!

Hi there,

Your daily Instagram captions for ${organizationName} are ready for ${dateStr}!

We've generated ${posts.length} caption${posts.length > 1 ? 's' : ''} from today's emails:

${captionsText}

---

To view the full posts with images, log in to your dashboard:
${process.env.FRONTEND_URL || 'https://your-app.com'}/dashboard/posts

Happy posting!
- Email Parser Team`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Posts Ready</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 28px;">📱 Daily Posts Ready!</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">${organizationName}</p>
  </div>

  <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="font-size: 16px; color: #555;">Hi there,</p>

    <p style="font-size: 16px; color: #555;">
      Your daily Instagram captions are ready for <strong>${dateStr}</strong>!
    </p>

    <p style="font-size: 16px; color: #555;">
      We've generated <strong>${posts.length} caption${posts.length > 1 ? 's' : ''}</strong> from today's emails with images:
    </p>

    ${htmlCaptions}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'https://your-app.com'}/dashboard/posts"
         style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        View Posts & Images →
      </a>
    </div>

    <p style="font-size: 14px; color: #888; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
      Happy posting! 🎉
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p>Email Parser - Automated Instagram Caption Generator</p>
  </div>
</body>
</html>
`;

  try {
    const result = await mg.messages.create(MAILGUN_DOMAIN, {
      from: NOTIFICATION_FROM_EMAIL,
      to: [toEmail],
      subject: `📱 ${posts.length} New Instagram Caption${posts.length > 1 ? 's' : ''} Ready - ${organizationName}`,
      text: textContent,
      html: htmlContent
    });

    console.log(`[Email] Sent notification to ${toEmail}, message ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error('[Email] Failed to send notification:', error);
    throw error;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
