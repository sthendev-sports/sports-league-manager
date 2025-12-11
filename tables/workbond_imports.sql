create table public.workbond_imports (
  id uuid not null default extensions.uuid_generate_v4 (),
  import_date date not null,
  shift_date date not null,
  volunteer_name character varying(255) not null,
  volunteer_first_name character varying(100) null,
  volunteer_last_name character varying(100) null,
  volunteer_email character varying(255) null,
  volunteer_phone character varying(50) null,
  player_name character varying(255) null,
  shift_type character varying(100) not null,
  hours_worked numeric(4, 2) not null default 0,
  spots_completed integer not null default 1,
  description text null,
  season_id uuid not null,
  family_id uuid null,
  volunteer_id uuid null,
  matched_family_id uuid null,
  matched_volunteer_id uuid null,
  is_matched boolean not null default false,
  match_method character varying(50) null,
  match_notes text null,
  processed_at timestamp with time zone null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint workbond_imports_pkey primary key (id),
  constraint workbond_imports_family_id_fkey foreign KEY (family_id) references families (id) on delete set null,
  constraint workbond_imports_matched_family_id_fkey foreign KEY (matched_family_id) references families (id) on delete set null,
  constraint workbond_imports_matched_volunteer_id_fkey foreign KEY (matched_volunteer_id) references volunteers (id) on delete set null,
  constraint workbond_imports_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE,
  constraint workbond_imports_volunteer_id_fkey foreign KEY (volunteer_id) references volunteers (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_workbond_imports_email on public.workbond_imports using btree (volunteer_email) TABLESPACE pg_default;

create index IF not exists idx_workbond_imports_phone on public.workbond_imports using btree (volunteer_phone) TABLESPACE pg_default;

create index IF not exists idx_workbond_imports_name on public.workbond_imports using btree (volunteer_name) TABLESPACE pg_default;

create index IF not exists idx_workbond_imports_player_name on public.workbond_imports using btree (player_name) TABLESPACE pg_default;

create index IF not exists idx_workbond_imports_is_matched on public.workbond_imports using btree (is_matched) TABLESPACE pg_default;

create index IF not exists idx_workbond_imports_season on public.workbond_imports using btree (season_id) TABLESPACE pg_default;