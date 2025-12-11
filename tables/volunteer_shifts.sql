create table public.volunteer_shifts (
  id uuid not null default extensions.uuid_generate_v4 (),
  volunteer_id uuid null,
  season_id uuid null,
  shift_date date not null,
  shift_type character varying(100) null,
  hours_worked numeric(4, 2) null default 0,
  verified_by uuid null,
  notes text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint volunteer_shifts_pkey primary key (id),
  constraint volunteer_shifts_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint volunteer_shifts_verified_by_fkey foreign KEY (verified_by) references users (id),
  constraint volunteer_shifts_volunteer_id_fkey foreign KEY (volunteer_id) references volunteers (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_volunteer_shifts_volunteer on public.volunteer_shifts using btree (volunteer_id) TABLESPACE pg_default;

create index IF not exists idx_volunteer_shifts_season on public.volunteer_shifts using btree (season_id) TABLESPACE pg_default;