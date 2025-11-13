create extension if not exists pgcrypto;

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  recipient text not null,
  subject text,
  received_at timestamptz not null default now(),
  raw_text text
);

create table if not exists parsed_email_content (
  email_id uuid references emails(id) on delete cascade,
  text_content text,
  image_urls text[],
  processed boolean not null default false,
  constraint parsed_email_content_email_id_key unique (email_id)
);

create table if not exists ai_generated_posts (
  id uuid primary key default gen_random_uuid(),
  caption_text text not null,
  image_url text,
  created_at timestamptz not null default now()
);
