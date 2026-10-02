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
  // ---------------------------------------------------------------- reggelik (5–10 perc)
  { key: 'R1', name: 'Zöldséges rántotta pirítóssal', slot: B, kcal: 440, p: 26, c: 35, f: 22,
    notes: '5 perc. 3 tojás, 100 g paprika + paradicsom kockára, 5 g olaj, 2 szelet teljes kiőrlésű kenyér (60 g). A zöldséget 2 percig pirítsd, jöhet a tojás, 2 perc kevergetés. Só, bors, snidling.' },
  { key: 'R2', name: 'Banános zabkása mogyoróvajjal', slot: B, kcal: 535, p: 21, c: 78, f: 16,
    notes: '4 perc, mikróban. 60 g zabpehely + 250 ml 1,5%-os tej egy tálban, 3 perc 800 W-on (félidőben keverd). 1 banán (120 g) karikázva rá, 15 g mogyoróvaj elkeverve, fahéj.' },
  { key: 'R3', name: 'Skyr granolával és gyümölccsel', slot: B, kcal: 420, p: 32, c: 54, f: 7,
    notes: '2 perc. 250 g skyr vagy 0%-os görög joghurt, 40 g granola, 100 g bogyós gyümölcs (fagyasztott is jó), 10 g méz. Csak össze kell rakni.' },
  { key: 'R4', name: 'Túrós-zöldséges reggeli', slot: B, kcal: 460, p: 47, c: 44, f: 10,
    notes: '5 perc. 250 g félzsíros túró sóval, borssal, snidlinggel elkeverve, 2 szelet teljes kiőrlésű kenyérre kenve, 150 g paradicsom + paprika + újhagyma mellé.' },
  { key: 'R5', name: 'Csirkesonkás tojásszendvics', slot: B, kcal: 410, p: 37, c: 31, f: 16,
    notes: '8 perc. 2 tojás tükörtojásnak (3 perc), 2 szelet teljes kiőrlésű kenyér, 60 g csirkesonka, 20 g light sajt, saláta, mustár. Szendvicssütőben 3 perc alatt összesül.' },
  { key: 'R6', name: 'Zabos-túrós palacsinta gyümölccsel', slot: B, kcal: 540, p: 45, c: 48, f: 19,
    notes: '10 perc. 50 g zabpehely, 150 g túró, 2 tojás, csipet só, édesítő, vanília – botmixerrel 30 mp. Teflonban olaj nélkül 3-4 kis palacsinta, oldalanként 2 perc. 100 g gyümölcs mellé.' },
  { key: 'R7', name: 'Sajtos-sonkás omlett salátával', slot: B, kcal: 465, p: 38, c: 20, f: 25,
    notes: '7 perc. 3 tojás felverve, 40 g sonka, 30 g sajt; közepes lángon 3 perc, a sajtot a végén hajtsd bele. Paradicsom + saláta, 1 szelet teljes kiőrlésű kenyér.' },
  { key: 'R8', name: 'Fehérjeturmix zabbal és banánnal', slot: B, kcal: 485, p: 38, c: 65, f: 8,
    notes: '2 perc. 30 g fehérjepor, 40 g zabpehely, 1 banán, 250 ml 1,5%-os tej, jég – turmix. A rohanós reggelek megoldása.' },

  // ---------------------------------------------------------------- ebédek (max 15 perc, egy serpenyő)
  { key: 'E1', name: 'Csirkecsíkok rizzsel és zöldséggel', slot: L, kcal: 660, p: 55, c: 74, f: 14,
    notes: '12 perc. 200 g csirkemell ujjnyi csíkokra, fűszerezve, 10 g olívaolajon 7 perc. Közben 80 g rizs (nyers) – zacskós 10 perc, vagy mikrós/előfőzött 2 perc. 200 g fagyasztott zöldségkeverék mikróban 5 perc.' },
  { key: 'E2', name: 'Csirkés bulgursaláta fetával', slot: L, kcal: 660, p: 51, c: 68, f: 19,
    notes: '12 perc. 80 g bulgur forró vízben 10 perc fedő alatt. Közben 150 g csirkemell csíkok serpenyőben 7 perc. 200 g uborka + paradicsom + lilahagyma, 30 g feta, 10 g olívaolaj, citromlé, petrezselyem. Dobozba is jó.' },
  { key: 'E3', name: 'Gyors paprikás csirke bulgurral', slot: L, kcal: 625, p: 49, c: 60, f: 21,
    notes: '15 perc. 200 g csirkecomb filé csíkokra, 1 hagyma + 1 paprika + 1 paradicsom kockára, 5 g olajon 10 perc, pirospaprika, kevés víz; a végén 50 g 12%-os tejföl. Közben 70 g bulgur forró vízben 10 perc.' },
  { key: 'E4', name: 'Pulykasteak édesburgonyapürével', slot: L, kcal: 590, p: 53, c: 60, f: 12,
    notes: '14 perc. 300 g édesburgonya kockára, fedett tálban mikróban 7 perc, villával összetörve, só, füstölt paprika. Közben 200 g pulykamell szelet 10 g olajon oldalanként 4 perc. 100 g saláta.' },
  { key: 'E5', name: 'Marhahúsos wok rizzsel', slot: L, kcal: 660, p: 44, c: 77, f: 18,
    notes: '12 perc. 150 g sovány marha vékony csíkokra, 200 g fagyasztott wokzöldség, 10 g szezámolaj, 2 ek szójaszósz, gyömbér, fokhagyma – magas lángon 8 perc. 80 g rizs (nyers): zacskós vagy mikrós.' },
  { key: 'E6', name: 'Csirkés-zöldséges tészta paradicsommal', slot: L, kcal: 720, p: 61, c: 71, f: 18,
    notes: '15 perc. 80 g teljes kiőrlésű tészta (nyers) fő 9 perc. Közben 180 g csirkemell kockák 10 g olívaolajon, 150 g cukkini + paprika, 100 ml passata, fokhagyma, bazsalikom. Összeforgatva, 15 g parmezán.' },
  { key: 'E7', name: 'Serpenyős csirkés-brokkolis rizs sajttal', slot: L, kcal: 675, p: 56, c: 67, f: 18,
    notes: '13 perc. 150 g csirkemell kockák serpenyőben 6 perc, 150 g fagyasztott brokkoli hozzá, 70 g rizs (előfőzött vagy mikrós), 100 g 12%-os tejföl, bors; 30 g light sajt a tetejére, fedő alatt 2 perc.' },
  { key: 'E8', name: 'Lecsós darált pulyka rizzsel', slot: L, kcal: 625, p: 45, c: 81, f: 13,
    notes: '13 perc. 150 g darált pulyka 5 g olajon hagymával 5 perc, 250 g paprika kockára + 200 ml paradicsomszósz, 7 perc. 50 g rizs (előfőzött/mikrós) belekeverve. 1 szelet teljes kiőrlésű kenyér mellé.' },
  { key: 'E9', name: 'Sertésszűz érmék bulgurral és zöldséggel', slot: L, kcal: 605, p: 52, c: 61, f: 17,
    notes: '13 perc. 180 g sertésszűz ujjnyi érmékre, mustár, fokhagyma, 10 g olajon oldalanként 3 perc + 3 perc pihenés. 70 g bulgur forró vízben 10 perc, 200 g fagyasztott zöldség (répa, karfiol, brokkoli) mikróban 5 perc.' },
  { key: 'E10', name: 'Csirkegyros tál tzatzikivel', slot: L, kcal: 620, p: 60, c: 64, f: 13,
    notes: '12 perc. 180 g csirkemell csíkok gyros-fűszerrel 5 g olajon 8 perc. 70 g bulgur forró vízben 10 perc. Tzatziki 2 perc: 150 g 0%-os görög joghurt, reszelt uborka, fokhagyma, kapor. Saláta, paradicsom, lilahagyma.' },
  { key: 'E11', name: 'Krémes csirkés-gombás rizs', slot: L, kcal: 625, p: 50, c: 68, f: 15,
    notes: '12 perc. 150 g csirkemell kockák + 150 g szeletelt gomba + 1 kis hagyma 10 g vajon 8 perc. 80 g rizs (előfőzött/mikrós) + 1 dl víz vagy alaplé hozzá, 2 perc, 15 g parmezán elkeverve. Rizottó-érzés negyedannyi idő alatt.' },
  { key: 'E12', name: 'Chili con carne bab nélkül, rizzsel', slot: L, kcal: 575, p: 40, c: 76, f: 10,
    notes: '13 perc. 150 g darált marha (5%) hagymával 5 perc, 200 g paradicsom + paprika + 50 g kukorica (konzerv), chili, római kömény, csipet kakaó, 7 perc. 70 g rizs (zacskós vagy mikrós). Bab nincs, a kukorica ad harapást.' },
  { key: 'E13', name: 'Currys pulykacsíkok zöldséggel és rizzsel', slot: L, kcal: 620, p: 53, c: 76, f: 10,
    notes: '13 perc. 180 g pulykamell csíkok 5 perc, 200 g fagyasztott zöldség + 100 ml light kókusztej + 2 tk currypor, 6 perc. 80 g rizs (zacskós vagy mikrós).' },
  { key: 'E14', name: 'Fokhagymás csirkecomb-csíkok burgonyával', slot: L, kcal: 595, p: 49, c: 50, f: 21,
    notes: '15 perc. 250 g burgonya kockára, fedett tálban mikróban 7 perc. Közben 220 g csirkecomb filé (bőr nélkül) csíkokra, 10 g olajon fokhagymával, rozmaringgal 9 perc; a burgonyát az utolsó 3 percre dobd mellé pirulni. 150 g saláta joghurtos öntettel.' },

  // ---------------------------------------------------------------- vacsorák (max 15 perc)
  { key: 'V1', name: 'Csirkemell saláta fetával', slot: D, kcal: 495, p: 44, c: 22, f: 24,
    notes: '10 perc. 150 g csirkemell csíkok serpenyőben 7 perc. 200 g vegyes saláta (rukkola, paradicsom, uborka, paprika), 30 g feta, 15 g olívaolaj, balzsamecet, 1 szelet teljes kiőrlésű kenyér.' },
  { key: 'V2', name: 'Pulykás lecsó teljes kiőrlésű kenyérrel', slot: D, kcal: 495, p: 45, c: 46, f: 14,
    notes: '12 perc. 150 g pulykamell kockák 10 g olajon 5 perc, 300 g fagyasztott lecsó hozzá, pirospaprika, 7 perc. 2 szelet teljes kiőrlésű kenyér.' },
  { key: 'V3', name: 'Csirkefasírt-pogácsák görög salátával', slot: D, kcal: 540, p: 46, c: 25, f: 23,
    notes: '14 perc. 150 g darált csirke, 1 tojás, 20 g zabpehely, hagyma, fokhagyma, petrezselyem – 4 lapos pogácsa, 5 g olajon oldalanként 4 perc. Görög saláta 3 perc: 250 g zöldség, 30 g feta, olívabogyó.' },
  { key: 'V4', name: 'Cukkinis-pulykás bulgur egytál', slot: D, kcal: 535, p: 53, c: 55, f: 11,
    notes: '14 perc. 150 g darált pulyka 5 perc, 400 g cukkini kockára + 100 ml paradicsomszósz 6 perc. 50 g bulgur (forró vízben 10 perc) belekeverve, 30 g light sajt a tetejére, fedő alatt 2 perc.' },
  { key: 'V5', name: 'Könnyű csirkecurry rizzsel', slot: D, kcal: 500, p: 42, c: 59, f: 10,
    notes: '12 perc. 150 g csirkemell kockák 5 perc, 150 g zöldség (spenót, paprika, hagyma) + 100 ml light kókusztej + curry + gyömbér, 6 perc. 60 g rizs (zacskós vagy mikrós).' },
  { key: 'V6', name: 'Sajtos-sonkás tojáslepény salátával', slot: D, kcal: 475, p: 40, c: 8, f: 30,
    notes: '8 perc. 3 tojás felverve 50 g sonkával, 30 g light sajttal, serpenyőben 4 perc fedő alatt. 200 g saláta + zöldség, 10 g olívaolaj az öntetbe.' },
  { key: 'V7', name: 'Csirkés quesadilla teljes kiőrlésű tortillával', slot: D, kcal: 575, p: 50, c: 50, f: 17,
    notes: '12 perc. 120 g csirkemell csíkok + 100 g paprika + hagyma serpenyőben 6 perc. 2 teljes kiőrlésű tortilla (80 g) közé 40 g light sajttal, száraz serpenyőben oldalanként 2 perc. 50 g salsa + 50 g 12%-os tejföl.' },
  { key: 'V8', name: 'Marhahúsos taco-saláta', slot: D, kcal: 570, p: 46, c: 34, f: 26,
    notes: '10 perc. 150 g darált marha (5%) taco-fűszerrel 7 perc. 200 g saláta + paradicsom + 50 g kukorica (konzerv), 30 g light sajt, 50 g 12%-os tejföl, 30 g tortilla chips morzsolva.' },
  { key: 'V9', name: 'Pulykacsíkok brokkolival és édesburgonyapürével', slot: D, kcal: 515, p: 52, c: 47, f: 11,
    notes: '13 perc. 200 g édesburgonya kockára, fedett tálban mikróban 7 perc, 10 g vajjal összetörve, szerecsendió. 180 g pulykamell csíkok serpenyőben 8 perc. 200 g fagyasztott brokkoli mikróban 4 perc, citrommal.' },
  { key: 'V10', name: '15 perces csirkés zöldségleves tojással', slot: D, kcal: 480, p: 47, c: 39, f: 12,
    notes: '15 perc. 500 ml víz + leveskocka, 150 g csirkemell kockák + 250 g fagyasztott leveszöldség 10 perc, 30 g cérnametélt az utolsó 3 percre, sok petrezselyem. Közben 1 tojás 8 perc főzve, félbevágva bele. 1 szelet teljes kiőrlésű kenyér.' },
  { key: 'V11', name: 'Mikrós töltött burgonya csirkével és cottage cheese-zel', slot: D, kcal: 470, p: 46, c: 51, f: 7,
    notes: '14 perc. 250 g burgonya héjában, villával megszurkálva mikróban 9 perc. Közben 100 g csirkemell csíkok serpenyőben 7 perc. A burgonyát félbevágva: csirke + 150 g cottage cheese + snidling a tetejére. 100 g saláta.' },
  { key: 'V12', name: 'Cézár saláta grillcsirkével', slot: D, kcal: 480, p: 47, c: 30, f: 18,
    notes: '10 perc. 150 g csirkemell csíkok serpenyőben 7 perc. 30 g teljes kiőrlésű kenyér kockára, száraz serpenyőben 3 perc krutonnak. 200 g római saláta, 15 g parmezán, 40 g light cézár öntet.' },
  { key: 'V13', name: 'Zabbundás csirkecsíkok coleslaw-val', slot: D, kcal: 485, p: 53, c: 34, f: 13,
    notes: '12 perc. 180 g csirkemell csíkok tojásfehérjébe, majd 30 g darált zabpehely + füstölt paprika bundába, 5 g olajon oldalanként 4 perc. Coleslaw 3 perc: 200 g zacskós káposzta-répa mix, 0%-os görög joghurt, ecet, só.' },
  { key: 'V14', name: 'Pulyka-stroganoff bulgurral', slot: D, kcal: 520, p: 48, c: 44, f: 17,
    notes: '13 perc. 150 g pulykamell vékony csíkok + 150 g szeletelt gomba + hagyma 5 g olajon 8 perc, mustár, 80 g 12%-os tejföl, 2 perc. 50 g bulgur forró vízben 10 perc.' },

  // ---------------------------------------------------------------- tortillás kaják (max 12 perc)
  { key: 'RT1', name: 'Reggeli burrito tojással és csirkesonkával', slot: B, kcal: 425, p: 37, c: 29, f: 18,
    notes: '7 perc. 2 tojás rántottának 50 g csirkesonkával és 80 g paprika + paradicsom kockával (4 perc). 1 teljes kiőrlésű tortillába (40 g) 30 g light sajttal és 30 g salsával feltekerve, száraz serpenyőben 1-1 perc, hogy összeragadjon.' },
  { key: 'ET1', name: 'Csirkés gyros-wrap tzatzikivel + alma', slot: L, kcal: 665, p: 56, c: 73, f: 15,
    notes: '12 perc. 180 g csirkemell csíkok gyros-fűszerrel 5 g olajon 8 perc. 2 teljes kiőrlésű tortilla (80 g), 100 g tzatziki (0%-os görög joghurt + reszelt uborka + fokhagyma), 150 g saláta + paradicsom + uborka. Feltekerve, 1 alma mellé.' },
  { key: 'ET2', name: 'Marhás fajita tortillában', slot: L, kcal: 660, p: 52, c: 49, f: 27,
    notes: '12 perc. 150 g sovány marha vékony csíkok + 150 g paprika + hagyma csíkok 5 g olajon fajita-fűszerrel, magas lángon 8 perc. 2 teljes kiőrlésű tortilla (80 g), 50 g 12%-os tejföl, 30 g light sajt, lime.' },
  { key: 'VT1', name: 'Csirkés taco (3 db) salátával', slot: D, kcal: 615, p: 51, c: 51, f: 21,
    notes: '12 perc. 150 g csirkemell apró kockák taco-fűszerrel 5 g olajon 7 perc. 3 kis tortilla (3×25 g) száraz serpenyőben 30-30 mp. Tölteni: csirke, 150 g saláta + paradicsom + 30 g kukorica, 40 g salsa, 50 g 12%-os tejföl, 20 g light sajt.' },
  { key: 'VT2', name: 'Pulykás tortilla-pizza salátával', slot: D, kcal: 555, p: 41, c: 45, f: 21,
    notes: '10 perc. 1 nagy teljes kiőrlésű tortilla (60 g) serpenyőben, rá 60 ml passata, 100 g pulykasonka vagy sült pulykacsík, 100 g paprika + gomba, 40 g light mozzarella, oregánó; fedő alatt 5 perc, míg a sajt megolvad. 150 g saláta 10 g olívaolajjal.' },

  // ---------------------------------------------------------------- nasik (0–2 perc)
  { key: 'N1', name: 'Alma + 25 g mandula', slot: S, kcal: 240, p: 5, c: 30, f: 12, notes: '1 közepes alma és egy maréknyi (25 g) natúr mandula.' },
  { key: 'N2', name: 'Skyr bogyós gyümölccsel', slot: S, kcal: 145, p: 17, c: 16, f: 0, notes: '150 g skyr vagy 0%-os görög joghurt, 100 g bogyós gyümölcs.' },
  { key: 'N3', name: 'Fehérjeturmix tejjel', slot: S, kcal: 230, p: 32, c: 14, f: 5, notes: '30 g fehérjepor 250 ml 1,5%-os tejjel, shakerben.' },
  { key: 'N4', name: 'Rizsszelet mogyoróvajjal', slot: S, kcal: 225, p: 7, c: 28, f: 10, notes: '3 db puffasztott rizsszelet, 20 g mogyoróvaj vékonyan.' },
  { key: 'N5', name: 'Cottage cheese uborkával', slot: S, kcal: 215, p: 23, c: 10, f: 8, notes: '200 g cottage cheese, fél uborka, bors, snidling.' },
  { key: 'N6', name: 'Banán + 15 g mogyoróvaj', slot: S, kcal: 195, p: 5, c: 28, f: 8, notes: '1 banán, 15 g mogyoróvaj.' },
  { key: 'N7', name: 'Kakaós protein puding', slot: S, kcal: 155, p: 18, c: 10, f: 6, notes: '200 g 2%-os görög joghurt, 10 g cukrozatlan kakaó, édesítő, csipet só – elkeverve, kész.' },
  { key: 'N8', name: 'Csirkesonka-tekercs sajttal és répával', slot: S, kcal: 220, p: 26, c: 13, f: 5, notes: '80 g csirkesonka 30 g light sajttal feltekerve, 150 g sárgarépa hasábok (bébirépa is jó).' },
  { key: 'N9', name: 'Túró gyümölccsel és fahéjjal', slot: S, kcal: 210, p: 25, c: 15, f: 5, notes: '150 g félzsíros túró, 100 g gyümölcs, fahéj, édesítő.' },
  { key: 'N10', name: 'Popcorn + kis alma', slot: S, kcal: 185, p: 3, c: 40, f: 1, notes: '30 g olaj nélkül pattogatott kukorica (mikrós natúr is jó, sóval), 1 kis alma.' },
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
    'Minden étel legfeljebb 15 perc: egy serpenyő vagy a mikró, zacskós/előfőzött rizs, fagyasztott zöldség. Három, egymást váltó hét (a C hét a tortillás), naponta reggeli + 2 nasi + ebéd + vacsora; a receptben ott az idő is.',
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
    {
      name: 'C hét',
      days: [
        day('RT1', 'N1', 'ET1', 'N3', 'V2'),
        day('R2', 'N5', 'E10', 'N8', 'VT1'),
        day('R6', 'N2', 'ET2', 'N3', 'V5'),
        day('R7', 'N1', 'E12', 'N9', 'VT2'),
        day('R8', 'N3', 'E5', 'N4', 'V13'),
        day('R4', 'N1', 'E14', 'N7', 'V7'),
        day('R1', 'N6', 'E1', 'N8', 'V12'),
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
