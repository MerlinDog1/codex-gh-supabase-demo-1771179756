# Neon Guestbook Live (Supabase + GitHub Pages)

A polished realtime guestbook demo built from the original placeholder scaffold.

## What changed

- Modern neon/glassmorphism design
- Realtime feed via Supabase `postgres_changes`
- Nickname + mood + message composer
- Search + sort controls
- Local preference persistence (`localStorage`)
- Safe rendering (HTML escaped)
- Backward compatible with existing plain-text rows

## Database schema (already applied)

```sql
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  content text not null,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

create policy "public read" on public.messages for select using (true);
create policy "public insert" on public.messages for insert with check (true);
```

## Run locally

Use any static server, e.g.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy

The repo is configured for GitHub Pages from `main` branch root.

Expected URL:

`https://merlindog1.github.io/codex-gh-supabase-demo-1771179756/`
