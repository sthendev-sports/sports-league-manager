create table public.draft_sessions (
  id uuid not null default gen_random_uuid (),
  division_id uuid not null,
  season_id uuid not null,
  manager_order jsonb not null,
  current_pick integer null default 0,
  is_completed boolean null default false,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint draft_sessions_pkey primary key (id),
  constraint draft_sessions_division_id_season_id_key unique (division_id, season_id),
  constraint draft_sessions_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint draft_sessions_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;