-- Create join_requests table for organization membership approval workflow
create table if not exists join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  unique(user_id, organization_id)
);

create index if not exists idx_join_requests_organization_id on join_requests(organization_id);
create index if not exists idx_join_requests_user_id on join_requests(user_id);
create index if not exists idx_join_requests_status on join_requests(status);

-- Add a column to track if user_profiles were created via join request
alter table user_profiles add column if not exists joined_via_request boolean not null default false;





