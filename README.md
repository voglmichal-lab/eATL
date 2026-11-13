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
      TTAF, cykly, poslední papírovou a první elektronickou stránku (jen při číslování „jako na papíře“; při číslování
      registrací a datem se nezadává) a převezměte všechny
      otevřené a odložené závady. Podpisem **Uvést do e-deníku** potvrdíte přechodový bod.
      Do té doby posádky letadlo na iPadu nevidí.
   3. **Posádky a mechanici** s PINy. U mechanika, který smí uvolňovat do provozu, zaškrtněte
      *Oprávnění k uvolnění do provozu* (a vyplňte licenci) – jen ten pak podepisuje CRS.
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
   - **Před letem**: 1 Posádka a kontrola OFP · 2 Palivo a olej před odletem (natankováno, na odlet, minimum; olej
     doplněný před letem v litrech, motor L a P – vše jde upravit až do uzavření letu) · 3 Performance.
   - **Let**: 4 Před odletem (ATIS, clearance, výškoměry) · 5 Odlet a trať (navigační log, divert) ·
     6 Přílet a přistání (ATIS ARR, přistávací data, čas přistání, on-block, palivo po přistání, přiblížení, počet přistání).
   - **Shrnutí a uzavření**: 7 Shrnutí letu – časy odletu a příletu i palivo jdou opravit, block/flight, posádka, PF,
     olej, závady, chybějící položky OFP → *Potvrdit a zapsat do ATL* (podpis kapitána).
   Navigační log: DCT, který je už přeletěný (cílový bod má ATO), nejde zrušit jedním klepnutím – pro opravu nejdřív
   smažte ATO u cílového bodu. ATO letiště odletu = čas vzletu a ATO cílového letiště (při divertu letiště divertu)
   = čas přistání – vyplní se samy, ručně zapsaná hodnota má přednost.
   Poznámka k bodu: klepnutím na „+ pozn.“ se otevře rychlé zadání – **FL / ALT** (výška ve stopách, tlačítkem FL
   hladina; CLB ↑ / DESC ↓), **FREQ** (stačí 133355 → 133,355), **HDG** (0–360, ← vlevo / → vpravo) a **Text**.
   U jednoho bodu může být víc záznamů, × jednotlivý smaže.
5. **Let podepisuje jen PIC.** Když je na iPadu přihlášený někdo jiný, PIC zadá svůj PIN při uzavření.

Posádka se předvolí podle předchozího letu toho dne na stejném letadle, jinak podle přihlášení na iPadech letadla –
vždy jen jako návrh ke kontrole. PIC se vybírá jen ze seznamu; SIC, který v systému není, jde napsat (jméno, licence)
a v ATL je označený „ověřit“ pro CAMO – v seznamu volba *Není v seznamu*, pak se objeví pole pro jméno (stejně u palubní průvodčí). Palubní průvodčí se zakládají s rolí *Palubní průvodčí* (bez PINu).

*Let bez OFP* (přelet, OFP nejde nahrát) zůstává jako záloha na úvodní obrazovce. V Kanceláři se po *Začít let*
nabídne *Nahrát OFP (PDF)* (otevře se rovnou OFP dalšího letu), *Let bez OFP*, případně už nahraná OFP.
*Zapsat let ručně (z papíru)*: nahoře je povinné číslo stránky papírového deníku, ze které se let přepisuje.

## Olej
Olej se zapisuje v litrech, zvlášť motor L a P (APU se nepíše). V ATL patří k letu, před kterým byl doplněn.
- **Posádka mezi lety** napíše doplněný olej do kroku 2 *Palivo a olej před odletem* dalšího letu.
- **Mechanik na bázi** po letu: na iPadu letadla na úvodní obrazovce *Mechanik na bázi – doplnění oleje* → jméno a PIN →
  litry L / P → podpis (z webu: letadlo → *Doplnění oleje*). Olej zapsaný při prohlídce se zapíše stejně.
  Posádka dalšího letu ho vidí v přehledu letadla a na kartě security search a má ho **předvyplněný** v kroku 2
  („Předvyplněno – doplnil(a) …“). Když posádka doplní ještě sama, přičte to. Při uzavření letu se zápis mechanika
  připojí k tomuto letu (v detailu letu „z toho na zemi: …“) a dalšímu letu už se nenabízí.
