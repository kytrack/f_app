# LifeOS – személyes életviteli és napi szervező app (rendszerterv)

> Verzió: 0.1 · Dátum: 2026-09-09 · Státusz: mind a 4 fázis lényegi része kész; telefonos próba és finomhangolás következik
> Célközönség: egyetlen felhasználó (saját használat), később opcionális szinkron/biztonsági mentés.

---

## 0. Döntési összefoglaló (TL;DR)

| Kérdés | Döntés |
|---|---|
| **Ajánlott stack** | **Expo (React Native) + TypeScript + Expo Router + NativeWind + expo-sqlite/Drizzle + expo-notifications** – *local-first*, backend nélkül indul |
| Miért nem Next.js + Supabase PWA elsőre | A napi emlékeztetők PWA-ban szerver oldali push-pipeline-t igényelnek, iOS-en csak Home Screen-re telepített PWA-ban működnek. Expo-ban a helyi ütemezett értesítés 10 sor, szerver nélkül. |
| Backend | **MVP-ben nincs.** Fázis 4-ben opcionális: a saját `webdev-standards` blueprint (Express + titkosított SQLite) *sync/backup* szerverként, vagy Supabase. Az adatmodell erre előkészítve (`id` = UUID, `updated_at`, `deleted_at`). |
| Pontrendszer | Append-only **pontfőkönyv** (`point_ledger`); egyenleg = Σ delta. Két szám: **balance** (elkölthető, 0 padló) és **xp** (életszintű, csak nő → szint). |
| Streak | Mérföldkő-bónusz (7/30/100 nap) + szorzó tier (×1.0 / ×1.25 / ×1.5). Rossz szokásnál visszaesés = streak reset + büntetés. |
| Napzárás | Idempotens `closeDay(date)` job az első app-megnyitáskor a `day_start_hour` után: mulasztások, lejárt teendők, kcal cél, streak frissítés, `daily_summary`. |

**Döntés (2026-09-09): Android.** → Expo út véglegesítve, lokális APK build, nulla költség. Az alábbi mérlegelés csak archívum:
- **Android** → Expo, APK lokálisan buildelhető, nulla költség.
- **iPhone** → Expo fejlesztéshez az Expo Go app elég, de a saját telefonra telepítéshez Apple Developer fiók kell (99 USD/év), vagy ingyenes fiókkal hetente újra kell signolni. Ha ez nem opció → **B terv: Vite PWA + saját Express backend** (lásd 1.3).

---

## 1. Tech stack

### 1.1 Ajánlott: Expo (React Native), local-first

| Réteg | Választás | Indok |
|---|---|---|
| Runtime | **Expo SDK (legfrissebb stabil), React Native, TypeScript strict** | React + TSX, natív értesítések, Expo Go-val azonnali fejlesztés telefonon |
| Navigáció | **Expo Router** (file-based, tabs + stack) | Next.js-szerű mentális modell, deep link ingyen (értesítésből megnyitás) |
| Stílus | **NativeWind v4** (Tailwind szintaxis RN-en) | A meglévő Tailwind-tudás átvihető |
| UI primitívek | saját komponensek + `react-native-reanimated` + `expo-haptics` | Pipálás-animáció, konfetti, haptika = a gamifikáció "érzete" |
| Adatbázis | **expo-sqlite + Drizzle ORM** (típusos séma, migrációk) | Offline, gyors, nincs infra. SQLite-tudás a blueprintből újrahasznosul |
| Állapot | **Zustand** (UI állapot) + **TanStack Query** (DB-lekérdezések cache-elése, invalidáció) | Kevés boilerplate; a Query a repository réteg felett ül |
| Validáció | **zod** (form + DB-be írás előtti input) | Ugyanaz, mint a blueprintben |
| Értesítés | **expo-notifications** – helyi ütemezett (napi ismétlődő, konkrét időpont) | Nincs szerver, nincs push token. Távoli push csak akkor kell, ha később szerver küld |
| Háttér | **expo-task-manager + expo-background-fetch** (best-effort napzárás) | Nem garantált; a napzárás ezért mindig app-megnyitáskor is fut |
| Dátum | **date-fns** + `date-fns-tz` | Kicsi, tree-shakeable |
| Grafikon | **victory-native** (Skia) vagy `react-native-gifted-charts` | Fázis 4 |
| Teszt | **Vitest** (üzleti logika: pontszámítás, streak, napzárás – tiszta TS) + **Jest/RNTL** (komponens) | A pont-motor **UI-független modul**, ezért teljesen unit-tesztelhető |
| Build/telepítés | `npx expo run:android` (lokális APK) vagy **EAS Build** (ingyenes tier) | iOS: EAS Build + TestFlight |
| Backup (F4) | `expo-file-system` + `expo-sharing`: titkosított SQLite export → Drive/Files | Szerver nélküli mentés |

**Miért local-first:** egy felhasználó, személyes adat, offline metrón is pipálni kell. A "never trust the client" szabály itt nem sérül: a kliens *maga a megbízott felhasználó*. Ha később többeszközös szinkron kell, a főkönyv (append-only) és az UUID-k miatt a merge egyszerű.

### 1.2 Mikor Next.js + Supabase?
Ha **asztali gépen is** akarod használni, és vállalod, hogy az emlékeztetők Web Push-on mennek (Supabase Edge Function + `pg_cron` + VAPID). iOS-en csak Home Screen PWA-ban működik a push. Fejlesztési sebességben egyenrangú, de az értesítés-pipeline +2–3 nap.

### 1.3 B terv: Vite PWA + saját Express backend (a blueprinted)
- Frontend: Vite + React + TS strict + Tailwind (blueprint `frontend-conventions.md`), `vite-plugin-pwa`.
- Backend: Express + `better-sqlite3-multiple-ciphers` Piscina poolban, jose JWT + refresh rotation (blueprint), **web-push** csomag VAPID kulcsokkal, `node-cron` a reminder-ek kiküldésére.
- Előny: a saját, auditált mintáidra épül; asztali + mobil egyszerre; nincs App Store.
- Hátrány: szerver kell (VPS/Docker), iOS push korlátok, nincs natív haptika/widget.
- Ha ezt választod: a pontfőkönyv írása és a jutalombeváltás **kritikus végpont** → `transaction-endpoints.md` 5-pass checklist.

