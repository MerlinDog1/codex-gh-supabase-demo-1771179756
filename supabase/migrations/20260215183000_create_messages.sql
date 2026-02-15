create table if not exists public.messages (
  id bigint generated always as identity primary key,
  content text not null,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

do $$ begin
  create policy "public read" on public.messages for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public insert" on public.messages for insert with check (true);
exception when duplicate_object then null; end $$;
