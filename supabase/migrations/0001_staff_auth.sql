-- Staff Auth migration and base fields

-- Areas: add slug for routing
alter table if exists public.areas
  add column if not exists slug text;

create unique index if not exists areas_slug_key on public.areas (slug);

-- Profiles: role + area + status + salary
alter table if exists public.profiles
  add column if not exists role text;

alter table if exists public.profiles
  add column if not exists area_id uuid references public.areas (id);

alter table if exists public.profiles
  add column if not exists is_active boolean default true;

alter table if exists public.profiles
  add column if not exists staff_salary numeric default 0;

-- Staff convocations: migrate to Auth users
alter table if exists public.staff_convocations
  add column if not exists user_id uuid references auth.users (id);

-- NOTE: backfill user_id from legacy staff_users before dropping old column.
-- alter table public.staff_convocations drop column if exists staff_user_id;
