import { supabaseAdmin } from '../lib/supabaseClient.js';

/**
 * Create a new organization
 */
export async function createOrganization({ name, recipientEmail }) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  // Normalize email to lowercase for consistency
  const normalizedEmail = recipientEmail.toLowerCase().trim();

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .insert({
      name,
      recipient_email: normalizedEmail
    })
    .select()
    .single();

  if (error) {
    // Check if it's a unique constraint violation
    if (error.code === '23505') {
      throw new Error('This email address is already taken');
    }
    throw error;
  }

  return data;
}

/**
 * Get organization by recipient email (case-insensitive)
 */
export async function getOrganizationByRecipient(recipientEmail) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const normalizedEmail = recipientEmail.toLowerCase().trim();

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .ilike('recipient_email', normalizedEmail)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Get organization by recipient domain (case-insensitive)
 */
export async function getOrganizationByDomain(domain) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const normalizedDomain = domain.toLowerCase().trim().replace(/^@/, '');

  if (!normalizedDomain) {
    throw new Error('Domain is required to lookup organization');
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .ilike('recipient_email', `%@${normalizedDomain}`)
    .limit(2);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (data.length > 1) {
    throw new Error('Multiple organizations found for that domain. Please use the full forwarding email.');
  }

  return data[0];
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(organizationId) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Get user's organization
 */
export async function getUserOrganization(userId) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select(`
      organization_id,
      role,
      organizations (
        id,
        name,
        recipient_email,
        created_at
      )
    `)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('[getUserOrganization] Error fetching org for user:', userId, error);
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  console.log('[getUserOrganization] Raw data:', JSON.stringify(data, null, 2));

  if (!data.organizations) {
    console.error('[getUserOrganization] organizations is null/undefined in data');
    return null;
  }

  return {
    ...data.organizations,
    userRole: data.role
  };
}

/**
 * Assign user to organization
 */
export async function assignUserToOrganization({ userId, organizationId, role = 'member' }) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  console.log('[assignUserToOrganization] Assigning user:', userId, 'to org:', organizationId);

  const { data: existingProfile, error: fetchError } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('[assignUserToOrganization] Error fetching profile:', fetchError);
    throw fetchError;
  }

  if (existingProfile) {
    console.log('[assignUserToOrganization] Found existing profile:', existingProfile);
    if (existingProfile.organization_id && existingProfile.organization_id !== organizationId) {
      throw new Error('User already assigned to an organization');
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        organization_id: organizationId,
        role
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('[assignUserToOrganization] Error updating profile:', updateError);
      throw updateError;
    }

    console.log('[assignUserToOrganization] Updated profile:', updatedProfile);
    return updatedProfile;
  }

  console.log('[assignUserToOrganization] Creating new profile');
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      role
    })
    .select()
    .single();

  if (error) {
    console.error('[assignUserToOrganization] Error inserting profile:', error);
    if (error.code === '23505') {
      throw new Error('User already assigned to an organization');
    }
    throw error;
  }

  console.log('[assignUserToOrganization] Created profile:', data);
  return data;
}

/**
 * Check if recipient email is available
 */
export async function isRecipientEmailAvailable(recipientEmail) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const normalizedEmail = recipientEmail.toLowerCase().trim();

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .ilike('recipient_email', normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data === null;
}

/**
 * List all organizations (admin use)
 */
export async function listOrganizations() {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}
