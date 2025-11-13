import { simpleParser } from 'mailparser';

export async function parseMailgunPayload(payload, files = []) {
  if (!payload) {
    throw new Error('Missing Mailgun payload');
  }

  // If body-mime is present, parse it (includes attachments)
  if (payload['body-mime']) {
    return parseMime(payload['body-mime']);
  }

  // Otherwise, handle standard fields + separate file attachments
  if (payload['body-html'] || payload['body-plain']) {
    // Extract image attachments from uploaded files
    const imageAttachments = files
      .filter((file) => file.mimetype?.startsWith('image/'))
      .map((file) => ({
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        content: file.buffer
      }));

    return {
      text: payload['body-plain'] ?? '',
      html: payload['body-html'] ?? '',
      attachments: imageAttachments
    };
  }

  throw new Error('Unsupported Mailgun payload format');
}

async function parseMime(mime) {
  const parsed = await simpleParser(mime);

  const imageAttachments = (parsed.attachments ?? [])
    .filter((attachment) => attachment.contentType?.startsWith('image/'))
    .map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      content: attachment.content
    }));

  return {
    text: parsed.text ?? '',
    html: parsed.html ?? '',
    attachments: imageAttachments
  };
}
