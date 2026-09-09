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
- Design tokens live only in `tailwind.config.js`; use `className`, not inline colors.
- Talk to the user in Hungarian, write code/comments/commits in English.

## Commands
- `npm start` – Expo dev server (scan with Expo Go on Android)
- `npm run android` – native dev build / emulator
- `npm run typecheck` · `npm test` · `npm run test:coverage`
- `npm run db:generate` – after editing `src/db/schema.ts`, regenerates `src/db/migrations/*` (commit the output)
- `npx expo export --platform android` – verifies the Metro/Babel/NativeWind chain without a device

## Layout
- `app/` routes (Expo Router), `app/(tabs)/` the 5 tabs: index=Ma, calendar, workout, meals, rewards
- `src/db/` schema, client, seed, migrations · `src/domain/` business rules · `src/features/` per-feature hooks+UI · `src/ui/` primitives
- `tests/domain/` Vitest suites
