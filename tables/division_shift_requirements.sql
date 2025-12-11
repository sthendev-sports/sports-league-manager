create table public.division_shift_requirements (
  id uuid not null default extensions.uuid_generate_v4 (),
  season_id uuid null,
  division_id uuid null,
  shifts_required integer not null default 2,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint division_shift_requirements_pkey primary key (id),
  constraint division_shift_requirements_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint division_shift_requirements_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_division_shift_requirements_season on public.division_shift_requirements using btree (season_id) TABLESPACE pg_default;