**Az adatmodell, a pontlogika és a roadmap mindkét úton azonos** – csak a perzisztencia-réteg cserélődik.

---

## 2. Architektúra (Expo, local-first)

```
app/                         # Expo Router
  (tabs)/
    index.tsx                # "Ma" – napi dashboard (szokások + teendők + pont)
    calendar.tsx             # Naptár (napi/heti)
    workout.tsx              # Edzésnapló
    meals.tsx                # Étkezés / kcal
    rewards.tsx              # Jutalombolt + pont-történet
  habit/[id].tsx, task/[id].tsx, event/[id].tsx, ...   # részletek / szerkesztés
  _layout.tsx                # providers: QueryClient, DB init, notifications
src/
  db/
    schema.ts                # Drizzle séma (a 3. fejezet)
    migrations/              # drizzle-kit generált SQL
    client.ts                # expo-sqlite kapcsolat, PRAGMA-k (WAL, foreign_keys=ON)
    repo/                    # egy fájl per entitás: habits.repo.ts, tasks.repo.ts ...
  domain/                    # TISZTA TS, nincs RN import → Vitest
    points/
      rules.ts               # pontszabályok, konstansok
      ledger.ts              # award(), penalize(), reverse(), balance(), redeem()
      streak.ts              # streak / multiplier / milestone
    dayClose.ts              # closeDay(date) orchestrator
    recurrence.ts            # RRULE-light kiértékelés (napok maszkja, heti N-szer)
  features/                  # feature-onkénti hook + komponens
    habits/ tasks/ calendar/ workout/ meals/ rewards/
  notifications/
    scheduler.ts             # reconcile(): DB → OS ütemezés szinkronizálása
  store/                     # Zustand (UI-only állapot)
  ui/                        # design tokens, primitívek (Checkbox, Card, ProgressRing)
tests/
  domain/*.test.ts
```

**Kulcs elv:** minden pontváltozás **kizárólag** a `domain/points/ledger.ts` függvényein keresztül történik, és minden bejegyzés a `point_ledger` táblába ír. UI sosem számol pontot.

---

## 3. Adatbázis-séma

Konvenciók: `id TEXT` (UUID v7 – időrendben rendezhető), `created_at`/`updated_at` ISO-8601 UTC, `deleted_at` soft delete (sync miatt), dátumok naptári napra `date TEXT 'YYYY-MM-DD'` a **helyi** napkezdet szerint (`settings.day_start_hour`, default 4:00 – az éjfél utáni pipa még az előző naphoz tartozik).

### 3.1 ER-áttekintés

```
users 1──∞ habits 1──∞ habit_logs
      1──∞ tasks
      1──∞ events 1──∞ event_reminders
      1──∞ workout_plans 1──∞ workout_plan_exercises ∞──1 exercises
      1──∞ workout_sessions 1──∞ set_logs
      1──∞ meal_templates
      1──∞ meal_plan_items ∞──1 meal_templates
      1──∞ meal_logs ∞──1 meal_templates
      1──∞ rewards 1──∞ reward_redemptions ──1 point_ledger
      1──∞ point_ledger   (polimorf ref: ref_type + ref_id)
      1──∞ daily_summaries
      1──∞ scheduled_notifications (polimorf ref)
      1──1 settings
```

### 3.2 Táblák

