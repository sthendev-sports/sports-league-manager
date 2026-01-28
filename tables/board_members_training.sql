create table public.board_member_trainings (
  id uuid not null default gen_random_uuid (),
  board_member_id uuid not null,
  training_id uuid not null,
  completed_date date null,
  status text null default 'pending'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint board_member_trainings_pkey primary key (id),
  constraint board_member_trainings_board_member_id_training_id_key unique (board_member_id, training_id),
  constraint board_member_trainings_board_member_id_fkey foreign KEY (board_member_id) references board_members (id) on delete CASCADE,
  constraint board_member_trainings_training_id_fkey foreign KEY (training_id) references trainings (id) on delete CASCADE,
  constraint board_member_trainings_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'completed'::text,
          'expired'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_board_member_trainings_board_member_id on public.board_member_trainings using btree (board_member_id) TABLESPACE pg_default;

create index IF not exists idx_board_member_trainings_training_id on public.board_member_trainings using btree (training_id) TABLESPACE pg_default;