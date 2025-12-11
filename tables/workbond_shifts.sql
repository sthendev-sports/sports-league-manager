create table public.workbond_shifts (
  id uuid not null default extensions.uuid_generate_v4 (),
  family_id uuid null,
  volunteer_id uuid null,
  season_id uuid not null,
  shift_date date not null,
  shift_type character varying(100) not null,
  hours_worked numeric(4, 2) null default 0,
  description text null,
  verified_by uuid null,
  notes text null,
  is_manual_credit boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  spots_completed integer not null default 1,
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  verified_at timestamp with time zone null,
  constraint workbond_shifts_pkey primary key (id),
  constraint workbond_shifts_family_id_fkey foreign KEY (family_id) references families (id) on delete CASCADE,
  constraint workbond_shifts_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint workbond_shifts_volunteer_id_fkey foreign KEY (volunteer_id) references volunteers (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_workbond_shifts_family on public.workbond_shifts using btree (family_id) TABLESPACE pg_default;

create index IF not exists idx_workbond_shifts_season on public.workbond_shifts using btree (season_id) TABLESPACE pg_default;

create index IF not exists idx_workbond_shifts_date on public.workbond_shifts using btree (shift_date) TABLESPACE pg_default;

create trigger update_workbond_shifts_updated_at BEFORE
update on workbond_shifts for EACH row
execute FUNCTION update_updated_at_column ();