```sql
-- Egy sor lesz benne, de a sync miatt marad.
CREATE TABLE users (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  day_start_hour INTEGER NOT NULL DEFAULT 4,
  timezone TEXT NOT NULL,                        -- IANA, pl. Europe/Budapest
  kcal_target INTEGER, protein_g INTEGER, carbs_g INTEGER, fat_g INTEGER,
  kcal_tolerance_pct INTEGER NOT NULL DEFAULT 10,
  edit_grace_hours INTEGER NOT NULL DEFAULT 48,  -- visszamenőleg ennyi óráig pipálható
  updated_at TEXT NOT NULL
);

-- ---------- 1. Szokások ----------
CREATE TABLE habits (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, icon TEXT, color TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('good','bad')),
  -- ütemezés
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily','weekdays','times_per_week')),
  weekday_mask INTEGER NOT NULL DEFAULT 127,     -- bit0=hétfő … bit6=vasárnap
  times_per_week INTEGER,                        -- schedule_type='times_per_week'
  target_count INTEGER NOT NULL DEFAULT 1,       -- pl. víz: 8 (pohár)
  unit TEXT,                                     -- 'pohár', 'oldal', 'perc'
  -- pontozás (felülírhatja a globális defaultot)
  points_success INTEGER NOT NULL DEFAULT 10,    -- good: teljesített nap; bad: tiszta nap
  points_penalty INTEGER NOT NULL DEFAULT 5,     -- good: mulasztás; bad: visszaesés (×2 a szabályban)
  -- denormalizált streak (a napzárás tartja karban)
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_success_date TEXT,
  streak_started_on TEXT,                        -- bad habit: "X napja mentes" innen számol
  reminder_time TEXT,                            -- 'HH:MM' vagy NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT, deleted_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE habit_logs (
  id TEXT PRIMARY KEY, habit_id TEXT NOT NULL REFERENCES habits(id),
  date TEXT NOT NULL,                            -- 'YYYY-MM-DD' (helyi nap)
  count INTEGER NOT NULL DEFAULT 0,              -- good: hányszor; bad: relapse-ok száma
  status TEXT NOT NULL CHECK (status IN ('pending','done','missed','skipped','relapse')),
  note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (habit_id, date)
);
CREATE INDEX idx_habit_logs_date ON habit_logs(date);

-- ---------- 1b. Teendők ----------
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, notes TEXT,
  due_at TEXT,                                   -- ISO datetime vagy NULL (bármikor)
  priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),  -- 1 alacsony … 3 magas
  points INTEGER,                                -- NULL → priority alapján (5/10/20)
  recurrence TEXT,                               -- JSON RRULE-light vagy NULL (egyszeri)
  parent_task_id TEXT REFERENCES tasks(id),      -- ismétlődő sablon → generált példány
  completed_at TEXT,
  overdue_penalized_at TEXT,                     -- egyszer büntetünk
  deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_due ON tasks(due_at) WHERE completed_at IS NULL;

-- ---------- 2. Naptár ----------
CREATE TABLE events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, notes TEXT, location TEXT,
  start_at TEXT NOT NULL, end_at TEXT, all_day INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT,                               -- JSON RRULE-light
  color TEXT, linked_task_id TEXT REFERENCES tasks(id),
  deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_events_start ON events(start_at);

CREATE TABLE event_reminders (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  offset_minutes INTEGER NOT NULL                -- 0, 15, 60, 1440 …
);

-- Az OS-ben ütemezett értesítések tükre → reconcile()-hoz
CREATE TABLE scheduled_notifications (
  id TEXT PRIMARY KEY,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('habit','task','event','day_close')),
  ref_id TEXT NOT NULL,
  fire_at TEXT NOT NULL,
  os_notification_id TEXT,                       -- expo-notifications identifier
  status TEXT NOT NULL CHECK (status IN ('scheduled','fired','cancelled')),
  UNIQUE (ref_type, ref_id, fire_at)
);

-- ---------- 3. Edzés ----------
CREATE TABLE exercises (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, muscle_group TEXT, is_bodyweight INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE workout_plans (                     -- pl. "A nap – Mell/Tricepsz"
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, weekday_mask INTEGER NOT NULL DEFAULT 0,  -- melyik napokra tervezett
  points_complete INTEGER NOT NULL DEFAULT 30,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE workout_plan_exercises (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  sort_order INTEGER NOT NULL,
  target_sets INTEGER NOT NULL, target_reps INTEGER NOT NULL, target_weight_kg REAL
);

CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT REFERENCES workout_plans(id),
  date TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  completion_pct INTEGER,                        -- done szettek / tervezett szettek
  note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_date ON workout_sessions(date);

CREATE TABLE set_logs (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  set_index INTEGER NOT NULL,
  weight_kg REAL, reps INTEGER, done INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, exercise_id, set_index)
);

-- ---------- 4. Étkezés ----------
CREATE TABLE meal_templates (                    -- fix ételek / menük
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, kcal INTEGER NOT NULL,
  protein_g REAL, carbs_g REAL, fat_g REAL,
  default_slot TEXT CHECK (default_slot IN ('breakfast','lunch','dinner','snack')),
  archived_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE meal_plan_items (                   -- heti sablon: hétfő reggeli = X
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  slot TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES meal_templates(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE meal_logs (                         -- napi példány (a tervből generált + ad hoc)
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL, slot TEXT NOT NULL,
  template_id TEXT REFERENCES meal_templates(id),
  name_snapshot TEXT NOT NULL, kcal_snapshot INTEGER NOT NULL,   -- sablon módosítás ne írja át a múltat
  protein_snapshot REAL, carbs_snapshot REAL, fat_snapshot REAL,
  eaten INTEGER NOT NULL DEFAULT 0, planned INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_meal_logs_date ON meal_logs(date);

-- ---------- 5. Gamifikáció ----------
CREATE TABLE point_ledger (                      -- APPEND-ONLY. Sosem UPDATE/DELETE.
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,                        -- +/- pont
  reason TEXT NOT NULL CHECK (reason IN (
    'habit_done','habit_missed','bad_habit_clean_day','bad_habit_relapse',
    'task_done','task_overdue','workout_done','kcal_goal_hit','kcal_goal_missed',
    'streak_milestone','perfect_day','reward_redeem','reversal','manual_adjust')),
  ref_type TEXT, ref_id TEXT,                    -- polimorf hivatkozás (habit_log, task, session, …)
  reverses_id TEXT REFERENCES point_ledger(id),  -- sztornó: melyik bejegyzést semlegesíti
  date TEXT NOT NULL,                            -- melyik naphoz tartozik
  multiplier REAL NOT NULL DEFAULT 1.0,          -- audit: mivel szoroztunk
  note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_ledger_date ON point_ledger(date);
CREATE INDEX idx_ledger_ref ON point_ledger(ref_type, ref_id);
-- Egyediség: egy ref-re egy okból egy nap csak egy aktív (nem sztornózott) jóváírás.
CREATE UNIQUE INDEX uq_ledger_once ON point_ledger(ref_type, ref_id, reason, date)
  WHERE reverses_id IS NULL AND reason NOT IN ('reversal','manual_adjust','reward_redeem');

CREATE TABLE rewards (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, description TEXT, icon TEXT,
  cost INTEGER NOT NULL CHECK (cost > 0),
  repeatable INTEGER NOT NULL DEFAULT 1,         -- 0 = egyszeri (pl. "új cipő")
  cooldown_days INTEGER,                         -- pl. mozi max hetente
  archived_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE reward_redemptions (
  id TEXT PRIMARY KEY, reward_id TEXT NOT NULL REFERENCES rewards(id),
  cost_snapshot INTEGER NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES point_ledger(id),
  redeemed_at TEXT NOT NULL, fulfilled_at TEXT   -- "beváltottam" vs "tényleg elmentem moziba"
);

CREATE TABLE daily_summaries (                   -- napzárás eredménye, dashboard/statisztika innen olvas
  user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL,
  habits_scheduled INTEGER NOT NULL, habits_done INTEGER NOT NULL,
  tasks_due INTEGER NOT NULL, tasks_done INTEGER NOT NULL,
  workout_done INTEGER NOT NULL DEFAULT 0,
  kcal_target INTEGER, kcal_eaten INTEGER, kcal_goal_hit INTEGER,
  points_earned INTEGER NOT NULL, points_lost INTEGER NOT NULL,
  perfect_day INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
```

### 3.3 Származtatott értékek (nem tároljuk, vagy csak cache-ként)
- `balance = Σ delta` – a főkönyv mehet negatívba; a **spendable** = `max(0, balance)`.
- `xp = Σ delta WHERE delta > 0 AND reason != 'reversal'` – életszint, csak nő.
- `level = floor(sqrt(xp / 100))` → 100 xp = 1. szint, 400 = 2., 900 = 3., 10 000 = 10. (kezdetben gyors, később lassul).
- Szokás heti teljesítés %, edzés-progresszió (max súly / gyakorlat): SQL aggregációk, TanStack Query cache.

