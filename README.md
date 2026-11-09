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
   Doporučení: jeden účet na každý iPad (`ipad-wnd@…`) a jeden pro každého, kdo pracuje z počítače.
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
Upravte kód, v `version.js` zvyšte číslo verze a nahrajte na GitHub. Vercel nasadí sám,
iPady si novou verzi stáhnou při dalším otevření se signálem.

## Jak funguje offline a synchronizace
- Každý podpis se nejdřív uloží v zařízení (IndexedDB) a pak odešle. Bez signálu se
  zápisy řadí do fronty („čeká na signál“) a odejdou samy po připojení.
- Server záznamy jen přidává – nejdou změnit ani smazat. Oprava je nový podepsaný záznam.
- Ostatní zařízení dostávají nové zápisy živě, nebo při dalším otevření.
- Vypršení přihlášení bez signálu posádku nezablokuje – synchronizace jen počká.

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
| `vendor/` | Supabase klient a čtečka PDF (pdf.js) – kvůli offline běhu lokálně |
| `fonts/`, `fonts.css` | písma (lokálně kvůli offline) |
| `supabase/schema.sql` | databáze, pravidla přístupu a živá synchronizace |
