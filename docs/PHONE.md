# LifeOS a telefonon

Két út van. Az **A** azonnal megy, a **B** adja a „rendes” telepített appot gyors frissítéssel.

## A) Expo Go – azonnali próba, élő frissítés

Feltétel: a gép és a telefon **ugyanazon a wifin** van, a gépen fut a fejlesztői szerver.

1. Telefonon: Play Áruház → **Expo Go** telepítése.
2. Gépen, a projekt mappájában: `npm start`
3. Telefonon: Expo Go → *Scan QR code* → a terminálban megjelenő QR-kód.

Minden mentett kódváltozás 1–2 másodperc alatt megjelenik a telefonon, újratelepítés nélkül.
Ha nem találja a gépet (céges/vendég wifi, tűzfal): `npx expo start --tunnel`.

Korlátok: csak addig fut, amíg a gépen megy az `npm start`; az adatok az Expo Go-n belül élnek; **Androidon az Expo Go nem engedi az értesítéseket** (SDK 53 óta), ezért ott az app értesítések nélkül fut. Az emlékeztetőket a B út telepített appjában lehet kipróbálni.

## B) Saját telepített app (APK) + gyors frissítés (EAS)

Ingyenes Expo-fiók kell hozzá: https://expo.dev/signup

### Egyszeri beállítás

```bash
npm install -g eas-cli
eas login
eas init
eas update:configure
git add -A && git commit -m "Configure EAS" && git push
```

- `eas init` összeköti a projektet a fiókoddal (projekt-azonosító kerül az `app.json`-ba).
- `eas update:configure` telepíti az `expo-updates` csomagot és beírja a frissítési URL-t.

### Első telepítés (felhőben épül, kb. 10–20 perc)

```bash
npm run phone:build
```

A végén kapsz egy linket/QR-kódot: telefonon megnyitod, letöltöd az **APK**-t és telepíted
(az Android rákérdez az „ismeretlen forrásból telepítés” engedélyre). Ez az app már a gép nélkül is fut.

### Későbbi változtatások – újratelepítés nélkül (~1 perc)

```bash
npm run phone:update -- "mit változtattam"
```

Az app a **következő két indításnál** veszi át: az elsőnél letölti, a másodiknál már az új fut.
(Zárd be teljesen és nyisd meg újra kétszer.)

### Mikor kell mégis új APK (`npm run phone:build`)?

Csak ha **natív** dolog változik: új natív csomag (`npx expo install valami`), `app.json` jogosultság/ikon/név,
Expo SDK frissítés, vagy az `app.json` `version` mezője. Ilyenkor a `runtimeVersion` is lép, és a régi APK
nem kapja meg az új frissítéseket. Sima képernyő-, logika-, szöveg- és stílusváltozásnál elég a `phone:update`.

### Adatok

Az adatbázis a telefonon él. APK-frissítés és OTA-frissítés **nem törli**, az app eltávolítása igen.
Előtte: Vezérlőpult → Mentés és visszaállítás → adatbázis mentése.

## C) Haveroknak iPhone-ra – Expo Go, ingyen, gép nélkül

Igazi App Store-os / TestFlight-os telepítéshez Apple Developer Program kellene (évi 99 USD). Helyette az
Expo Go tölti be a publikált appot az Expo szerveréről: letöltés után offline is fut, a gépnek nem kell mennie.

**Nekik (egyszer):**
1. App Store → **Expo Go** telepítése.
2. Az alábbi linket megnyitni (vagy a `docs/friends-qr.png` QR-kódot beolvasni a Kamerával):
   `exp://u.expo.dev/c7a649e9-ca93-48dc-9d8e-f78bb6fcb765?channel-name=friends&runtime-version=exposdk:57.0.0`
3. Az első betöltéshez net kell; utána az Expo Go kezdőlapján a *Recently opened* alatt ott marad.
4. Első megnyitáskor engedélyezni az értesítéseket (helyi, ütemezett értesítések – Expo Go-ban is mennek).

**Neked, minden változtatás után:**

```bash
npm run friends:update -- "mit változtattam"
```

Ez ugyanaz a kód, mint a saját `phone:update`-ed, csak a `friends` csatornára és az Expo Go futtatókörnyezetére
(`exposdk:57.0.0`, lásd `app.config.js`) publikálva. A haverok a következő megnyitáskor kapják meg.

Korlátok: az ikon és az értesítés neve „Expo Go”; az adat a saját telefonjukon, az Expo Go-n belül él (az Expo Go
törlésével elvész, a Mentés menüben lehet exportálni); Expo SDK-frissítés után nekik is frissíteniük kell az Expo Go-t.
