/**
 * Diet packs: a ready-made set of meal templates (with recipe notes) plus rotating weekly
 * plans, loaded with one tap. Applying a pack creates the missing templates (matched by
 * name, archived ones are restored), replaces the whole weekly plan with the chosen week
 * and sets the kcal / macro targets. Pure TypeScript.
 *
 * The first pack ("Fogyás – csirke, rizs, bulgur") was written for a 190 cm / 160 kg
 * person: ~2100 kcal/day, ~160 g protein, no fish, no beans, no pumpkin stew.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mealTemplates, settings, type MealSlot } from '@/src/db/schema';
import { DomainError, nowIso, type DomainCtx } from './context';
import { replaceWeekPlan, type WeekPlanInput } from './meals';

export interface DietMeal {
  key: string;
  name: string;
  slot: MealSlot;
  kcal: number;
  p: number;
  c: number;
  f: number;
  notes: string;
}

/** One day = meal keys per slot (a slot may hold several, e.g. two snacks). */
export type DietDay = Record<MealSlot, string[]>;

export interface DietWeek {
  name: string;
  /** Monday … Sunday */
  days: DietDay[];
}

export interface DietPack {
  id: string;
  name: string;
  description: string;
  kcalTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: DietMeal[];
  weeks: DietWeek[];
}

const B = 'breakfast';
const L = 'lunch';
const D = 'dinner';
const S = 'snack';

