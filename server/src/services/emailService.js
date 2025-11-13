import { supabaseAdmin } from '../lib/supabaseClient.js';

export async function listEmails(organizationId = null, limit = 50, offset = 0) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  let query = supabaseAdmin
    .from('emails')
    .select(`
      id,
      sender,
      recipient,
      subject,
      received_at,
      organization_id,
      parsed_content:parsed_email_content (
        image_urls,
        processed
      )
    `);

  // Filter by organization if provided
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  query = query
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function insertEmail({
  sender,
  recipient,
  subject,
  receivedAt,
  rawText,
  textContent,
  imageUrls,
  organizationId
}) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const { data: emailData, error: emailError } = await supabaseAdmin
    .from('emails')
    .insert({
      sender,
      recipient,
      subject,
      received_at: receivedAt,
      raw_text: rawText,
      organization_id: organizationId
    })
    .select()
    .single();

  if (emailError) {
    throw emailError;
  }

  const { error: parsedError } = await supabaseAdmin
    .from('parsed_email_content')
    .insert({
      email_id: emailData.id,
      text_content: textContent,
      image_urls: imageUrls ?? [],
      processed: true
    });

  if (parsedError) {
    throw parsedError;
  }

  return emailData;
}

export async function fetchEmailsForDateRange(startDate, endDate, organizationId = null) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  let query = supabaseAdmin
    .from('emails')
    .select(`
      *,
      parsed_content:parsed_email_content (
        text_content,
        image_urls,
        processed
      )
    `)
    .gte('received_at', startDate.toISOString())
    .lte('received_at', endDate.toISOString());

  // Filter by organization if provided
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  query = query.order('received_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Fetch emails with images for AI caption generation
 * Only returns emails that have at least one image
 */
export async function fetchEmailsWithImagesForDateRange(startDate, endDate, organizationId = null) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  let query = supabaseAdmin
    .from('emails')
    .select(`
      id,
      sender,
      recipient,
      subject,
      received_at,
      raw_text,
      organization_id,
      parsed_content:parsed_email_content!inner (
        text_content,
        image_urls
      )
    `)
    .gte('received_at', startDate.toISOString())
    .lte('received_at', endDate.toISOString());

  // Filter by organization if provided
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  query = query.order('received_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  console.log(`[fetchEmailsWithImagesForDateRange] Raw query returned ${data?.length || 0} emails`);
  if (data && data.length > 0) {
    console.log(`[fetchEmailsWithImagesForDateRange] Sample email:`, {
      id: data[0].id,
      received_at: data[0].received_at,
      has_parsed_content: !!data[0].parsed_content,
      image_count: data[0].parsed_content?.image_urls?.length || 0
    });
  }

  // Filter to only emails with images and flatten structure
  const emailsWithImages = (data ?? [])
    .filter(email =>
      email.parsed_content?.image_urls &&
      email.parsed_content.image_urls.length > 0
    )
    .map(email => ({
      id: email.id,
      sender: email.sender,
      subject: email.subject,
      textContent: email.parsed_content.text_content || email.raw_text,
      imageUrls: email.parsed_content.image_urls,
      receivedAt: email.received_at
    }));

  console.log(`[fetchEmailsWithImagesForDateRange] After filtering: ${emailsWithImages.length} emails with images`);

  return emailsWithImages;
}
