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
  first_name character varying(255) null,
  last_name character varying(255) null,
  spouse_first_name character varying(255) null,
  spouse_last_name character varying(255) null,
  spouse_email character varying(255) null,
  abuse_awareness_completed boolean null default false,
  family_id uuid null,
  constraint board_members_pkey primary key (id),
  constraint board_members_division_id_fkey foreign KEY (division_id) references divisions (id) on delete set null,
  constraint board_members_family_id_fkey foreign KEY (family_id) references families (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_board_members_email on public.board_members using btree (email) TABLESPACE pg_default;

create index IF not exists idx_board_members_family_id on public.board_members using btree (family_id) TABLESPACE pg_default;