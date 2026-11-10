# eTechLog – testovací verze

Elektronický technický deník (ATL) a OFP pro iPad a web. Běží jako webová aplikace (PWA):
na iPadu se přidá na plochu a funguje i bez signálu. Data se synchronizují přes Supabase.

> Testovací provoz. Neslouží jako úřední záznam – papírový technický deník platí dál.

## Nasazení (jednou, cca 20 minut)

### 1. Supabase – databáze a přihlášení
1. [supabase.com](https://supabase.com) → **New project**, region **Frankfurt (eu-central-1)**.
2. **SQL Editor → New query** → vložte celý obsah `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers**: vypněte **Allow new users to sign up**
   (účty zakládáte jen vy).
4. **Authentication → Users → Add user**: e-mail + heslo, zaškrtněte *Auto Confirm User*.
   - **Jeden společný účet pro všechny iPady.** Na iPadu se pak posádka vybírá jménem
     a podepisuje PINem.
   - **Osobní účet pro každého, kdo pracuje z webu.** Stejný e-mail zadejte v aplikaci
     u uživatele (**Správa → Uživatelé → Osobní e-mail**). Po přihlášení tímto e-mailem
     aplikace člověka pozná sama, každý podpis ale dál potvrzuje PINem.
5. **Project Settings → API**: zkopírujte **Project URL** a **anon / publishable key**
   do `config.js`. Klíč **service_role** do aplikace nikdy nedávejte.

### 2. GitHub
Nahrajte obsah této složky do repozitáře (např. `voglmichal-lab/etechlog`, privátní).

### 3. Vercel
**Add New → Project** → vyberte repozitář → Framework Preset **Other**, žádný build
příkaz, Output Directory ponechte prázdné → **Deploy**.

### 4. iPad
1. Otevřete adresu z Vercelu v **Safari** (se signálem).
2. **Sdílet → Přidat na plochu**. Dál otevírejte aplikaci vždy z ikony na ploše.
3. Přihlaste zařízení účtem z kroku 1.4.
4. Na úplně prvním zařízení aplikace nabídne založení účtu správce a otevře **Úvodní nastavení**:
   1. **Provozovatel a provoz**: název, AOC/CAMO, základny, pravidla služby, číslování stránek.
   2. **Letadla a počáteční stav**: z poslední podepsané stránky papírového deníku opište
      TTAF, cykly, poslední papírovou a první elektronickou stránku a převezměte všechny
      otevřené a odložené závady. Podpisem **Uvést do e-deníku** potvrdíte přechodový bod.
      Do té doby posádky letadlo na iPadu nevidí.
   3. **Posádky a mechanici** s PINy.
   4. iPady v letadlech.

## Aktualizace
Nahrajte na GitHub **všechny soubory ze zipu změny** (zip obsahuje vždy celou sadu souborů aplikace). Pokud by se app.css a app.js lišily verzí, aplikace zobrazí upozornění „Neúplná aktualizace“.
Při úpravách kódu zvyšte číslo verze ve `version.js` i `--etl-build` v `app.css`. Vercel nasadí sám,
iPady si novou verzi stáhnou při dalším otevření se signálem.

## Jak funguje offline a synchronizace
- Každý podpis se nejdřív uloží v zařízení (IndexedDB) a pak odešle. Bez signálu se
  zápisy řadí do fronty („čeká na signál“) a odejdou samy po připojení.
- Server záznamy jen přidává – nejdou změnit ani smazat. Oprava je nový podepsaný záznam.
- Ostatní zařízení dostávají nové zápisy živě, nebo při dalším otevření.
- Vypršení přihlášení bez signálu posádku nezablokuje – synchronizace jen počká.

## Předání dat mezi iPady bez signálu
**⇄ Druhý iPad** (u registrace letadla, v OFP nebo v panelu synchronizace):
- **QR kód** – předávající iPad ukáže střídající se QR kódy, druhý je načte kamerou. Nepotřebuje Wi-Fi ani Bluetooth.
- **Soubor** – přes nabídku sdílení (AirDrop); na druhém iPadu *Načíst soubor*.
Data se jen doplní, nic se nepřepíše ani nezdvojí. Převzaté záznamy odešle na server i přebírající iPad.

## OFP – předvyplnění, limity, divert
- **Správa → OFP – předvyplnění a limity**: výchozí hodnoty polí (např. Flaps 15, VFTO/VFS 160) a maxima (např. hmotnosti), i jen pro určitý typ letadla. Předvyplnění se uloží do OFP při nahrání.
- **DIVERT**: pod navigačním logem je tlačítko pro každé alternate z OFP (až dvě – každé má svou route to alternate s ETO od začátku divertu) a *DIVERT – jiné letiště* s ručním routingem (bod, čas přeletu, palivo). Letiště přistání se do ATL přenese jako letiště divertu.

## Let na iPadu – postup
1. **Přihlášení**: letadlo (iPad si ho pamatuje) → *Kdo jste?* → PIN. Přihlašuje se jen ten, kdo s iPadem pracuje.
2. **Nahrát OFP** (PDF z NAVsystemu) → *Otevřít OFP*.
3. **Security search** je v OFP úplně nahoře: výsledek (+ předletová prohlídka) → *Podepsat a odeslat security search*.
   Tím se let založí v ATL a firma vidí, že security je hotová. Pak je z karty jeden řádek a posádka pracuje jen v OFP.
4. OFP je rozdělené podle fáze letu (otevře se na té aktuální); kroky jsou očíslované, hotový krok má štítek „hotovo“:
   - **Před letem**: 1 Posádka a kontrola OFP · 2 Palivo před odletem (natankováno, na odlet, minimum – jde upravit až do
     uzavření letu) · 3 Performance.
   - **Let**: 4 Před odletem (ATIS, clearance, výškoměry) · 5 Odlet a trať (navigační log, divert) · 6 Přílet.
   - **Přistání a uzavření**: 7 časy, palivo po přistání, přiblížení, PF, závady → *Uzavřít OFP a přenést do ATL*
     (krok 1/2 uzavření OFP, krok 2/2 kontrola záznamu v ATL včetně paliva a podpis kapitána).
5. **Let podepisuje jen PIC.** Když je na iPadu přihlášený někdo jiný, PIC zadá svůj PIN při uzavření.

Posádka se předvolí podle předchozího letu toho dne na stejném letadle, jinak podle přihlášení na iPadech letadla –
vždy jen jako návrh ke kontrole. PIC se vybírá jen ze seznamu; SIC, který v systému není, jde napsat (jméno, licence)
a v ATL je označený „ověřit“ pro CAMO – v seznamu volba *Není v seznamu*, pak se objeví pole pro jméno (stejně u palubní průvodčí). Palubní průvodčí se zakládají s rolí *Palubní průvodčí* (bez PINu).

*Let bez OFP* (přelet, OFP nejde nahrát) zůstává jako záloha na úvodní obrazovce.

## Závady v ATL
Na stránce deníku je u každé závady vedle sebe její odstranění (CRS) nebo odklad, i když proběhlo jiný den.

## PDF z OFP
V OFP tlačítko **PDF / tisk** – vytvoří PDF přímo v iPadu (i bez signálu). Z nabídky sdílení jde vytisknout (AirPrint), uložit do Souborů nebo poslat.

## Omezení testovací verze
- PIN posádky ověřuje zařízení. Otisky PINů jsou čitelné pro přihlášená zařízení –
  pro ostrý provoz se ověření přesune na server.
- Archivní PDF stránek ATL/OFP, e-mailová upozornění a napojení na Fl3xx zatím nejsou.
- Bezplatný tarif Supabase uspí projekt po delší nečinnosti a nemá zálohy ke stažení.
  Pravidelně stahujte **Správa → Stáhnout úplnou zálohu (JSON)**.
- První spuštění na novém zařízení potřebuje internet.

## Soubory
| Soubor | Co obsahuje |
|---|---|
| `index.html`, `app.css`, `app.js` | aplikace |
| `config.js` | adresa a veřejný klíč Supabase |
| `version.js` | číslo verze (zvyšte při každém nasazení) |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline režim a ikona na ploše |
| `vendor/` | knihovny – Supabase, čtení PDF (pdf.js), tvorba PDF (pdf-lib, fontkit), QR kódy (qrcode, jsQR); lokálně kvůli offline běhu |
| `fonts/pdf/` | písma pro PDF s českou diakritikou (SIL OFL) |
| `fonts/`, `fonts.css` | písma (lokálně kvůli offline) |
| `supabase/schema.sql` | databáze, pravidla přístupu a živá synchronizace |
