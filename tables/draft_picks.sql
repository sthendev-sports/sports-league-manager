create table public.draft_picks (
  id uuid not null default gen_random_uuid (),
  draft_session_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  pick_number integer not null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint draft_picks_pkey primary key (id),
  constraint draft_picks_draft_session_id_player_id_key unique (draft_session_id, player_id),
  constraint draft_picks_draft_session_id_fkey foreign KEY (draft_session_id) references draft_sessions (id) on delete CASCADE,
  constraint draft_picks_player_id_fkey foreign KEY (player_id) references players (id) on delete CASCADE,
  constraint draft_picks_team_id_fkey foreign KEY (team_id) references teams (id) on delete CASCADE
) TABLESPACE pg_default;