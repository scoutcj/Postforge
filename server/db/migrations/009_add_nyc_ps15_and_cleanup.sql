-- Create NYC PS15 organization
insert into organizations (name, recipient_email)
values ('NYC PS15', 'pics@media.ps15.org')
on conflict (recipient_email) do nothing;

-- Drop unused join_requests table
drop table if exists join_requests;

-- Remove joined_via_request column from user_profiles
alter table user_profiles drop column if exists joined_via_request;

