# LifeOS – agent notes

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo code.

## What this is
Personal life-organizer + gamification app (habits, tasks, calendar, workouts, meals, point ledger, reward shop).
Single user, Android first, local-first (no backend). Full spec: [docs/SPEC.md](docs/SPEC.md) – it is the source of truth for schema, point rules and roadmap.

## Stack
Expo SDK 57 · Expo Router · TypeScript strict · NativeWind 4 (Tailwind 3) · expo-sqlite + Drizzle ORM · TanStack Query · Zustand · zod · date-fns · Vitest.

## Hard rules
- `src/domain/**` is PURE TypeScript: no React, no React Native, no Expo imports. It is unit-tested with Vitest (`npm test`) and must stay ≥90% covered.
- Every point change goes through `src/domain/points` + the `point_ledger` table. The ledger is append-only: never UPDATE/DELETE a row, reverse with a compensating entry.
- One user action = one SQLite transaction (log row + ledger row together).
- Design tokens live only in `design-tokens.js` (consumed by `tailwind.config.js` and `src/ui/tokens.ts`); use `className`, fall back to `palette()` only for props that cannot take a class.
- Talk to the user in Hungarian, write code/comments/commits in English.

## Commands
- `npm start` – Expo dev server (scan with Expo Go on Android)
- `npm run android` – native dev build / emulator
- `npm run typecheck` · `npm test` · `npm run test:coverage`
- `npm run db:generate` – after editing `src/db/schema.ts`, regenerates `src/db/migrations/*` (commit the output)
- `npx expo export --platform android` – verifies the Metro/Babel/NativeWind chain without a device
- **Web preview** (no device needed): `npx expo export --platform web --output-dir dist-web` then `node scripts/serve-web-dist.js` → http://localhost:3000. Must be a production export: expo-sqlite on web runs in a worker chunk that `expo start` (single bundle) cannot emit. The static server adds the COOP/COEP headers SharedArrayBuffer needs. `patches/expo-sqlite+57.0.2.patch` (applied by `postinstall`) fixes the web sync bridge truncating results longer than 255 bytes – keep it until upstream fixes `WorkerChannel.ts`.
- `Alert` is a no-op on web: use `notify()`/`confirm()` from `src/ui/notify.ts`, never `Alert.alert` directly.

## Layout
- `app/` routes (Expo Router), `app/(tabs)/` the 5 tabs: index=Ma, calendar, workout, meals, rewards
- `src/db/` schema, client, seed, migrations · `src/domain/` business rules · `src/features/` per-feature hooks+UI · `src/ui/` primitives
- `tests/domain/` Vitest suites; `tests/helpers/db.ts` builds a real sql.js SQLite with the migrations + a deterministic `DomainCtx`
- Domain functions take a `DomainCtx` (db, userId, settings, now(), uuid()) – never import `src/db/client` from `src/domain`
