create table public.workbond_requirements (
  id uuid not null default extensions.uuid_generate_v4 (),
  division_id uuid not null,
  season_id uuid not null,
  shifts_required integer not null default 2,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint workbond_requirements_pkey primary key (id),
  constraint unique_division_season unique (division_id, season_id),
  constraint workbond_requirements_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint workbond_requirements_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_workbond_requirements_division on public.workbond_requirements using btree (division_id) TABLESPACE pg_default;

create index IF not exists idx_workbond_requirements_season on public.workbond_requirements using btree (season_id) TABLESPACE pg_default;