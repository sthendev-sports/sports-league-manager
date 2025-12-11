create table public.drafts (
  id uuid not null default extensions.uuid_generate_v4 (),
  season_id uuid null,
  division_id uuid null,
  team_id uuid null,
  player_id uuid null,
  pick_number integer null,
  drafted_by uuid null,
  drafted_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint drafts_pkey primary key (id),
  constraint drafts_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint drafts_drafted_by_fkey foreign KEY (drafted_by) references users (id) on delete set null,
  constraint drafts_player_id_fkey foreign KEY (player_id) references players (id) on delete CASCADE,
  constraint drafts_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint drafts_team_id_fkey foreign KEY (team_id) references teams (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_drafts_season_division on public.drafts using btree (season_id, division_id) TABLESPACE pg_default;