const MEALS: DietMeal[] = [
  // ---------------------------------------------------------------- reggelik
  { key: 'R1', name: 'Zöldséges rántotta pirítóssal', slot: B, kcal: 440, p: 26, c: 35, f: 22,
    notes: '3 tojás, 100 g paprika + paradicsom, 5 g olaj, 2 szelet teljes kiőrlésű kenyér (60 g). A zöldséget 2 percig pirítsd, aztán jöhet a tojás. Só, bors, snidling.' },
  { key: 'R2', name: 'Banános zabkása mogyoróvajjal', slot: B, kcal: 535, p: 21, c: 78, f: 16,
    notes: '60 g zabpehely, 250 ml 1,5%-os tej, 1 banán (120 g), 15 g mogyoróvaj, fahéj. A zabot a tejjel 3-4 perc alatt főzd sűrűre, a banánt karikázd rá, a mogyoróvajat keverd el benne.' },
  { key: 'R3', name: 'Skyr granolával és gyümölccsel', slot: B, kcal: 420, p: 32, c: 54, f: 7,
    notes: '250 g skyr vagy 0%-os görög joghurt, 40 g granola, 100 g bogyós gyümölcs (fagyasztott is jó), 10 g méz. Készítés: össze kell rakni.' },
  { key: 'R4', name: 'Túrós-zöldséges reggeli', slot: B, kcal: 460, p: 47, c: 44, f: 10,
    notes: '250 g félzsíros túró, 2 szelet teljes kiőrlésű kenyér, 150 g paradicsom + paprika + újhagyma. A túrót sózd, borsozd, snidlinggel keverd, kend a kenyérre.' },
  { key: 'R5', name: 'Csirkesonkás tojásszendvics', slot: B, kcal: 410, p: 37, c: 31, f: 16,
    notes: '2 szelet teljes kiőrlésű kenyér, 2 tojás (tükörtojás vagy főtt), 60 g csirkesonka, 20 g light sajt, saláta, mustár. Szendvicssütőben is jó.' },
  { key: 'R6', name: 'Zabos-túrós palacsinta gyümölccsel', slot: B, kcal: 540, p: 45, c: 48, f: 19,
    notes: '50 g zabpehely, 150 g túró, 2 tojás, csipet só, édesítő, vanília – turmixold össze, teflonban olaj nélkül süsd 3-4 kis palacsintának. 100 g gyümölcs mellé.' },
  { key: 'R7', name: 'Sajtos-sonkás omlett salátával', slot: B, kcal: 465, p: 38, c: 20, f: 25,
    notes: '3 tojás, 40 g sonka, 30 g sajt, paradicsom + saláta, 1 szelet teljes kiőrlésű kenyér. Az omlettet lassú tűzön süsd, a sajtot a végén hajtsd bele.' },
  { key: 'R8', name: 'Fehérjeturmix zabbal és banánnal', slot: B, kcal: 485, p: 38, c: 65, f: 8,
    notes: '30 g fehérjepor, 40 g zabpehely, 1 banán, 250 ml 1,5%-os tej, jég. Turmix – a rohanós reggelek megoldása.' },

  // ---------------------------------------------------------------- ebédek
  { key: 'E1', name: 'Grillcsirke rizzsel és párolt zöldséggel', slot: L, kcal: 660, p: 55, c: 74, f: 14,
    notes: '200 g csirkemell (fűszerezve, grillserpenyőben), 80 g rizs (nyers súly), 200 g vegyes zöldség (brokkoli, répa, borsó), 10 g olívaolaj. A csirkét sütés előtt 30 percig hagyd fűszerben állni.' },
  { key: 'E2', name: 'Csirkés bulgursaláta fetával', slot: L, kcal: 660, p: 51, c: 68, f: 19,
    notes: '150 g csirkemell csíkokra vágva, 80 g bulgur (nyers), 200 g uborka + paradicsom + lilahagyma, 30 g feta, 10 g olívaolaj, citromlé, petrezselyem, menta. Hidegen is jó, dobozba is elvihető.' },
  { key: 'E3', name: 'Csirkepaprikás light tejföllel, bulgurral', slot: L, kcal: 625, p: 49, c: 60, f: 21,
    notes: '200 g csirkecomb filé, 1 hagyma, 1 paprika, 1 paradicsom, pirospaprika, 50 g 12%-os tejföl, 5 g olaj, 70 g bulgur (nyers). A hagymát dinszteld, jöhet a hús, paprika, kevés víz, 25 perc fedő alatt; a végén tejföl.' },
  { key: 'E4', name: 'Pulykamell steak sült édesburgonyával', slot: L, kcal: 590, p: 53, c: 60, f: 12,
    notes: '200 g pulykamell szelet, 300 g édesburgonya hasábra vágva, 10 g olaj, füstölt paprika, rozmaring, 100 g saláta. Az édesburgonya 200 °C-on 25 perc, a pulyka serpenyőben oldalanként 4 perc.' },
  { key: 'E5', name: 'Marhahúsos wok rizzsel', slot: L, kcal: 660, p: 44, c: 77, f: 18,
    notes: '150 g sovány marha (csíkok), 200 g wokzöldség (paprika, brokkoli, répa, hagyma), 80 g rizs (nyers), 10 g szezámolaj, 2 ek szójaszósz, gyömbér, fokhagyma. Magas lángon, gyorsan.' },
  { key: 'E6', name: 'Csirkés-zöldséges tészta paradicsommal', slot: L, kcal: 720, p: 61, c: 71, f: 18,
    notes: '180 g csirkemell, 80 g teljes kiőrlésű tészta (nyers), 150 g cukkini + paprika, 100 ml passata, 10 g olívaolaj, 15 g parmezán, bazsalikom, fokhagyma.' },
  { key: 'E7', name: 'Rakott csirkés rizs brokkolival', slot: L, kcal: 675, p: 56, c: 67, f: 18,
    notes: '150 g csirkemell kockára, 70 g rizs (nyers, félig előfőzve), 150 g brokkoli, 100 g 12%-os tejföl, 30 g light sajt a tetejére. Tálban rétegezve, 180 °C-on 25 perc.' },
  { key: 'E8', name: 'Töltött paprika darált pulykával', slot: L, kcal: 625, p: 45, c: 81, f: 13,
    notes: '3 paprika (250 g), 150 g darált pulyka, 50 g rizs (nyers), 1 tojás, hagyma, 200 ml paradicsomszósz, 5 g olaj. Fedő alatt 40 perc. 1 szelet teljes kiőrlésű kenyér mellé.' },
  { key: 'E9', name: 'Sertésszűz bulgurral és párolt zöldséggel', slot: L, kcal: 605, p: 52, c: 61, f: 17,
    notes: '180 g sertésszűz (érmék, mustárral, fokhagymával), 70 g bulgur (nyers), 200 g zöldség (zöldbab helyett: répa, karfiol, brokkoli), 10 g olaj. A szűz oldalanként 3 perc, aztán 5 perc pihentetés.' },
  { key: 'E10', name: 'Csirkegyros tál tzatzikivel', slot: L, kcal: 620, p: 60, c: 64, f: 13,
    notes: '180 g csirkemell gyros-fűszerrel, 70 g bulgur (nyers), 150 g tzatziki (0%-os görög joghurt, reszelt uborka, fokhagyma, kapor), saláta + paradicsom + lilahagyma, 5 g olaj.' },
  { key: 'E11', name: 'Csirkés-gombás rizottó', slot: L, kcal: 625, p: 50, c: 68, f: 15,
    notes: '150 g csirkemell, 80 g rizottó rizs (nyers), 150 g gomba, 1 kis hagyma, 10 g vaj, 15 g parmezán, alaplé. A rizst merőkanalanként főzd fel, 18 perc alatt kész.' },
  { key: 'E12', name: 'Chili con carne bab nélkül, rizzsel', slot: L, kcal: 575, p: 40, c: 76, f: 10,
    notes: '150 g darált marha (5%), 200 g paradicsom + paprika + 50 g kukorica, hagyma, chili, római kömény, kakaópor egy csipet, 70 g rizs (nyers). Bab nincs benne, a kukorica adja a harapást.' },
  { key: 'E13', name: 'Currys pulykacsíkok zöldséggel és rizzsel', slot: L, kcal: 620, p: 53, c: 76, f: 10,
    notes: '180 g pulykamell csíkokra, 200 g zöldség (paprika, cukkini, hagyma, borsó), 100 ml light kókusztej, 1 ek currypaszta vagy 2 tk currypor, 80 g rizs (nyers). 15 perc az egész.' },
  { key: 'E14', name: 'Sült csirkecomb burgonyával és salátával', slot: L, kcal: 595, p: 49, c: 50, f: 21,
    notes: '220 g csirkecomb filé bőr nélkül, 250 g burgonya cikkekre, 10 g olaj, fokhagyma, rozmaring – tepsiben 200 °C, 35 perc. 150 g kevert saláta joghurtos öntettel.' },

  // ---------------------------------------------------------------- vacsorák
  { key: 'V1', name: 'Csirkemell saláta fetával', slot: D, kcal: 495, p: 44, c: 22, f: 24,
    notes: '150 g grillezett csirkemell, 200 g vegyes saláta (rukkola, paradicsom, uborka, paprika), 30 g feta, 15 g olívaolaj, balzsamecet, 1 szelet teljes kiőrlésű kenyér.' },
  { key: 'V2', name: 'Pulykás lecsó teljes kiőrlésű kenyérrel', slot: D, kcal: 495, p: 45, c: 46, f: 14,
    notes: '150 g pulykamell kockára, 300 g lecsó (paprika, paradicsom, hagyma), 10 g olaj, pirospaprika, 2 szelet teljes kiőrlésű kenyér. Fagyasztott lecsóból is 15 perc.' },
  { key: 'V3', name: 'Csirkefasírt görög salátával', slot: D, kcal: 540, p: 46, c: 25, f: 23,
    notes: '150 g darált csirke, 1 tojás, 20 g zabpehely (zsemle helyett), hagyma, fokhagyma, petrezselyem; sütőben 200 °C-on 20 perc, 5 g olajjal. Görög saláta: 250 g zöldség, 30 g feta, olíva.' },
  { key: 'V4', name: 'Töltött cukkini darált pulykával és bulgurral', slot: D, kcal: 535, p: 53, c: 55, f: 11,
    notes: '2 közepes cukkini (400 g) kivájva, 150 g darált pulyka, 50 g bulgur (nyers, előfőzve), 100 ml paradicsomszósz, 30 g light sajt a tetejére. 190 °C, 30 perc.' },
  { key: 'V5', name: 'Könnyű csirkecurry rizzsel', slot: D, kcal: 500, p: 42, c: 59, f: 10,
    notes: '150 g csirkemell, 100 ml light kókusztej, 150 g zöldség (spenót, paprika, hagyma), curry, gyömbér, 60 g rizs (nyers).' },
  { key: 'V6', name: 'Sajtos-sonkás tojáslepény salátával', slot: D, kcal: 475, p: 40, c: 8, f: 30,
    notes: '3 tojás, 50 g sonka, 30 g light sajt, 200 g saláta + zöldség, 10 g olívaolaj az öntetbe. Könnyű, gyors, szénhidrátszegény este.' },
  { key: 'V7', name: 'Csirkés quesadilla teljes kiőrlésű tortillával', slot: D, kcal: 575, p: 50, c: 50, f: 17,
    notes: '2 teljes kiőrlésű tortilla (80 g), 120 g csirkemell csíkok, 40 g light sajt, 100 g paprika + hagyma, 50 g salsa, 50 g 12%-os tejföl. Száraz serpenyőben oldalanként 2 perc.' },
  { key: 'V8', name: 'Marhahúsos taco-saláta', slot: D, kcal: 570, p: 46, c: 34, f: 26,
    notes: '150 g darált marha (5%) taco-fűszerrel, 200 g saláta + paradicsom + 50 g kukorica, 30 g light sajt, 50 g 12%-os tejföl, 30 g tortilla chips morzsolva a tetejére.' },
  { key: 'V9', name: 'Sült pulykamell brokkolival és édesburgonyapürével', slot: D, kcal: 515, p: 52, c: 47, f: 11,
    notes: '180 g pulykamell, 200 g brokkoli (párolva, citrommal), 200 g édesburgonya főzve és 10 g vajjal pürésítve, szerecsendió.' },
  { key: 'V10', name: 'Tartalmas csirkés zöldségleves tojással', slot: D, kcal: 480, p: 47, c: 39, f: 12,
    notes: '500 ml leves: 150 g csirkemell, répa, zeller, karalábé, 30 g cérnametélt, sok petrezselyem. 1 főtt tojás félbevágva bele, 1 szelet teljes kiőrlésű kenyér mellé.' },
  { key: 'V11', name: 'Töltött sült burgonya csirkével és cottage cheese-zel', slot: D, kcal: 470, p: 46, c: 51, f: 7,
    notes: '250 g burgonya héjában sütve (200 °C, 45 perc), félbevágva, 100 g grillcsirke + 150 g cottage cheese + snidling a tetején. 100 g saláta mellé.' },
  { key: 'V12', name: 'Cézár saláta grillcsirkével', slot: D, kcal: 480, p: 47, c: 30, f: 18,
    notes: '150 g grillezett csirkemell, 200 g római saláta, 30 g krutonok (teljes kiőrlésű kenyérből sütve), 15 g parmezán, 40 g light cézár öntet.' },
  { key: 'V13', name: 'Sütőben sült „rántott” csirke coleslaw-val', slot: D, kcal: 485, p: 53, c: 34, f: 13,
    notes: '180 g csirkemell csíkokra, 1 tojásfehérjébe, majd 30 g darált zabpehely + füstölt paprika bundába; 5 g olajjal sütőben 200 °C, 20 perc. Coleslaw: 200 g káposzta + répa, 0%-os görög joghurttal, ecettel.' },
  { key: 'V14', name: 'Pulyka-stroganoff bulgurral', slot: D, kcal: 520, p: 48, c: 44, f: 17,
    notes: '150 g pulykamell csíkok, 150 g gomba, hagyma, mustár, 80 g 12%-os tejföl, 5 g olaj, 50 g bulgur (nyers). 20 perc.' },

  // ---------------------------------------------------------------- nasik
  { key: 'N1', name: 'Alma + 25 g mandula', slot: S, kcal: 240, p: 5, c: 30, f: 12, notes: '1 közepes alma és egy maréknyi (25 g) natúr mandula.' },
  { key: 'N2', name: 'Skyr bogyós gyümölccsel', slot: S, kcal: 145, p: 17, c: 16, f: 0, notes: '150 g skyr vagy 0%-os görög joghurt, 100 g bogyós gyümölcs.' },
  { key: 'N3', name: 'Fehérjeturmix tejjel', slot: S, kcal: 230, p: 32, c: 14, f: 5, notes: '30 g fehérjepor 250 ml 1,5%-os tejjel.' },
  { key: 'N4', name: 'Rizsszelet mogyoróvajjal', slot: S, kcal: 225, p: 7, c: 28, f: 10, notes: '3 db puffasztott rizsszelet, 20 g mogyoróvaj vékonyan.' },
  { key: 'N5', name: 'Cottage cheese uborkával', slot: S, kcal: 215, p: 23, c: 10, f: 8, notes: '200 g cottage cheese, fél uborka, bors, snidling.' },
  { key: 'N6', name: 'Banán + 15 g mogyoróvaj', slot: S, kcal: 195, p: 5, c: 28, f: 8, notes: '1 banán, 15 g mogyoróvaj.' },
  { key: 'N7', name: 'Kakaós protein puding', slot: S, kcal: 155, p: 18, c: 10, f: 6, notes: '200 g 2%-os görög joghurt, 10 g cukrozatlan kakaó, édesítő, csipet só – elkeverve, 10 perc a hűtőben.' },
  { key: 'N8', name: 'Csirkesonka-tekercs sajttal és répával', slot: S, kcal: 220, p: 26, c: 13, f: 5, notes: '80 g csirkesonka 30 g light sajttal feltekerve, 150 g sárgarépa hasábok.' },
  { key: 'N9', name: 'Túró gyümölccsel és fahéjjal', slot: S, kcal: 210, p: 25, c: 15, f: 5, notes: '150 g félzsíros túró, 100 g gyümölcs, fahéj, édesítő.' },
  { key: 'N10', name: 'Popcorn + kis alma', slot: S, kcal: 185, p: 3, c: 40, f: 1, notes: '30 g olaj nélkül pattogatott kukorica (sóval), 1 kis alma.' },
];

