import './config/env.js';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { registerEmailRoutes } from './routes/emails.js';
import { registerPostRoutes } from './routes/posts.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerOrganizationRoutes } from './routes/organizations.js';
import { registerCronRoutes } from './routes/cron.js';
import { scheduleDailyPostJob } from './jobs/dailyPostJob.js';

const PORT = process.env.PORT ?? 3001;

async function bootstrap() {
  const app = express();

  // Configure CORS to handle ngrok and local development
  app.use(cors({
    origin: true, // Reflect the request origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
      'X-Requested-With',
      'Accept'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400 // Cache preflight for 24 hours
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  registerWebhookRoutes(app);
  registerEmailRoutes(app);
  registerPostRoutes(app);
  registerOrganizationRoutes(app);
  registerCronRoutes(app);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Optional: Keep node-cron as backup if ENABLE_NODE_CRON is set
  if (process.env.ENABLE_NODE_CRON === 'true') {
    console.log('Starting node-cron scheduler...');
    scheduleDailyPostJob();
  } else {
    console.log('node-cron disabled. Use /api/cron/generate-daily-posts endpoint instead.');
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
