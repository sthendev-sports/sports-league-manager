create table public.division_player_agents (
  id uuid not null default gen_random_uuid (),
  division_id uuid not null,
  board_member_id uuid not null,
  season_id uuid not null,
  constraint division_player_agents_pkey primary key (id),
  constraint division_player_agents_division_id_season_id_key unique (division_id, season_id),
  constraint division_player_agents_board_member_id_fkey foreign KEY (board_member_id) references board_members (id) on delete CASCADE,
  constraint division_player_agents_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint division_player_agents_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;