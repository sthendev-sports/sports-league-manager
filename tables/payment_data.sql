create table public.payment_data (
  id uuid not null default extensions.uuid_generate_v4 (),
  order_no character varying(100) null,
  order_date date null,
  account_first_name character varying(255) null,
  account_last_name character varying(255) null,
  player_first_name character varying(255) null,
  player_last_name character varying(255) null,
  program_name character varying(255) null,
  division_name character varying(255) null,
  team_name character varying(255) null,
  order_detail_description character varying(255) null,
  order_item_amount_paid numeric(10, 2) null,
  orders_order_notes text null,
  admin_account_notes text null,
  user_id character varying(100) null,
  division_id character varying(100) null,
  player_id character varying(100) null,
  imported_at timestamp with time zone null default timezone ('utc'::text, now()),
  season_id uuid null,
  constraint payment_data_pkey primary key (id),
  constraint payment_data_season_id_fkey foreign KEY (season_id) references seasons (id)
) TABLESPACE pg_default;

create index IF not exists idx_payment_data_order_no on public.payment_data using btree (order_no) TABLESPACE pg_default;

create index IF not exists idx_payment_data_player_name on public.payment_data using btree (player_first_name, player_last_name) TABLESPACE pg_default;