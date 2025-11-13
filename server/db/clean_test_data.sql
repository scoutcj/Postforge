-- Delete all existing test emails and related data
-- Run this in Supabase SQL editor

-- Delete parsed email content (will cascade from emails, but being explicit)
delete from parsed_email_content;

-- Delete all emails
delete from emails;

-- Delete AI generated posts if they exist
delete from ai_generated_posts;

-- Optional: Reset any test organizations if needed
-- Uncomment the line below if you want to delete test organizations
-- delete from organizations;