---

## 4. Logikai és pontozási rendszer

### 4.1 Alapértékek (`domain/points/rules.ts`)

| Esemény | Pont | Megjegyzés |
|---|---|---|
| Jó szokás teljesítve (target elérve) | **+10** × szorzó | részteljesítés (pl. 5/8 pohár) → arányos, lefelé kerekítve, csak 50% felett |
| Jó szokás mulasztva (napzáráskor, ütemezett napon) | **−5** | `habits.points_penalty` |
| Rossz szokás – tiszta nap (napzáráskor, nincs relapse) | **+15** × szorzó | passzív jóváírás, nem kell pipálni |
| Rossz szokás – visszaesés (user rögzíti) | **−2 × penalty = −10** | streak → 0, `best_streak` marad. Több relapse egy napon: mindegyik −10, de max −30/nap |
| Teendő kész, határidőn belül | **+5 / +10 / +20** (prio 1/2/3) | `tasks.points` felülírja |
| Teendő kész, határidő után | a fenti **50%-a** | késve is jobb, mint sosem |
| Teendő lejárt (napzárás, még nincs kész) | **−5** egyszer | `overdue_penalized_at` védi az ismétlést |
| Edzés befejezve, legalább 80% szett | **+30** (`plan.points_complete`) | 50–79%: fele; 50% alatt: 0 |
| Kcal cél teljesült (±tolerancia%) | **+20** | csak ha legalább 1 étel pipálva volt (üres nap nem siker) |
| Kcal cél túllépve a tolerancián túl | **−10** | alullét nem büntet (nem akarunk éhezésre ösztönözni) |
| Streak mérföldkő 7 / 30 / 100 nap | **+25 / +100 / +500** | szokásonként, egyszer per mérföldkő per streak |
| Perfect day (minden ütemezett szokás + minden esedékes teendő) | **+25** | napzáráskor |
| Jutalom beváltás | **−cost** | csak ha `spendable >= cost` |

Egy átlagos nap 4 szokással, 2 teendővel, edzéssel és kcal-céllal kb. **100–150 pont**. Ez a **kalibrációs alap** a jutalmak árazásához.

### 4.2 Streak és szorzó (`domain/points/streak.ts`)

```ts
// A streak csak ÜTEMEZETT napokon nő/törik. Nem ütemezett nap (pl. hétvége) átlátszó.
export function multiplierFor(streak: number): number {
  if (streak >= 30) return 1.5;
  if (streak >= 7)  return 1.25;
  return 1.0;
}
export const MILESTONES = [7, 30, 100] as const;   // bónusz: 25, 100, 500

// Napzáráskor, minden szokásra, ha date ütemezett nap:
//   done      → current_streak += 1; last_success_date = date; milestone check
//   missed    → current_streak = 0  (best_streak marad)
//   skipped   → nem változik, nem büntet (előre bejelentett kihagyás, pl. beteg; max 2/hét)
// Bad habit: relapse a napon → streak_started_on = holnap, current_streak = 0
```

**Pont = round(base × multiplierFor(current_streak a pipa pillanatában))** – a szorzót és az alapot a főkönyv tárolja (`multiplier` oszlop), így visszakereshető.

**Streak freeze (opcionális, F4):** 30 nap streak után 1 "fagyasztás" jár; mulasztás esetén elhasználódik a reset helyett. Külön `streak_freezes_available` oszlop a `habits`-on.

### 4.3 Főkönyv-műveletek (`domain/points/ledger.ts`)

```ts
type AwardInput = { reason; refType; refId; date; base: number; multiplier?: number; note? };

award(input)      // INSERT pozitív delta; az uq_ledger_once index védi a duplikációt (ON CONFLICT IGNORE)
penalize(input)   // INSERT negatív delta; ugyanaz az egyediség
reverse(ledgerId) // INSERT { delta: -eredeti.delta, reason:'reversal', reverses_id } — sztornó
balance()         // SELECT COALESCE(SUM(delta),0) → spendable = max(0, x)
redeem(rewardId)  // TRANSACTION: re-read balance; if < cost throw; INSERT ledger(-cost); INSERT redemption
```

**Kipipálás visszavonása (un-check):** nem töröljük a bejegyzést, `reverse()`-t hívunk. Visszamenőleges szerkesztés csak `edit_grace_hours` (48h) belül; utána a nap zárolt. Ez megakadályozza a pontfarmolást (pipa–unpipa–pipa) és a múlt átírását.

**Egy tranzakció, egy művelet:** pipa = `habit_logs` upsert + `award()` egy SQLite tranzakcióban. Ha bármelyik hibázik, semmi nem íródik.

### 4.3b Megvalósítási döntések (Fázis 1)

- **Egyediség a főkönyvben:** a tervezett `uq_ledger_once` parciális unique index kikerült, mert egy sztornózott eredeti sor blokkolta volna az újra-jóváírást (pipa → unpipa → pipa). Helyette: az „aktív” bejegyzés (nem sztornó és nem mutat rá sztornó) egyediségét az `award()`/`penalize()` kód garantálja, és egy `uq_ledger_reverses` index biztosítja, hogy egy sort csak egyszer lehessen sztornózni.
- **Számlált szokások arányos pontja:** `setActiveDelta()` – minden számláló-változásnál az aktív jóváírás pontosan `habitPoints(count, target)` értékre áll (sztornó + új sor, ha eltér).
- **Visszaesés:** egy aktív levonás naponta, értéke `min(count × 2 × penalty, 30)`; a streak nullázása a napzárásban történik, így a visszaesés visszavonható.
- **XP:** csak a nem sztornózott pozitív sorok összege, így a pipa/unpipa ciklus nem farmol XP-t.
- **Heti N× szokás:** naponta nincs levonás; vasárnapi záráskor kvóta-ellenőrzés, hiány esetén egyszeri levonás + streak reset.
- **Webes előnézet (2026-09-11):** production web export + `scripts/serve-web-dist.js` (COOP/COEP fejlécek). Két upstream-korlát: a dev szerver nem tud worker chunkot adni (ezért export kell), és az expo-sqlite webes szinkron hídja 255 bájt fölött csonkolta a választ – `patches/expo-sqlite+57.0.2.patch` javítja. Weben az `Alert` néma, ezért `src/ui/notify.ts`. A böngészős próbán (00:10-kor!) két napkezdet-hiba derült ki és lett javítva: a fejléc és a teendő „Ma” előbeállítása a naptári nap helyett a logikai napot használja.
- **Domain tesztelés:** a domain réteg `DomainCtx`-et kap (db, óra, uuid), így Node-ban sql.js-en ugyanazokkal a migrációkkal fut, mint a telefonon expo-sqlite-on.

