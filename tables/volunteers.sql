create table public.volunteers (
  id uuid not null default extensions.uuid_generate_v4 (),
  family_id uuid null,
  player_id uuid null,
  season_id uuid null,
  role character varying(100) not null,
  division_id uuid null,
  team_id uuid null,
  name character varying(255) not null,
  email character varying(255) null,
  phone character varying(50) null,
  background_check_completed boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  shifts_completed integer null default 0,
  shifts_required integer null default 0,
  can_pickup boolean null default false,
  notes text null,
  preferred_role character varying(100) null,
  experience_level character varying(50) null,
  is_approved boolean null default false,
  background_check_complete boolean null default false,
  interested_roles text null,
  constraint volunteers_pkey primary key (id),
  constraint volunteers_division_id_fkey foreign KEY (division_id) references divisions (id) on delete set null,
  constraint volunteers_family_id_fkey foreign KEY (family_id) references families (id) on delete CASCADE,
  constraint volunteers_player_id_fkey foreign KEY (player_id) references players (id) on delete set null,
  constraint volunteers_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint volunteers_team_id_fkey foreign KEY (team_id) references teams (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_volunteers_family_id on public.volunteers using btree (family_id) TABLESPACE pg_default;

create index IF not exists idx_volunteers_division_season on public.volunteers using btree (division_id, season_id) TABLESPACE pg_default;