- Když posádka zapíše méně, než doplnil mechanik, potvrzení před podpisem na to upozorní.
- Všude, kde se olej zapisuje (OFP, uzavření letu bez OFP, ruční zápis letu, prohlídka), jsou dvě pole: motor L a motor P.

## Doba služby (FTL)
Počítá se z letů v ATL podle EASA ORO.FTL / CS FTL.1 (soubor `ftl.js`). Přístup: **Správce, CAMO, OPS a Safety manažer**
vidí všechny posádky (záložka *Doba služby*), **pilot vidí svou službu** (záložka *Moje služba*, na iPadu tlačítko
*Moje služba* v liště dne). Role OPS a Safety manažer se přidělují ve Správě → uživatel (jen čtení, nepodepisují lety ani CRS).
- **Služba**: nástup = první off-block − nástup na základně / mimo základnu (Nastavení), FDP končí posledním on-blockem,
  služba o čas ukončení později. Dvě skupiny letů, mezi kterými není minimální odpočinek, jsou jedna služba.
- **Max FDP** podle tabulky ORO.FTL.205 (aklimatizovaná posádka, podle místního času nástupu a počtu úseků); při časovém
  rozdílu > 2 h se stav aklimatizace určí podle tab. 1 (B / D / X – při X tabulka pro neznámý stav).
- **Split duty** (CS FTL.1.220, jen pokud ji povoluje provozní příručka – Nastavení): otevírá se v ATL při uzavření letu,
  po kterém přerušení začíná (Shrnutí OFP / uzavření letu: *Po tomto letu následuje přerušení služby* + ubytování),
  zavírá se samo nástupem na další let – posádka to vidí na kartě security search dalšího letu. Přerušení = mezera mezi
  on-blockem a dalším off-blockem minus čas na povinnosti (Nastavení, min. 30 min), musí mít ≥ 3 h; FDP se prodlouží
  o 50 % přerušení. Při jiném než vhodném ubytování se počítá nejvýš 6 h a bez části ve WOCL. Upravit jde v detailu letu
  (PIC, CAMO, OPS, Safety) – změna je v historii letu a v auditu.
- **WOCL** (02:00–05:59 místního času aklimatizace): minuty FDP ve WOCL, označení časný nástup / pozdní konec / noční služba.
- **Odpočinek** před službou (ORO.FTL.235: základna max(12 h, předchozí služba), jinde max(10 h, předchozí služba)).
- **Kumulativní limity** (ORO.FTL.210): služba 60 h / 7 dní, 110 h / 14 dní, 190 h / 28 dní; let (block) 100 h / 28 dní,
  900 h / kalendářní rok, 1000 h / 12 měsíců – zelená / oranžová (nad 90 %) / červená.
- **Co zatím ne:** služby bez letu (pohotovost, přelet jako cestující, simulátor, kancelář), prodloužení FDP, odpočinek
  během letu, zkrácený a týdenní odpočinek, lety před uvedením letadla do e-deníku. Aplikace to u výpočtu vždy uvádí.
- Časová pásma: evropská a blízká letiště jsou zabudovaná, ostatní (USA, Kanada, Rusko…) se doplní v Nastavení
  (`KTEB=America/New_York`).
- **Export CSV (pro Fl3xx)** – služby všech posádek se skutečnými časy; připraveno pro pozdější napojení na Fl3xx.
- Jeden člověk nemůže být na dvou letech zároveň: zahájení letu, uzavření, ruční zápis i oprava letu to odmítnou
  (otevřený let nebo časově překrývající se let na jiném letadle). Starší překrývající se záznamy výpočet označí.

## Uvolnění do provozu (CRS)
- **Podepsat CRS** (samostatné i odstranění závady) může jen mechanik s *Oprávněním k uvolnění do provozu*
  (Správa → uživatel). Stávajícím mechanikům je potřeba oprávnění zaškrtnout.
