import { supabaseAdmin } from '../lib/supabaseClient.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase client not configured' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.error('Auth verification error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!data?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email
    };

    return next();
  } catch (err) {
    console.error('Auth middleware failure:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}
