begin;

create table if not exists public.pickleball_registrations (
  id uuid primary key,

  created_at timestamptz not null default now(),

  team_name text,
  division text not null,
  dupr_bracket text not null,

  form_data jsonb not null,

  fee_due_php integer not null default 1000,
  payment_status text not null default 'unpaid',

  constraint pickleball_division_check
    check (
      division in (
        'Men''s Doubles',
        'Women''s Doubles',
        'Mixed Doubles'
      )
    ),

  constraint pickleball_bracket_check
    check (
      dupr_bracket in (
        'Below 3.0',
        '3.0 – 3.49',
        '3.5 – 3.99',
        '4.0 and above',
        'No DUPR rating yet'
      )
    ),

  constraint pickleball_form_data_check
    check (
      jsonb_typeof(form_data) = 'object'
    ),

  constraint pickleball_payment_status_check
    check (
      payment_status in (
        'unpaid',
        'paid',
        'refunded'
      )
    ),

  constraint pickleball_fee_check
    check (
      fee_due_php >= 0
    )
);

create index if not exists
  pickleball_registrations_created_idx
on public.pickleball_registrations (
  created_at desc
);

alter table public.pickleball_registrations
  enable row level security;

revoke all privileges
on table public.pickleball_registrations
from public, anon, authenticated;

grant usage
on schema public
to service_role;

grant select, insert, update
on table public.pickleball_registrations
to service_role;

commit;