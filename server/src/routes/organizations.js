import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import {
  createOrganization,
  assignUserToOrganization,
  getUserOrganization,
  isRecipientEmailAvailable,
  getOrganizationByRecipient,
  getOrganizationByDomain
} from '../services/organizationService.js';

export function registerOrganizationRoutes(app) {
  const router = express.Router();

  /**
   * GET /api/organizations/me
   * Get current user's organization
   */
  router.get('/me', requireAuth, async (req, res) => {
    try {
      const organization = await getUserOrganization(req.user.id);

      if (!organization) {
        return res.status(404).json({
          error: 'User not assigned to any organization'
        });
      }

      res.json({ data: organization });
    } catch (error) {
      console.error('Failed to get user organization:', error);
      res.status(500).json({ error: 'Failed to fetch organization' });
    }
  });

  /**
   * POST /api/organizations
   * Create a new organization and assign current user as owner
   */
  router.post('/', requireAuth, async (req, res) => {
    try {
      const { name, recipientEmail } = req.body;

      // Validate input
      if (!name || !recipientEmail) {
        return res.status(400).json({
          error: 'Name and recipient email are required'
        });
      }

      // Check if user already belongs to an organization
      const existingOrg = await getUserOrganization(req.user.id);
      if (existingOrg) {
        return res.status(400).json({
          error: 'User already belongs to an organization'
        });
      }

      // Check if email is available
      const available = await isRecipientEmailAvailable(recipientEmail);
      if (!available) {
        return res.status(400).json({
          error: 'This recipient email is already taken'
        });
      }

      // Create organization
      const organization = await createOrganization({ name, recipientEmail });

      // Assign user as owner
      await assignUserToOrganization({
        userId: req.user.id,
        organizationId: organization.id,
        role: 'owner'
      });

      res.status(201).json({ data: organization });
    } catch (error) {
      console.error('Failed to create organization:', error);
      res.status(500).json({
        error: error.message || 'Failed to create organization'
      });
    }
  });

  /**
   * POST /api/organizations/join
   * Join an existing organization by recipient email or domain
   */
  router.post('/join', requireAuth, async (req, res) => {
    try {
      const { recipientEmail } = req.body;

      if (!recipientEmail) {
        return res.status(400).json({
          error: 'Recipient email is required'
        });
      }

      const normalizedInput = recipientEmail.toLowerCase().trim();
      console.log('[JOIN] User attempting to join with input:', normalizedInput);

      const existingOrg = await getUserOrganization(req.user.id);
      if (existingOrg) {
        console.log('[JOIN] User already belongs to org:', existingOrg.id);
        return res.status(400).json({
          error: 'User already belongs to an organization'
        });
      }

      let organization;
      try {
        if (normalizedInput.includes('@')) {
          console.log('[JOIN] Looking up by recipient email:', normalizedInput);
          organization = await getOrganizationByRecipient(normalizedInput);
        } else {
          console.log('[JOIN] Looking up by domain:', normalizedInput);
          organization = await getOrganizationByDomain(normalizedInput);
        }
      } catch (lookupError) {
        console.error('[JOIN] Lookup error:', lookupError);
        if (lookupError.message?.includes('Multiple organizations found for that domain')) {
          return res.status(400).json({ error: lookupError.message });
        }
        throw lookupError;
      }

      if (!organization) {
        console.log('[JOIN] No organization found for input:', normalizedInput);
        return res.status(404).json({
          error: 'No organization found for that email or domain'
        });
      }

      console.log('[JOIN] Found organization:', organization.id, organization.name);

      // Check if organization has any existing members
      const { data: existingMembers } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id')
        .eq('organization_id', organization.id)
        .limit(1);

      const isFirstMember = !existingMembers || existingMembers.length === 0;
      const role = isFirstMember ? 'owner' : 'member';
      
      console.log('[JOIN] Is first member:', isFirstMember, '- assigning role:', role);

      await assignUserToOrganization({
        userId: req.user.id,
        organizationId: organization.id,
        role
      });

      console.log('[JOIN] User assigned to organization, fetching updated org...');

      const updatedOrg = await getUserOrganization(req.user.id);

      if (!updatedOrg) {
        console.error('[JOIN] Failed to retrieve organization after joining');
        return res.status(500).json({
          error: 'Failed to retrieve organization after joining'
        });
      }

      console.log('[JOIN] Success! User joined organization:', updatedOrg.id);
      res.status(200).json({ data: updatedOrg });
    } catch (error) {
      console.error('Failed to join organization:', error);
      res.status(500).json({
        error: error.message || 'Failed to join organization'
      });
    }
  });

  /**
   * POST /api/organizations/check-email
   * Check if recipient email is available
   */
  router.post('/check-email', requireAuth, async (req, res) => {
    try {
      const { recipientEmail } = req.body;

      if (!recipientEmail) {
        return res.status(400).json({
          error: 'Recipient email is required'
        });
      }

      const available = await isRecipientEmailAvailable(recipientEmail);

      res.json({ available });
    } catch (error) {
      console.error('Failed to check email availability:', error);
      res.status(500).json({ error: 'Failed to check email availability' });
    }
  });

  app.use('/api/organizations', router);
  app.use('/api/organization', router);
}
