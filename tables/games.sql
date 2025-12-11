create table public.games (
  id uuid not null default extensions.uuid_generate_v4 (),
  season_id uuid null,
  division_id uuid null,
  home_team_id uuid null,
  away_team_id uuid null,
  game_date timestamp with time zone null,
  location character varying(255) null,
  home_score integer null,
  away_score integer null,
  status character varying(50) null default 'scheduled'::character varying,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint games_pkey primary key (id),
  constraint games_away_team_id_fkey foreign KEY (away_team_id) references teams (id) on delete CASCADE,
  constraint games_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint games_home_team_id_fkey foreign KEY (home_team_id) references teams (id) on delete CASCADE,
  constraint games_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_games_season_division on public.games using btree (season_id, division_id) TABLESPACE pg_default;

create trigger update_games_updated_at BEFORE
update on games for EACH row
execute FUNCTION update_updated_at_column ();