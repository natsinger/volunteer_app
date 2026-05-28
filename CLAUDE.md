# CLAUDE.md — volunteer_app

Project-specific instructions. These layer on top of `../CLAUDE.md`.

## Defaults

- **Default contact / admin email:** `info@pnimeet.org.il` (two 'e's).
  - Use this for super admin bootstrap, default "from" / "reply-to", and any placeholder admin email in SQL or docs.
  - The domain is `pnimeet.org.il` (double 'e') — confirmed against the real Supabase Auth user and the `noreply@pnimeet.org.il` sender in `supabase/functions/monthly-reminders/index.ts`.

## Lessons Learned

- The project domain is `pnimeet.org.il` (double 'e'). The codebase previously contained ~28 occurrences of the single-'e' typo `pnimet.org.il`, all swept to the correct spelling. If you ever see `pnimet` (one 'e') reappear, it's a typo — fix it.
