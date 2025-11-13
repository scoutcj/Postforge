## Email Parser & Instagram Caption Generator

This project implements the app described in `spec.md`: a small platform for schools to ingest forwarded emails, transform them into AI-generated Instagram captions, and review the results in a dashboard.

The repository is split into two packages:

- `server/`: Node.js + Express API that receives Mailgun webhooks, persists parsed emails to Supabase, and schedules daily Claude-powered caption generation.
- `client/`: React dashboard (Vite) that lets authenticated users review ingested emails and ready-to-post captions.

---

### 1. Prerequisites

- Node.js 20+
- Supabase project (PostgreSQL) with the SQL schema below applied.
- Mailgun domain configured to forward emails to the webhook endpoint.
- Claude API key (Anthropic) for caption generation.

---

### 2. Environment Variables

Copy the sample environment files and fill in your credentials:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

> The backend loader looks for `.env` files in `server/.env` first and then the project root `.env`, so you can keep a single shared file if you prefer.

Populate:

**Server (.env or server/.env):**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)
- `SUPABASE_ANON_KEY` - Supabase anon key
- `DATABASE_URL` - Postgres connection string (used by the migration runner)
- `CLAUDE_API_KEY` - Anthropic Claude API key
- `CRON_SECRET` - Secret token for securing cron endpoints
- `CLAUDE_MODEL` - Claude model to use (default: `claude-haiku-4-5`)
- `NOTIFICATION_EMAIL` - Email address to receive daily post notifications

**Client (.env or client/.env):**
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `VITE_API_BASE_URL` - API base URL (production only)

**Deployment Environment:**

- `TIMEZONE_OFFSET` - Timezone offset in hours (default: -5 for EST)
- `IMAGE_RETENTION_DAYS` - Days to keep images before cleanup (default: 60)



> The server expects a Supabase service role key so it can verify sessions and perform CRUD. The client uses the anon key to handle Supabase Auth flows in the browser and forwards the user session token to the API automatically.

---

### 3. Database Migrations

The migration runner uses your `DATABASE_URL`. From the repository root:

```sql
# ensure pgcrypto is enabled once in your database
create extension if not exists pgcrypto;
```

Then execute:

```bash
cd server
npm install         # first time only
npm run migrate
```

The initial migration (`db/migrations/001_initial.sql`) creates:

- `emails`
- `parsed_email_content`
- `ai_generated_posts`
- `schema_migrations` (tracks applied migrations)

---

### 4. Supabase Storage Setup

Images are stored in Supabase Storage instead of the database for better performance and lower costs.

**Create the storage bucket:**
1. Go to your Supabase dashboard → Storage
2. Click "New bucket"
3. Name: `email-images`
4. Set to **Public** (important for image URLs to work)
5. Click "Create bucket"

**Automatic cleanup:**
- Images older than 60 days are automatically deleted (configurable via `IMAGE_RETENTION_DAYS`)
- Run the cleanup manually: `POST /api/cron/cleanup-storage` with `Authorization: Bearer <CRON_SECRET>`
- Or schedule it weekly using your hosting platform's cron feature

---

### 5. Install Dependencies

```bash
cd server && npm install
cd ../client && npm install
```

You can keep both dev servers running simultaneously:

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

The Vite dev server proxies `/api/*` to the backend using `VITE_API_BASE_URL`.

---

### 5. Mailgun Webhook

Configure Mailgun to POST incoming/forwarded messages to:

```
POST https://<your-domain>/api/webhooks/mailgun
```

The route parses MIME payloads, stores the email row, and generates inline data URLs for image attachments. Replace the inline storage with Supabase Storage (or another CDN) when you are ready for production.

---