const day = (b: string, s1: string, l: string, s2: string, d: string): DietDay => ({
  breakfast: [b],
  snack: [s1, s2],
  lunch: [l],
  dinner: [d],
});

export const WEIGHT_LOSS_PACK: DietPack = {
  id: 'weight-loss-chicken-rice',
  name: 'Fogyás – csirke, rizs, bulgur',
  description:
    '190 cm / 160 kg-ra méretezve: kb. 2100 kcal és 160 g fehérje naponta, ami mérsékelt, tartható deficit. Hal, bab és tökfőzelék nincs benne. ' +
    'Két, egymást váltó hét, naponta reggeli + 2 nasi + ebéd + vacsora; minden ételnél ott a recept.',
  kcalTarget: 2100,
  proteinG: 160,
  carbsG: 215,
  fatG: 62,
  meals: MEALS,
  weeks: [
    {
      name: 'A hét',
      days: [
        day('R2', 'N1', 'E1', 'N3', 'V10'),
        day('R1', 'N5', 'E6', 'N8', 'V11'),
        day('R6', 'N2', 'E10', 'N3', 'V9'),
        day('R7', 'N1', 'E7', 'N9', 'V6'),
        day('R8', 'N3', 'E5', 'N9', 'V13'),
        day('R4', 'N1', 'E14', 'N4', 'V3'),
        day('R3', 'N1', 'E3', 'N8', 'V1'),
      ],
    },
    {
      name: 'B hét',
      days: [
        day('R8', 'N3', 'E11', 'N5', 'V5'),
        day('R5', 'N1', 'E4', 'N3', 'V7'),
        day('R2', 'N6', 'E2', 'N3', 'V12'),
        day('R6', 'N7', 'E13', 'N8', 'V14'),
        day('R7', 'N10', 'E9', 'N3', 'V4'),
        day('R4', 'N1', 'E12', 'N9', 'V8'),
        day('R1', 'N1', 'E8', 'N8', 'V2'),
      ],
    },
  ],
};

