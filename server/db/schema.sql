create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  recipient_email text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_organizations_recipient_email on organizations(recipient_email);

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_organization_id on user_profiles(organization_id);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  recipient text not null,
  subject text,
  received_at timestamptz not null default now(),
  raw_text text,
  organization_id uuid references organizations(id) on delete cascade
);

create index if not exists idx_emails_organization_id on emails(organization_id);

create table if not exists parsed_email_content (
  email_id uuid references emails(id) on delete cascade,
  text_content text,
  image_urls text[],
  processed boolean not null default false
);

create table if not exists ai_generated_posts (
  id uuid primary key default gen_random_uuid(),
  caption_text text not null,
  email_id uuid references emails(id) on delete set null,
  source_image_url text,
  source_image_urls text[],
  image_url text,
  suggested_image text,
  created_at timestamptz not null default now(),
  organization_id uuid references organizations(id) on delete cascade
);

create index if not exists idx_ai_generated_posts_organization_id on ai_generated_posts(organization_id);
create index if not exists idx_ai_generated_posts_email_id on ai_generated_posts(email_id);

alter table parsed_email_content
  add constraint parsed_email_content_email_id_key unique (email_id);