### 4.3c Megvalósítási döntések (Fázis 2)

- **Nincs `scheduled_notifications` tükörtábla.** Az OS várólistája az igazság; az app minden DB-változás után (1,5 s debounce) és előtérbe kerüléskor újraszámolja a tervet (`domain/notifications.ts`, tiszta TS, tesztelt) és diffeli az `getAllScheduledNotificationsAsync()` eredményével a `key` alapján. Így nincs mit szinkronban tartani.
- **Két naptár-fogalom:** szokások, napzárás, összegző a **logikai napot** követik (04:00 kezdet); események és a naptár-nézet a **naptári napot** (faliórát). Teendők határideje a logikai nap szerint sorolódik (ahogy a Ma képernyőn), így 02:00-s határidő az előző nap listájában van.
- **Ismétlődő teendő = sablon + példányok.** A `recurrence` JSON-t hordozó teendő sablon (listákban nem jelenik meg), a példányok `parent_task_id`-val jönnek létre ma+7 napra (`materializeRecurringTasks`, a napzárás és minden mentés után). Szabályváltásnál a nyitott jövőbeli példányok törlődnek és újragenerálódnak; a felhasználó által törölt előfordulás (soft delete) nem jön vissza.
- **RRULE-light:** `daily(interval)`, `weekly(mask)`, `monthly(day, rövid hónapra csippentve)`; horgony = az első előfordulás napja.
- **Emlékeztetők:** szokás `reminder_time` csak ütemezett napon és amíg nincs pipálva; esemény per offset (0/15/60/1440 perc); teendő 60 perccel a határidő előtt; esti összegző 20:00 (mai darabszámmal). Max 60 ütemezett (iOS 64-es plafon), 7 napra előre.
- **Expo Go korlát:** helyi értesítés Expo Go-ban Androidon működik, távoli push nem – nekünk csak helyi kell.

### 4.3d Megvalósítási döntések (Fázis 3)

- **Edzés = terv + munkamenet.** Indításkor a terv minden gyakorlatához előre létrejönnek a szett-sorok, súly/ismétlés az adott gyakorlat **utolsó befejezett** teljesítményéből előtöltve (különben a terv célja). Befejezéskor `completion_pct` = kész/összes szett, pont a 4.1 szerinti sávokkal (≥80% teljes, 50–79% fele). Újranyitás sztornózza a pontot; elvetés csak nyitott munkamenetre.
- **Étkezés-napló snapshotokkal:** a heti étrend (`meal_plan_items`, hétfő=0) napi `meal_logs` sorokká válik (`plan_item_id` az idempotenciához), a név/kcal/makró pillanatkép, így a sablon későbbi módosítása nem írja át a múltat. Ad hoc tétel = sablonból vagy egyedi név+kcal, azonnal „megevett”. Tervezett tétel nem törölhető, csak kipipálható/visszavonható.
- **Napzárás:** a nap kcal-ja csak akkor értékelődik, ha van legalább egy megevett tétel; találat +20, túllépés −10, alullét semleges. `workout_done` = van ≥50%-os befejezett munkamenet. A zárás a mai és a holnapi napra is legenerálja az étrend tételeit, a Kaja képernyő pedig megnyitáskor a mait.
- **Napzárás indulási napja:** a telepítés napja (users.created_at), minden nap kap összegző sort (üres nap nullákkal) – korábban az első szokás/teendő napjától indult.
- **Beállítások képernyő** (kcal-cél, makrók, tolerancia, napkezdet óra, próba-értesítés). A `DomainCtx` beállítás-pillanatkép mentés után újraépül (`onSettingsChange`).

### 4.3e Megvalósítási döntések (Fázis 4)

- **Streak-fagyasztás:** minden 30. sorozatnapnál +1 (max 2, `habits.streak_freezes_available`). Ütemezett napi mulasztásnál a napzárás a reset és a −5 helyett elhasznál egyet, a napló `skipped` státuszt kap „streak-fagyasztás” jegyzettel, és a nap kimarad a perfect-day számításból. Nulla sorozatra nem költ fagyasztást.
- **Ünneplés:** UI-szintű sor (Zustand), overlay konfettivel. Szintlépést a mutáció-wrapper észlel (szint előtte/utána), tökéletes napot a napzárás-hook (az épp lezárt napok összegzőiből).
- **Statisztika:** `domain/stats.ts` tiszta aggregációk (`pointsHistory`, `weeklyPoints`, `habitHeatmap`, `exerciseProgress`, `kcalHistory`, `overview`); lezárt napok a `daily_summaries`-ből, a mai nap élőben. Grafikonok View-alapúak, nincs chart-függőség.
- **Onboarding:** `settings.onboarded_at`; a Ma képernyő átirányít, amíg null. Kihagyható.

### 4.3f Értesítés-intenzitás, „van valami a fejedben?”, admin (2026-09-11, felhasználói kérés)

