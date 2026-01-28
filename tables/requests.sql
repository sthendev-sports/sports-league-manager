create table public.requests (
  id uuid not null default gen_random_uuid (),
  season_id uuid not null,
  player_id uuid not null,
  parent_request text null,
  status text not null default 'Pending'::text,
  type text null,
  program text null,
  comments text null,
  current_division_id uuid null,
  new_division_id uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  requested_player_id uuid null,
  requested_teammate_name text null,
  constraint requests_pkey primary key (id),
  constraint requests_current_division_id_fkey foreign KEY (current_division_id) references divisions (id) on delete set null,
  constraint requests_new_division_id_fkey foreign KEY (new_division_id) references divisions (id) on delete set null,
  constraint requests_player_id_fkey foreign KEY (player_id) references players (id) on delete CASCADE,
  constraint requests_requested_player_id_fkey foreign KEY (requested_player_id) references players (id) on delete set null,
  constraint requests_season_id_fkey foreign KEY (season_id) references seasons (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_requests_season_id on public.requests using btree (season_id) TABLESPACE pg_default;

create index IF not exists idx_requests_player_id on public.requests using btree (player_id) TABLESPACE pg_default;

create index IF not exists idx_requests_current_division_id on public.requests using btree (current_division_id) TABLESPACE pg_default;

create index IF not exists idx_requests_new_division_id on public.requests using btree (new_division_id) TABLESPACE pg_default;

create index IF not exists idx_requests_requested_player_id on public.requests using btree (requested_player_id) TABLESPACE pg_default;

create trigger trg_requests_updated_at BEFORE
update on requests for EACH row
execute FUNCTION set_updated_at ();