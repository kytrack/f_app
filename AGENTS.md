# LifeOS – agent notes

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo code.

## What this is
Personal life-organizer + gamification app (habits, tasks, calendar, workouts, meals, point ledger, reward shop).
Single user, Android first, local-first (no backend). Full spec: [docs/SPEC.md](docs/SPEC.md) – it is the source of truth for schema, point rules and roadmap.

## Stack
Expo SDK 57 · Expo Router · TypeScript strict · NativeWind 4 (Tailwind 3) · expo-sqlite + Drizzle ORM · TanStack Query · Zustand · zod · date-fns · Vitest.

## Hard rules
- `src/domain/**` is PURE TypeScript: no React, no React Native, no Expo imports. It is unit-tested with Vitest (`npm test`) and must stay ≥90% covered.
- Every point change goes through `src/domain/points` + the `point_ledger` table. The ledger is append-only: never UPDATE/DELETE a row, reverse with a compensating entry. The only exception is `wipeData()` in `src/domain/admin.ts` (the confirmed danger-zone reset).
- NEVER hard-code a point value, streak threshold or percentage: read it from `ctx.settings.rules` in the domain and `useRules()` in the UI. Defaults and ranges live in `src/domain/points/config.ts`; a new rule needs a default, a range and a field in `app/admin/rules.tsx`.
- One user action = one SQLite transaction (log row + ledger row together).
- Design tokens live only in `design-tokens.js` (consumed by `tailwind.config.js` and `src/ui/tokens.ts`); use `className`, fall back to `palette()` only for props that cannot take a class.
- Talk to the user in Hungarian, write code/comments/commits in English.

## Commands
- `npm start` – Expo dev server (scan with Expo Go on Android)
- `npm run android` – native dev build / emulator
- `npm run typecheck` · `npm test` · `npm run test:coverage`
- `npm run db:generate` – after editing `src/db/schema.ts`, regenerates `src/db/migrations/*` (commit the output)
- `npx expo export --platform android` – verifies the Metro/Babel/NativeWind chain without a device
- Phone install + fast updates: see `docs/PHONE.md` (Expo Go for live reload; `npm run phone:build` = EAS APK, `npm run phone:update -- "msg"` = OTA update on the `preview` channel). JS-only changes ship via OTA; native changes need a new build.
- **Web preview** (no device needed): `npx expo export --platform web --output-dir dist-web` then `node scripts/serve-web-dist.js` → http://localhost:3000. Must be a production export: expo-sqlite on web runs in a worker chunk that `expo start` (single bundle) cannot emit. The static server adds the COOP/COEP headers SharedArrayBuffer needs. `patches/expo-sqlite+57.0.2.patch` (applied by `postinstall`) fixes the web sync bridge truncating results longer than 255 bytes – keep it until upstream fixes `WorkerChannel.ts`.
- Notifications: the plan lives in `src/domain/notifications.ts` (pure, tested); `src/notifications/scheduler.ts` only diffs it against the OS queue by `data.key`. Never schedule notifications anywhere else. NEVER `import` expo-notifications at module scope (type-only imports are fine): since SDK 53 it throws on import inside Expo Go on Android. Always go through `getNotifications()` in `src/notifications/module.ts`, which returns null on web and in Expo Go on Android.
- Two day concepts: habits/day-close/summary use the LOGICAL day (`todayKey`, 04:00 start); events and the calendar tab use the CALENDAR day (`calendarKeyFor`). Do not mix them.
- Recurring tasks are templates (`recurrence` set) + generated instances (`parent_task_id`); lists must filter `recurrence IS NULL`.
- Workouts: `src/domain/workouts.ts` (plans → sessions → set_logs; points only in `finishSession`). Meals: `src/domain/meals.ts` (templates → weekly plan → snapshot logs; kcal points only in day close). Settings edits must go through `useSettingsActions` so the DomainCtx snapshot is rebuilt.
- Celebrations: push to `src/store/celebration.ts` (`celebrate()`), never render your own overlay. Level-ups are detected in `useDomainMutation`, perfect days in `useDayClose`.
- Stats are read-only aggregations in `src/domain/stats.ts`; charts are the View-based ones in `src/ui/charts.tsx` (no chart library).
- Backup/restore lives in `src/backup/backup.ts` (native only); restore requires an app restart because the open connection and the DomainCtx snapshot point at the old file.
- Notification intensity (nudges, capture prompts, quiet hours, toggles) is data in `settings` and read through `ctx.settings`; the plan in `src/domain/notifications.ts` is the only consumer. `/capture` is the quick-capture sheet; `/admin/*` are the management screens.
- Admin: `src/domain/admin.ts` (full listings incl. archived, restore, rules, profile, manual adjust, wipe) + `src/features/admin/useAdmin.ts` + `app/admin/*`. Every new entity needs a row in `/admin` and a management screen. Module tabs are hidden via `settings.mod*` in `app/(tabs)/_layout.tsx`.
- Fixed daily meals are a VIEW over the weekly plan (`fixedMeals`/`addFixedMeal`/`setFixedMealDays` in `src/domain/meals.ts`), not a new table. Any code that removes plan items must go through `dropPendingLogs` so un-eaten rows from today on disappear too. `NutritionSummary` + `MealRow` are shared by the Kaja tab and the home card.
- Challenges ("dobás"): `src/domain/challenges.ts`; a drawn challenge becomes a normal task with `challenge_id`, so all task scoring applies. Randomness must go through `ctx.random()` (deterministic in tests). The daily prompt hook runs before the capture prompt, which yields to it.
- `Alert` is a no-op on web: use `notify()`/`confirm()` from `src/ui/notify.ts`, never `Alert.alert` directly.

## Layout
- `app/` routes (Expo Router), `app/(tabs)/` the 5 tabs: index=Ma, calendar, workout, meals, rewards
- `src/db/` schema, client, seed, migrations · `src/domain/` business rules · `src/features/` per-feature hooks+UI · `src/ui/` primitives
- `tests/domain/` Vitest suites; `tests/helpers/db.ts` builds a real sql.js SQLite with the migrations + a deterministic `DomainCtx`
- Domain functions take a `DomainCtx` (db, userId, settings, now(), uuid()) – never import `src/db/client` from `src/domain`
