board_members.sql

create table public.board_members (
  id uuid not null default gen_random_uuid (),
  name character varying(255) not null,
  email character varying(255) not null,
  phone character varying(50) null,
  role character varying(100) not null,
  division_id uuid null,
  is_active boolean null default true,
  notes text null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint board_members_pkey primary key (id),
  constraint board_members_division_id_fkey foreign KEY (division_id) references divisions (id) on delete set null
) TABLESPACE pg_default;


division_player_agents.sql

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

division_shift_requirements.sql

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

divisions.sql
create table public.divisions (
  id uuid not null default extensions.uuid_generate_v4 (),
  season_id uuid null,
  name character varying(100) not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  player_agent_name text null,
  player_agent_email text null,
  constraint divisions_pkey primary key (id),
  constraint divisions_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_divisions_season_id on public.divisions using btree (season_id) TABLESPACE pg_default;

draft_picks.sql

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

draft_sessions.sql

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

drafts.sql

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

extended_family.sql

create table public.extended_family (
  id uuid not null default extensions.uuid_generate_v4 (),
  family_id uuid null,
  name character varying(255) not null,
  relationship character varying(100) null,
  email character varying(255) null,
  phone character varying(50) null,
  can_pickup boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint extended_family_pkey primary key (id),
  constraint extended_family_family_id_fkey foreign KEY (family_id) references families (id) on delete CASCADE
) TABLESPACE pg_default;

families.sql

create table public.families (
  id uuid not null default extensions.uuid_generate_v4 (),
  family_id character varying(100) not null,
  primary_contact_name character varying(255) null,
  primary_contact_email character varying(255) null,
  primary_contact_phone character varying(50) null,
  address text null,
  emergency_contact character varying(255) null,
  emergency_phone character varying(50) null,
  work_bond_check_received boolean null default false,
  work_bond_shifts_completed integer null default 0,
  work_bond_shifts_required integer null default 2,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  parent2_first_name character varying(255) null,
  parent2_last_name character varying(255) null,
  parent2_email character varying(255) null,
  parent2_phone character varying(50) null,
  address_line_1 character varying(255) null,
  address_line_2 character varying(255) null,
  city character varying(100) null,
  state character varying(50) null,
  zip_code character varying(20) null,
  constraint families_pkey primary key (id),
  constraint families_family_id_key unique (family_id)
) TABLESPACE pg_default;

create index IF not exists idx_families_family_id on public.families using btree (family_id) TABLESPACE pg_default;

create index IF not exists idx_families_email on public.families using btree (primary_contact_email) TABLESPACE pg_default;

create index IF not exists idx_families_parent2_email on public.families using btree (parent2_email) TABLESPACE pg_default;

create trigger update_families_updated_at BEFORE
update on families for EACH row
execute FUNCTION update_updated_at_column ();

games.sql

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

payment_data.sql

create table public.payment_data (
  id uuid not null default extensions.uuid_generate_v4 (),
  order_no character varying(100) null,
  order_date date null,
  account_first_name character varying(255) null,
  account_last_name character varying(255) null,
  player_first_name character varying(255) null,
  player_last_name character varying(255) null,
  program_name character varying(255) null,
  division_name character varying(255) null,
  team_name character varying(255) null,
  order_detail_description character varying(255) null,
  order_item_amount_paid numeric(10, 2) null,
  orders_order_notes text null,
  admin_account_notes text null,
  user_id character varying(100) null,
  division_id character varying(100) null,
  player_id character varying(100) null,
  imported_at timestamp with time zone null default timezone ('utc'::text, now()),
  season_id uuid null,
  constraint payment_data_pkey primary key (id),
  constraint payment_data_season_id_fkey foreign KEY (season_id) references seasons (id)
) TABLESPACE pg_default;

create index IF not exists idx_payment_data_order_no on public.payment_data using btree (order_no) TABLESPACE pg_default;

create index IF not exists idx_payment_data_player_name on public.payment_data using btree (player_first_name, player_last_name) TABLESPACE pg_default;

players.sql

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

seasons.sql

create table public.seasons (
  id uuid not null default extensions.uuid_generate_v4 (),
  name character varying(255) not null,
  year integer not null,
  start_date date null,
  end_date date null,
  is_active boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint seasons_pkey primary key (id)
) TABLESPACE pg_default;

create trigger update_seasons_updated_at BEFORE
update on seasons for EACH row
execute FUNCTION update_updated_at_column ();

teams.sql

create table public.teams (
  id uuid not null default extensions.uuid_generate_v4 (),
  season_id uuid null,
  division_id uuid null,
  name character varying(255) not null,
  color character varying(100) null,
  volunteer_manager_id uuid null,
  volunteer_assistant_coach_id uuid null,
  volunteer_team_parent_id uuid null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  manager_name character varying(255) null,
  manager_phone character varying(50) null,
  manager_email character varying(255) null,
  volunteer_id uuid null,
  constraint teams_pkey primary key (id),
  constraint teams_division_id_fkey foreign KEY (division_id) references divisions (id) on delete CASCADE,
  constraint teams_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint teams_volunteer_id_fkey foreign KEY (volunteer_id) references volunteers (id)
) TABLESPACE pg_default;

create index IF not exists idx_teams_division_id on public.teams using btree (division_id) TABLESPACE pg_default;

create trigger update_teams_updated_at BEFORE
update on teams for EACH row
execute FUNCTION update_updated_at_column ();

users.sql

create table public.users (
  id uuid not null default extensions.uuid_generate_v4 (),
  email character varying(255) not null,
  password_hash character varying(255) not null,
  role character varying(50) not null,
  name character varying(255) not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email)
) TABLESPACE pg_default;

create trigger update_users_updated_at BEFORE
update on users for EACH row
execute FUNCTION update_updated_at_column ();

volunteer_shifts.sql

create table public.volunteer_shifts (
  id uuid not null default extensions.uuid_generate_v4 (),
  volunteer_id uuid null,
  season_id uuid null,
  shift_date date not null,
  shift_type character varying(100) null,
  hours_worked numeric(4, 2) null default 0,
  verified_by uuid null,
  notes text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint volunteer_shifts_pkey primary key (id),
  constraint volunteer_shifts_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint volunteer_shifts_verified_by_fkey foreign KEY (verified_by) references users (id),
  constraint volunteer_shifts_volunteer_id_fkey foreign KEY (volunteer_id) references volunteers (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_volunteer_shifts_volunteer on public.volunteer_shifts using btree (volunteer_id) TABLESPACE pg_default;

create index IF not exists idx_volunteer_shifts_season on public.volunteer_shifts using btree (season_id) TABLESPACE pg_default;

volunteers.sql

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
  constraint volunteers_pkey primary key (id),
  constraint volunteers_division_id_fkey foreign KEY (division_id) references divisions (id) on delete set null,
  constraint volunteers_family_id_fkey foreign KEY (family_id) references families (id) on delete CASCADE,
  constraint volunteers_player_id_fkey foreign KEY (player_id) references players (id) on delete set null,
  constraint volunteers_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint volunteers_team_id_fkey foreign KEY (team_id) references teams (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_volunteers_family_id on public.volunteers using btree (family_id) TABLESPACE pg_default;

create index IF not exists idx_volunteers_division_season on public.volunteers using btree (division_id, season_id) TABLESPACE pg_default;