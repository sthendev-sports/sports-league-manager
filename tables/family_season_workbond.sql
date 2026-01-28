create table public.family_season_workbond (
  id uuid not null default gen_random_uuid (),
  family_id uuid not null,
  season_id uuid not null,
  received boolean null default false,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint family_season_workbond_pkey primary key (id),
  constraint family_season_workbond_family_id_season_id_key unique (family_id, season_id),
  constraint family_season_workbond_family_id_fkey foreign KEY (family_id) references families (id) on delete CASCADE,
  constraint family_season_workbond_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_family_season_workbond_family_season on public.family_season_workbond using btree (family_id, season_id) TABLESPACE pg_default;

create index IF not exists idx_family_season_workbond_composite on public.family_season_workbond using btree (family_id, season_id) TABLESPACE pg_default;