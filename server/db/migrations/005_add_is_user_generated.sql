-- Add is_user_generated flag to distinguish AI-generated posts from user-created ones
alter table ai_generated_posts
  add column if not exists is_user_generated boolean not null default false;

-- Create index for filtering by generation type
create index if not exists idx_ai_generated_posts_is_user_generated
  on ai_generated_posts(is_user_generated);