- Mechanik bez oprávnění může zapisovat závady, olej, uzemnit a **připravit uvolnění** (*Připravit uvolnění (CRS)*,
  u závady *Odstranit – připravit k podpisu CRS*). Připravené uvolnění je vidět u letadla, v záložce Uvolnění a u závady;
  osvědčující personál ho otevře (*Zkontrolovat a podepsat*), formulář je předvyplněný, doplní licenci a podepíše.
  Připravit/zrušit jde i znovu (*Zrušit přípravu*).
- CRS se **přiřazuje k letu** (výchozí je poslední let) – objeví se na stránce ATL toho letu a posádka dalšího letu ho
  vidí v přehledu letadla („Uvolněno do provozu od posledního letu“), i když nejde o odstranění závady (např. Weekly check).
- V záložce Uvolnění jde každou položku rozkliknout: detail CRS (WO, let, TTAF/cykly, organizace, kdo podepsal
  a s jakou licencí, kdo připravil), u závady odstranění a odklad, u uzemnění důvod a kdy skončilo.

## Záloha a export databáze
- Správa → *Stáhnout úplnou zálohu (JSON)* – celý log podpisů z tohoto zařízení.
- Stejnou zálohu přímo z databáze: Supabase → SQL Editor → obsah `supabase/export.sql` → Run → výslednou buňku
  uložit jako `.json`. Jen čte, nic nemění.
- *Obnovit ze zálohy* je ve Správě a u prázdné databáze i na stránce Úvodní nastavení.

## Testovací režim – mazání záznamů (prozatímní)
Jen pro testování, před ostrým provozem se vypne (a z aplikace později zmizí).
- **Zapnutí:** Kancelář → *Správa* → *Testovací režim: mazání záznamů* → *Zapnout* (PIN správce). Na všech zařízeních
  pak svítí červený pruh TESTOVACÍ REŽIM. Mazat může jen správce v Kanceláři, v režimu posádky se mazání nenabízí.
- **Jednotlivé záznamy:** záložka *Mazání (test)* u letadla (lety, OFP, závady, CRS, uzemnění, prohlídky, olej,
  security, přihlášení), nebo odkaz „… (test)“ v detailu letu, u OFP, v historii závady (celá závada, jen odstranění,
  jen odklad) a u CRS. U letu se nabídnou i související záznamy (jeho OFP, závady zapsané u letu, CRS vydané po tomto
  letu, olej zapsaný k letu, předletová prohlídka podepsaná se security) – zaškrtnuté, jde je odškrtnout.
- **Najednou:** *Smazat všechny záznamy OK-XXX* (v záložce u letadla), *Smazat všechny provozní záznamy* (všechna
  letadla; letadla, uživatelé a nastavení zůstanou) a *Začít úplně od nuly* (i letadla, uživatelé, nastavení – všechna
  zařízení se vrátí na první spuštění). Hromadné mazání chce napsat SMAZAT a PIN.
- *Vložit lety OK-WND z papíru (10.–13. 11.)* – přepis papírových stránek 800151–800154 (8 letů, posádka náhodně
  z pilotů v systému, PF podle papíru). Nabídne smazat lety OK-WND z těch dní, které už v deníku jsou, a nastavit
  přechodový bod na stav před stránkou 800151 (TTAF 3166:15, cykly 2043), aby se hodiny nezapočítaly dvakrát.
- Smazání je podepsaný záznam, který se rozešle na všechna zařízení (i přes QR / soubor); v databázi se nic fyzicky
  nemaže, záznamy se jen přestanou zobrazovat a počítat. Úplná záloha (JSON) obsahuje i smazané, takže doporučuji ji
  před větším mazáním stáhnout.
- **Fyzicky prázdná databáze** (volitelné, např. před ostrým provozem): ověřte, že všechna zařízení mají vše odeslané →
  Supabase → SQL Editor → `truncate table public.events;` → na každém zařízení Kancelář → Správa →
  *Vymazat data v tomto zařízení* (jinak by si zařízení drželo staré záznamy).

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
| `ftl.js` | výpočet doby letu a služby (ORO.FTL / CS FTL.1) |
| `supabase/schema.sql` | databáze, pravidla přístupu a živá synchronizace |
