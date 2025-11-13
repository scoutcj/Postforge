import { supabaseAdmin } from '../lib/supabaseClient.js';

export async function listDailyPosts(organizationId = null, limit = 30, offset = 0) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  let query = supabaseAdmin
    .from('ai_generated_posts')
    .select(`
      id,
      caption_text,
      source_image_url,
      source_image_urls,
      created_at,
      is_user_generated
    `);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function storeGeneratedPosts(posts, organizationId = null) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    return [];
  }

  const payload = posts.map((post) => {
    const normalizedUrls = Array.isArray(post.source_image_urls)
      ? post.source_image_urls.filter(Boolean)
      : (post.source_image_url ? [post.source_image_url] : []);

    return {
      caption_text: post.caption_text,
      email_id: post.email_id ?? null,
      source_image_url: normalizedUrls.length > 0 ? normalizedUrls[0] : post.source_image_url ?? null,
      source_image_urls: normalizedUrls.length > 0 ? normalizedUrls : null,
      image_url: post.image_url ?? null,
      suggested_image: post.suggested_image ?? null,
      created_at: post.created_at ?? new Date().toISOString(),
      organization_id: organizationId,
      is_user_generated: post.is_user_generated ?? false
    };
  });

  const { data, error } = await supabaseAdmin
    .from('ai_generated_posts')
    .insert(payload)
    .select();

  if (error) {
    throw error;
  }

  return data ?? [];
}