- **Több értesítés, állíthatóan** (`settings` oszlopok, `/admin/notifications`): napközbeni **lökések** („Hol tartasz ma?” – hány szokás és teendő nyitott, 0–8/nap), **kérdések** („Van valami a fejedben?”, 0–6/nap, koppintásra a gyors rögzítő nyílik), esti összegző állítható időponttal, kapcsoló minden fajtára (szokás/teendő/esemény/összegző/lökés/kérdés), **csendes órák** (lökés, kérdés, összegző nem jön; a saját időpontos emlékeztetők igen). A lökések és kérdések az aktív ablakban egyenletesen oszlanak el, a kérdések 20 perccel eltolva. Android plafon 200, iOS 60 (legközelebbiek maradnak).
- **Gyors rögzítés** (`/capture`): egy sor → teendő (ma/holnap/dátum/bármikor), naptár-esemény (1 óra, 15 perces emlékeztető) vagy jegyzet (határidő nélküli teendő). Megnyitáskor is felugrik, legfeljebb N óránként (`capture_on_open_hours`, 0 = soha), csendes órákban soha; a Ma képernyőn állandó beviteli sáv is van.
- **Vezérlőpult** (`/admin`): minden kezelőfelület egy helyről. **Szokás-kezelő** (`/admin/habits`): aktív és archivált lista, sorrend ↑↓, szerkesztés, archiválás/visszaállítás, végleges (soft) törlés a történet megtartásával.

### 4.3g Teljes admin-felület (2026-09-21, felhasználói kérés)

- **Állítható pontszabályok** (`src/domain/points/config.ts`, `/admin/rules`): a 4.1 táblázat minden száma, a sorozat-szorzók (nap + szorzó két szinten), a három mérföldkő (nap + bónusz) és a fagyasztás (gyakoriság, plafon) szerkeszthető. A `settings.point_rules` JSON csak az alapértéktől ELTÉRŐ kulcsokat tárolja; betöltéskor minden hiányzó vagy érvénytelen érték az alapértékre esik vissza, így a pontmotor sosem törhet el. A szabályok a `ctx.settings.rules`-on át jutnak a domainbe; a már jóváírt pontok nem számolódnak újra.
- **Modulok** (`/admin/modules`): naptár, edzés, kaja, jutalmak füle ki/bekapcsolható (`mod_*` oszlopok). Az adat megmarad, csak a fül tűnik el.
- **Tartalomkezelők**: szokások (korábbról), **teendők** (az addig sehol nem látható ismétlődő sablonok szerkesztése/törlése, nyitott és kész lista), **események** (ismétlődő / közelgő / korábbi), **jutalmak** (archivált visszaállítása, beváltások „megvolt” jelöléssel), **edzés** (archivált tervek, gyakorlatok átnevezése, törlés csak ha aktív terv nem használja), **kaja** (archivált sablonok, étrend, kcal-cél).
- **Profil** a Beállításokban: név, IANA időzóna (validálva), visszamenőleges szerkesztési ablak órában.
- **Kézi pontmódosítás** (`manual_adjust` főkönyvi sor, kötelező jegyzettel).
- **Veszélyzóna**: „TÖRLÉS” begépelése után pontok nullázása (főkönyv, beváltások, összegzők, sorozatok) vagy minden tartalom törlése; a beállítások mindig megmaradnak. Ez az append-only főkönyv-szabály egyetlen, szándékos kivétele.

### 4.3h Fix napi kaják (2026-09-21, felhasználói kérés)

- **Egy lépéses felvétel** (`/meal/fixed`, `addFixedMeal`): név + kcal (+ makrók) + étkezés + napok (alapból minden nap). Létrehozza vagy frissíti az ételsablont, beteszi a heti étrendbe a választott napokra, és a mai sort azonnal legenerálja. Ugyanaz a név nem duplikál, hanem frissít. A heti étrend marad a részletes nézet, a „fix kajáim” ugyanennek (étel, étkezés) → napmaszk szerinti csoportosítása.
- **Pipálás és előrejelzés:** a `DayNutrition` új mezői: `projectedOutcome` (mi lesz, ha minden felsorolt tétel elfogy), `plannedCount`/`plannedEaten`, makró-célok. A Kaja fül és a Ma képernyő kártyája kiírja: mennyi van hátra, és hogy a terv eléri-e, túllépi-e vagy alulmúlja-e a célt.
- **Következetes karbantartás:** naplevétel, fix kaja törlése vagy sablon archiválása a mától kezdődő, még meg nem evett tervezett sorokat eltünteti; a megevettek érintetlenek. Sablon szerkesztésekor a még meg nem evett sorok pillanatképe frissül, a múlt nem.

### 4.3i Kaja a pontrendszerben (2026-09-21, felhasználói kérés)

- **Pont kajánként:** minden kipipált TERVEZETT kaja `mealEaten` pontot ad (alap: 3) `meal_eaten` főkönyvi sorként (`ref_type = meal`, a napló id-jével); visszavonásnál sztornó, újrapipálásnál egyszer fizet. Terven kívüli tétel nem ad pontot, mert a terv betartását jutalmazzuk. 0-ra állítva kikapcsol.
- **Tökéletes nap:** ha van kcal-cél ÉS aznap van kajanapló-sor, a bónuszhoz a kalóriacél találat is kell (`perfectDayNeedsKcal` = 1, kikapcsolható 0-val). Cél nélkül vagy kajanapló nélküli napon nem feltétel, hogy a modult nem használó napok ne ragadjanak be.

### 4.3j Napi dobás – véletlen kihívások (2026-09-23, felhasználói kérés)

- **Kihívás-lista** (`challenges` tábla, `/admin/challenges`): név, ikon, pont (alap: `challengePoints` szabály, 15), súly (1–10, a dobás gyakorisága). Archiválás/visszaállítás/törlés, kezdőlista egy gombbal.
- **Kötelező napi dobás**: app-megnyitáskor és előtérbe kerüléskor, ha a logikai napon még nem volt (`settings.last_challenge_day`), és a lista nem üres, és be van kapcsolva. Súlyozott, ismétlés nélküli húzás `challenge_choices` (1–6, alap 3) lehetőségből; a már aznap elvállaltak kimaradnak. Egy újradobás engedélyezett, bezárni nem lehet, választani kell. A „van valami a fejedben?” kérdés ilyenkor átadja az elsőbbséget.
- **Kézi dobás**: a Ma képernyő Teendők sorában 🎲 gomb, bármikor, bezárható, korlátlan újradobás.
- **Elfogadás** → teendő a mai logikai nap végéig (`dayStartHour` − 1 perc másnap), a kihívás pontjával, `tasks.challenge_id`-vel jelölve („🎲 kihívás” címke). Ugyanaz a kihívás egy nap egyszer vállalható. A pontozás a teendőkével azonos (késés, lejárat).
- Véletlen: `ctx.random()` a DomainCtx-ben, tesztben determinisztikus LCG.

