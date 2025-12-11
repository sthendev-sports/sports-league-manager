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