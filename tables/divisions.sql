create table public.divisions (
  id uuid not null default extensions.uuid_generate_v4 (),
  season_id uuid null,
  name character varying(100) not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  player_agent_name text null,
  player_agent_email text null,
  player_agent_phone text null,
  board_member_id uuid null,
  constraint divisions_pkey primary key (id),
  constraint divisions_board_member_id_fkey foreign KEY (board_member_id) references board_members (id) on delete set null,
  constraint divisions_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_divisions_season_id on public.divisions using btree (season_id) TABLESPACE pg_default;