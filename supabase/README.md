# Supabase setup

## 1) Apply schema updates
- Run `supabase/migrations/0001_staff_auth.sql` in the Supabase SQL editor.
- Run `supabase/migrations/0002_profiles_trigger.sql` to auto-create profiles on auth signup.
- Backfill `areas.slug` (example: `barra`, `caja`, `limpieza`, `seguridad`, `produccion`).
- Backfill `profiles.role`, `profiles.area_id`, and `profiles.staff_salary` for existing users.

## 2) Migrate staff convocations
- Add `staff_convocations.user_id` by mapping legacy staff users to Auth users.
- After backfill, drop the legacy column if still present:
  `alter table public.staff_convocations drop column if exists staff_user_id;`

## 2.1) Backfill missing profiles (if needed)
Use this once to create profiles for existing auth users without a row:
```
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data->>'full_name'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
```

## 3) Enable RLS
- Run `supabase/rls.sql` in the SQL editor.
- Review and adjust policies for your production needs.

## 4) Deploy edge function
- Deploy `supabase/functions/create-staff` with the Supabase CLI.
- Required secrets in the function environment:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 5) Storage
- Ensure bucket `finance-attachments` exists.
- Apply storage policies to restrict uploads/downloads to admin/gerencia.
