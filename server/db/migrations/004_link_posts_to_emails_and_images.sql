-- Add email_id to link generated posts back to source emails
alter table ai_generated_posts
  add column if not exists email_id uuid references emails(id) on delete set null;

-- Add source_image_url to track which specific image the caption is for
-- (emails can have multiple images, so we need to know which one)
alter table ai_generated_posts
  add column if not exists source_image_url text;

-- Create index for looking up posts by email
create index if not exists idx_ai_generated_posts_email_id on ai_generated_posts(email_id);

-- Rename image_url to suggested_image for clarity (it's a suggestion, not the actual image)
-- Keep both columns for now to avoid breaking changes
alter table ai_generated_posts
  add column if not exists suggested_image text;

-- Copy data from image_url to suggested_image if not already done
update ai_generated_posts
set suggested_image = image_url
where suggested_image is null and image_url is not null;
