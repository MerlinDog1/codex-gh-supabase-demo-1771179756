# Supabase Minimal Starter

## 1) Create table
Run in Supabase SQL editor:

```sql
create table if not exists messages (
  id bigint generated always as identity primary key,
  content text not null,
  created_at timestamptz default now()
);

alter table messages enable row level security;

create policy "public read" on messages for select using (true);
create policy "public insert" on messages for insert with check (true);
```

## 2) Configure app
Edit `index.html` and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3) Run
Open `index.html` in a browser (or use a local static server). Click **Save** and **Load**.