### 4.4 Napzárás (`domain/dayClose.ts`)

Futtatás: app fókuszba kerülésekor (`AppState 'active'`), plusz best-effort háttér-task. Minden `date` a **tegnapig** (helyi `day_start_hour` szerint), ami még nincs a `daily_summaries`-ben, időrendben:

```
closeDay(date):
  if exists daily_summaries[date] → return         // idempotens
  BEGIN
    for habit in scheduledHabits(date):
      log = habit_logs[habit, date] ?? create(pending)
      good & pending & count >= target → done  (award már megtörtént a pipánál)
      good & pending & count <  target → missed → penalize(habit_missed)
      bad  & no relapse                → award(bad_habit_clean_day, ×multiplier)
      updateStreak(habit, log.status); milestoneBonus()
    for task in dueTasks(date) not completed & !overdue_penalized_at:
      penalize(task_overdue); set overdue_penalized_at
    kcal: eaten = Σ meal_logs.eaten kcal
          if eaten>0 && |eaten-target| <= target*tol% → award(kcal_goal_hit)
          else if eaten > target*(1+tol%)             → penalize(kcal_goal_missed)
    perfectDay? → award(perfect_day)
    generateRecurring(date+1): ismétlődő teendők példányosítása, meal_logs a heti sablonból
    INSERT daily_summaries
  COMMIT
  notifications.reconcile()
```

### 4.5 Jutalombolt matematikája

**Árazás iránymutató** (napi kb. 120 pont mellett):

| Kategória | Költség | Erőfeszítés | Példa |
|---|---|---|---|
| Mini | 150–300 | 1–3 nap | egy sorozat-epizód, desszert |
| Kicsi | 500–800 | kb. 1 hét | mozi, étterem |
| Közepes | 1500–2500 | 2–3 hét | új ruha, játék |
| Nagy | 5000+ | 6+ hét | kirándulás, gadget |

- **Beváltás:** `spendable >= cost`, `cooldown_days` letelt, nem `repeatable` és már beváltott → tiltva. UI: progress bar a legközelebbi célhoz ("még 340 pont a mozihoz").
- **Megtakarítás-védelem:** a büntetések negatívba vihetik a főkönyvet, de a `spendable` 0-ra padlózott – egy rossz hét nem adósít el hónapokra. Az `xp` és a szint viszont soha nem csökken → a hosszú távú haladás sosem vész el (ez a két szám szétválasztásának oka).
- **Infláció-védelem:** a szorzó max ×1.5, a mérföldkő-bónusz ritka. Ha a 30 napos gördülő átlag 200 pont/nap fölé megy, az app javasolja az árak +25% emelését (nem automatikus).

---

## 5. Értesítések (Expo)

- Engedélykérés az onboarding végén, indoklással.
- **Ütemezés forrása mindig a DB**, `scheduler.reconcile()`:
  1. `Notifications.getAllScheduledNotificationsAsync()` → OS-ben lévő halmaz
  2. DB-ből számolt "kell" halmaz a következő 7 napra: szokás `reminder_time` ütemezett napokon, esemény `start_at − offset`, teendő `due_at − 60 perc`, napi összegző ("Ma 3 szokásod maradt", 20:00)
  3. diff → `scheduleNotificationAsync` / `cancelScheduledNotificationAsync`, tükör a `scheduled_notifications`-ben
- Futtatás: minden DB-írás után (debounce 2 s) + app aktiválódáskor.
- Deep link: `data: { url: '/habit/<id>' }` → Expo Router megnyitja a részletet, ahol egy koppintással pipálható.
- Android: notification channel-ek (`reminders`, `summary`), hogy külön halkíthatók legyenek.
- iOS limit: max 64 ütemezett helyi értesítés → ezért csak 7 napra előre, és ismétlődő trigger (`daily`/`weekly`) ahol lehet.

---

## 6. Fejlesztési roadmap

Minden fázis végén: **működő, telefonra telepített app**. Becslés hobbi-tempóban (napi 1–3 óra).

### Fázis 0 – Alapozás (1–2 nap)
- [x] `npx create-expo-app@latest fapp --template tabs` (TypeScript), Expo Router, NativeWind, strict TS, ESLint/Prettier.
- [x] `expo-sqlite` + Drizzle + `drizzle-kit` migrációk; `src/db/client.ts` (`PRAGMA journal_mode=WAL; foreign_keys=ON`).
- [x] `users` + `settings` seed első indításkor; `domain/` mappa Vitest-tel (RN-mentes).
- [x] Design tokenek (`ui/tokens.ts`): 1 accent szín, 3 semantic (success/warn/danger), spacing skála, dark mode alapból.
- **Kész (2026-09-09):** tsc zöld, 24 domain-teszt zöld, `expo export --platform android` sikeres. Telefonon még nem futtatva. Eredeti kritérium: üres tab-os app fut a telefonon Expo Go-ban, `npm test` zöld egy dummy teszttel.

### Fázis 1 – MVP: pipa-rendszer + pontok (1–2 hét)
- [x] Séma: `habits`, `habit_logs`, `tasks`, `point_ledger`, `rewards`, `reward_redemptions`, `daily_summaries`.
- [x] `domain/points/*` + `dayClose.ts` **teszt-vezérelten** – ez a legfontosabb kód, itt előbb a tesztek: dupla pipa nem dupláz, un-check sztornóz, mulasztás büntet, streak 7-nél bónusz, relapse reset, redeem elutasít fedezet nélkül.
- [x] "Ma" képernyő: szokáslista (good: pipálás/számláló; bad: "tiszta vagyok" állapot + "visszaestem" gomb), mai teendők, pont-egyenleg fejléc, streak-jelző.
- [x] Szokás/teendő CRUD (bottom sheet form, zod validáció).
- [x] Jutalombolt: lista, költség, beváltás megerősítéssel, pont-történet (a főkönyv olvasható nézete).
- [x] Napzárás hívása app-aktiválódáskor.
- [x] Mikro-öröm: pipa animáció + haptika, "+10" lebegő címke.
- **Kész (2026-09-09):** 66 Vitest zöld (ledger, habits, tasks, rewards, dayClose valós SQLite-on sql.js-szel), domain lefedettség 97% sor, tsc zöld, Android bundle exportál. Telefonon még nem futtatva. Eredeti kritérium: 1 hét valós használat után a főkönyv és a streak-ek konzisztensek, és a tesztek zöldek.

