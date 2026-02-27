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

## Gemini API (secure proxy via Supabase Edge Function)

A secure function was added at:

`supabase/functions/gemini-proxy/index.ts`

This keeps `GEMINI_API_KEY` server-side (never exposed in frontend JS).

### Deploy steps

```bash
supabase secrets set GEMINI_API_KEY=YOUR_KEY_HERE
supabase functions deploy gemini-proxy
```

## Trace + Upscale Relay Edge Functions

Added functions:

- `supabase/functions/trace-svg/index.ts`
- `supabase/functions/upscale-image/index.ts`

These functions provide the Ted mockup pipeline contract:

- `trace-svg` expects `{ imageBase64, mimeType, style, traceDetail, output }` and returns `{ svg }`
- `upscale-image` expects `{ imageBase64, mimeType, scale }` and returns `{ bytesBase64Encoded, mimeType }`

Because Supabase Edge Runtime cannot reliably host local Python tracing/upscale stacks directly, both are implemented as secure relays to external services.

### Foundry backend (exact V8 trace script)

A production-ready backend scaffold is included at:

- `tools/foundry-backend/app.py`

It provides:

- `POST /trace` → runs your exact `pro_foundry_v8.py`
- `POST /upscale` → 2× upscale (Pillow/Lanczos)

Run it:

```bash
cd tools/foundry-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env (token + TRACE_SCRIPT_PATH)
set -a; source .env; set +a
python3 app.py
```

### Required Supabase secrets

```bash
supabase secrets set TRACE_BACKEND_URL=https://your-backend.example/trace
supabase secrets set TRACE_BACKEND_TOKEN=replace_with_trace_service_bearer_token
supabase secrets set UPSCALE_BACKEND_URL=https://your-backend.example/upscale
supabase secrets set UPSCALE_BACKEND_TOKEN=replace_with_upscale_service_bearer_token
```

If any relay secret is missing, the function returns HTTP `501` with a clear configuration error.

### Deploy

```bash
supabase functions deploy trace-svg
supabase functions deploy upscale-image
```

### Optional quick test

```bash
curl -i https://<project-ref>.functions.supabase.co/trace-svg \
  -H 'content-type: application/json' \
  --data '{"imageBase64":"...","mimeType":"image/png","style":"crosshatch","traceDetail":"4K","output":"svg"}'

curl -i https://<project-ref>.functions.supabase.co/upscale-image \
  -H 'content-type: application/json' \
  --data '{"imageBase64":"...","mimeType":"image/png","scale":2}'
```

### Call from frontend

```js
const res = await fetch('https://wbtpizrlayiedgwrtpwl.functions.supabase.co/gemini-proxy', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // optional if function is public; include if you enforce auth
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({ prompt: 'Write a short tagline for a CNC vector app' })
});
const data = await res.json();
console.log(data.text);
```
