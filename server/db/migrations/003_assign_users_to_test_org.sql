-- Create a default "test" organization
insert into organizations (name, recipient_email)
values ('Test Organization', 'test@sandboxc57945d68a8b4c12a9de9cdd1a69dd77.mailgun.org')
on conflict (recipient_email) do nothing;

-- Assign all existing users to the test organization
insert into user_profiles (user_id, organization_id, role)
select
  u.id,
  (select id from organizations where recipient_email = 'test@sandboxc57945d68a8b4c12a9de9cdd1a69dd77.mailgun.org'),
  'member'
from auth.users u
where not exists (
  select 1 from user_profiles up where up.user_id = u.id
);

-- Update existing emails without organization to be assigned to test org
update emails
set organization_id = (select id from organizations where recipient_email = 'test@sandboxc57945d68a8b4c12a9de9cdd1a69dd77.mailgun.org')
where organization_id is null;

-- Update existing posts without organization to be assigned to test org
update ai_generated_posts
set organization_id = (select id from organizations where recipient_email = 'test@sandboxc57945d68a8b4c12a9de9cdd1a69dd77.mailgun.org')
where organization_id is null;
