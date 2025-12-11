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