### Fázis 2 – Naptár és értesítések (1 hét)
- [x] Séma: `events`, `event_reminders`, `scheduled_notifications`; `tasks.recurrence`, `domain/recurrence.ts` (napi / heti maszk / havi N-edik; nem teljes RRULE).
- [x] Naptár tab: heti csík felül + napi lista (események + esedékes teendők + tervezett edzés). Havi nézet **nem** kell MVP-ben.
- [x] `notifications/scheduler.ts` reconcile, engedélykérés, channel-ek, deep link.
- [x] Napi összegző értesítés (20:00): hány szokás maradt.
- **Kész (2026-09-11):** 89 Vitest zöld (recurrence, events, ismétlődő teendők, értesítés-terv), tsc zöld, Android + web export sikeres, naptár és űrlapok böngészőben kipróbálva. Telefonon (értesítés zárt képernyőn, deep link) még nem ellenőrizve. Eredeti kritérium: zárt telefonon is jön az emlékeztető, koppintásra a megfelelő képernyő nyílik, a ledger-tesztek zöldek.

### Fázis 3 – Edzés és étkezés (1–2 hét)
- [x] Séma: `exercises`, `workout_plans`, `workout_plan_exercises`, `workout_sessions`, `set_logs`.
- [x] Edzés tab: mai terv (weekday_mask) → "Start" → szettek gyors pipája, súly/ismétlés inline szerkeszthető (előző alkalom értéke előtöltve), "Befejezés" → `completion_pct` → `award(workout_done)`.
- [x] Séma: `meal_templates`, `meal_plan_items`, `meal_logs`; `settings.kcal_target`.
- [x] Étkezés tab: napi kcal gyűrű (evett / cél), a napra tervezett ételek pipálhatóan, "+ ad hoc" a sablonokból. A tervezett napi `meal_logs`-ot a napzárás generálja előre (holnapra).
- [x] Napzárás bővítése: kcal cél kiértékelés, `workout_done` a `daily_summaries`-be.
- **Kész (2026-09-11):** 105 Vitest zöld (16 új: edzés, étkezés, beállítás, napzárás kcal/edzés), tsc zöld, Android + web export sikeres, Edzés/Kaja tabok böngészőben kipróbálva. Eredeti kritérium: egy edzés naplózása 2 perc alatt, egy nap kajája 30 másodperc alatt megvan.

### Fázis 4 – Finomhangolás (folyamatos)

**Állapot (2026-09-11):** a lényegi tételek kész, 114 Vitest zöld (9 új: statisztika, streak-fagyasztás), tsc zöld, Android + web export sikeres, onboarding és statisztika böngészőben kipróbálva. Az ünneplés-overlay és a mentés csak telefonon ellenőrizhető.
- [x] Statisztika képernyő: heti pontgörbe, szokás heatmap (GitHub-stílus), edzés-progresszió (max súly / gyakorlat), kcal trend. (`daily_summaries` + aggregációk.)
- [x] Streak freeze, perfect-day konfetti, szint-lépés ünneplés (overlay).
- [x] Backup/export: DB export a megosztás-lapra, CSV export a főkönyvről, visszaállítás fájlból (újraindítást kér). **Nem titkosított** – az expo-crypto nem ad AES-t, a fájl a saját tárhelyre megy; ha kell, később egy tiszta JS AES réteg tehető elé.
- [ ] **Elhalasztva (opcionális):** sync backend: **saját blueprint** (Express + titkosított SQLite) `PUT /sync` végponttal – `updated_at`/`deleted_at` alapú last-write-wins, a főkönyv append-only merge.
- [ ] **Elhalasztva:** Android home-screen widget – natív config plugin + development build kell hozzá (Expo Go-ban nem megy), eszköz nélkül nem ellenőrizhető.
- [ ] **Nem szükséges most:** FlashList – a listák tíz-egynéhány eleműek, a sima ScrollView elég; a tab-váltás a közös cache miatt már azonnali.
- [x] Onboarding: 3 lépés (napkezdet óra, kezdő szokások chipekből, első jutalom), kihagyható.

---

## 7. Nem-funkcionális követelmények

- **Offline-first:** minden művelet hálózat nélkül működik.
- **Gyorsaság:** hideg indítás 2 s alatt, pipa visszajelzés 100 ms alatt (optimistic UI, a DB-írás mögötte).
- **Adatintegritás:** a főkönyv sosem UPDATE/DELETE; minden pontváltozás tranzakcióban a kiváltó rekorddal együtt.
- **Adatvédelem:** csak lokális adat; a backup titkosított; nincs analitika, nincs harmadik fél SDK.
- **Tesztlefedettség:** `domain/` legalább 90% sor, mert ebben van az összes üzleti szabály.
- **Dark mode** alapból, egykezes használat (fő akciók alul, hüvelykujj-zónában).

---

## 8. Nyitott kérdések (a következő lépés előtt dönteni)

1. ~~Android vagy iPhone?~~ **Eldöntve: Android** (2026-09-09).
2. Kell-e asztali használat? Ha igen → B terv (PWA) vagy F4 sync + webes olvasó nézet.
3. A rossz szokás visszaesésénél a **−10 pont + streak reset** nem túl szigorú-e a te esetedre? (Alternatíva: első relapse 30 napon belül csak −10, streak marad – "grace".)
4. Kcal: elég a fix sablon + pipa, vagy kell később élelmiszer-adatbázis keresés (Open Food Facts API)? Architekturálisan a `meal_templates`-be illeszthető, nem kell most dönteni.

---

## 9. Következő konkrét lépés

```bash
npx create-expo-app@latest fapp --template tabs
```
majd a Fázis 0 checklist. A `domain/points` modult és a tesztjeit írjuk meg **először** – ez az app szíve, és UI nélkül is ellenőrizhető.
