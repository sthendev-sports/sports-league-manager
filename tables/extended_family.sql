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