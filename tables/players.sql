create table public.players (
  id uuid not null default extensions.uuid_generate_v4 (),
  family_id uuid null,
  season_id uuid null,
  first_name character varying(255) not null,
  last_name character varying(255) not null,
  birth_date date null,
  division_id uuid null,
  team_id uuid null,
  uniform_size character varying(50) null,
  position_preference character varying(100) null,
  medical_notes text null,
  is_returning boolean null default true,
  registration_date timestamp with time zone not null default timezone ('utc'::text, now()),
  payment_received boolean null default false,
  payment_amount numeric(10, 2) null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  registration_no character varying(100) null,
  gender character varying(10) null,
  medical_conditions text null,
  is_new_player boolean null default false,
  is_travel_player boolean null default false,
  uniform_shirt_size character varying(50) null,
  uniform_pants_size character varying(50) null,
  program_title character varying(255) null,
  constraint players_pkey primary key (id),
  constraint players_division_id_fkey foreign KEY (division_id) references divisions (id) on delete set null,
  constraint players_family_id_fkey foreign KEY (family_id) references families (id) on delete CASCADE,
  constraint players_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint players_team_id_fkey foreign KEY (team_id) references teams (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_players_family_id on public.players using btree (family_id) TABLESPACE pg_default;

create index IF not exists idx_players_season_id on public.players using btree (season_id) TABLESPACE pg_default;

create index IF not exists idx_players_team_id on public.players using btree (team_id) TABLESPACE pg_default;

create index IF not exists idx_players_division_id on public.players using btree (division_id) TABLESPACE pg_default;

create index IF not exists idx_players_registration_no on public.players using btree (registration_no) TABLESPACE pg_default;

create trigger update_players_updated_at BEFORE
update on players for EACH row
execute FUNCTION update_updated_at_column ();