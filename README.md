# بطاقات رصين

Private flashcard app (PWA) with spaced repetition, offline study and an admin panel.

- `app/` — the website (Vite + React). Admin panel lives at `/#admin`.
- `supabase/setup.sql` — paste into Supabase → SQL Editor → Run.

## Vercel settings
- Root Directory: `app`
- Environment variables:
  - `VITE_SUPABASE_URL` — Supabase → Project Settings → API → Project URL
  - `VITE_SUPABASE_ANON_KEY` — Supabase → Project Settings → API → anon public key
