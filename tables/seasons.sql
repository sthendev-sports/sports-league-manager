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