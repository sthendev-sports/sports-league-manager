create table public.trainings (
  id uuid not null default gen_random_uuid (),
  name text not null,
  description text null,
  expires_in_days integer null,
  category text not null,
  is_required boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  expires_on_date date null,
  constraint trainings_pkey primary key (id),
  constraint check_expiration_type check (
    (
      (
        (expires_in_days is null)
        and (expires_on_date is null)
      )
      or (
        (expires_in_days is not null)
        and (expires_on_date is null)
      )
      or (
        (expires_in_days is null)
        and (expires_on_date is not null)
      )
    )
  ),
  constraint trainings_category_check check (
    (
      category = any (
        array[
          'volunteer'::text,
          'board_member'::text,
          'both'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_trainings_category on public.trainings using btree (category) TABLESPACE pg_default;