export const DIET_PACKS: DietPack[] = [WEIGHT_LOSS_PACK];

export function getDietPack(id: string): DietPack {
  const pack = DIET_PACKS.find((p) => p.id === id);
  if (!pack) throw new DomainError('NOT_FOUND', `diet pack ${id} not found`);
  return pack;
}

const mealByKey = (pack: DietPack, key: string): DietMeal => {
  const m = pack.meals.find((x) => x.key === key);
  if (!m) throw new DomainError('INVALID', `diet pack ${pack.id}: unknown meal ${key}`);
  return m;
};

/** Daily totals of one planned day – for previews and for keeping the pack honest in tests. */
export function dietDayTotals(pack: DietPack, d: DietDay): { kcal: number; p: number; c: number; f: number } {
  const keys = ([B, S, L, D] as MealSlot[]).flatMap((slot) => d[slot]);
  return keys.reduce(
    (acc, k) => {
      const m = mealByKey(pack, k);
      return { kcal: acc.kcal + m.kcal, p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f };
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

/**
 * Loads a pack: creates or refreshes its meal templates, replaces the weekly plan with the
 * chosen week and sets the kcal + macro targets. One transaction; safe to run again.
 * Callers must rebuild the DomainCtx afterwards (settings changed).
 */
export function applyDietPack(ctx: DomainCtx, packId: string, week = 0): { templates: number; planItems: number } {
  const pack = getDietPack(packId);
  const w = pack.weeks[week];
  if (!w) throw new DomainError('INVALID', 'no such week');
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const ts = nowIso(c);
    const names = pack.meals.map((m) => m.name);
    const existing = tx
      .select()
      .from(mealTemplates)
      .where(and(eq(mealTemplates.userId, c.userId), isNull(mealTemplates.deletedAt), inArray(mealTemplates.name, names)))
      .all();
    const idByKey = new Map<string, string>();
    for (const m of pack.meals) {
      const found = existing.find((t) => t.name === m.name);
      const values = { kcal: m.kcal, proteinG: m.p, carbsG: m.c, fatG: m.f, defaultSlot: m.slot, notes: m.notes, archivedAt: null, updatedAt: ts };
      if (found) {
        tx.update(mealTemplates).set(values).where(eq(mealTemplates.id, found.id)).run();
        idByKey.set(m.key, found.id);
      } else {
        const id = c.uuid();
        tx.insert(mealTemplates).values({ ...values, id, userId: c.userId, name: m.name, createdAt: ts }).run();
        idByKey.set(m.key, id);
      }
    }
    const items: WeekPlanInput[] = [];
    w.days.forEach((d, weekday) => {
      for (const slot of [B, S, L, D] as MealSlot[]) {
        for (const key of d[slot]) items.push({ weekday, slot, templateId: idByKey.get(mealByKey(pack, key).key)! });
      }
    });
    replaceWeekPlan(c, items);
    tx.update(settings)
      .set({ kcalTarget: pack.kcalTarget, proteinG: pack.proteinG, carbsG: pack.carbsG, fatG: pack.fatG, updatedAt: ts })
      .where(eq(settings.userId, c.userId))
      .run();
    return { templates: pack.meals.length, planItems: items.length };
  });
}
