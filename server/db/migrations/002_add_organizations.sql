-- Create organizations table
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  recipient_email text not null unique,
  created_at timestamptz not null default now()
);

-- Create index on recipient_email for fast lookup
create index if not exists idx_organizations_recipient_email on organizations(recipient_email);

-- Create user_profiles table to link users to organizations
create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

-- Create index for organization lookups
create index if not exists idx_user_profiles_organization_id on user_profiles(organization_id);

-- Add organization_id to emails table
alter table emails add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Create index for filtering emails by organization
create index if not exists idx_emails_organization_id on emails(organization_id);

-- Add organization_id to ai_generated_posts for per-org post generation
alter table ai_generated_posts add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Create index for filtering posts by organization
create index if not exists idx_ai_generated_posts_organization_id on ai_generated_posts(organization_id);
