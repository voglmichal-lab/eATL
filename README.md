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

**Vzhled:** tlačítko se sluníčkem / měsícem v horní liště přepíná *Podle zařízení* (řídí se nastavením iPadu) →
*Světlý* → *Tmavý*. Volba platí pro dané zařízení a pamatuje si ji i po restartu.

## Aktualizace
Nahrajte na GitHub **všechny soubory ze zipu změny** (zip obsahuje vždy celou sadu souborů aplikace). Pokud by se app.css a app.js lišily verzí, aplikace zobrazí upozornění „Neúplná aktualizace“.
Při úpravách kódu zvyšte číslo verze ve `version.js` i `--etl-build` v `app.css`. Vercel nasadí sám,
iPady si novou verzi stáhnou při dalším otevření se signálem.

### Návrat na předchozí verzi
Nahrajte znovu všechny soubory ze zipu předchozí změny (např. `eatl-Z-026-v0.6.13.zip` pro návrat z 0.6.14). Data zůstávají:
- Zápisy ATIS a clearance z 0.6.14 jsou v OFP uložené i jako běžný text v původních polích, takže je 0.6.13 zobrazí
  i vytiskne. Příletová clearance (nové pole) se v 0.6.13 nezobrazí, ale v datech zůstane.
- PIN změněný v Můj účet platí i v 0.6.13. Nastavení účtu 0.6.13 nezná – v auditu se ukáže jako „user.prefs“ a jinak se ignoruje.
- Text, který někdo mezitím upraví v 0.6.13, má po návratu na 0.6.14 přednost: objeví se jako poznámka pole, nic se neztratí.
- Soubor `atis.js` může na serveru zůstat, 0.6.13 ho nenačítá.
- Z 0.6.16 zpět na 0.6.15 nebo 0.6.13: TAXI DEP / TAXI ARR starší verze nezobrazí (v datech zůstanou), ATC instrukce
  za letu ukáže jako poznámky u bodů i s časem, ATIS s větrem v TEMPO je běžný text.
- **Z 0.7 zpět na 0.6.x: jen se signálem.** 0.7 ukládá záznamy jinak (viz níže); 0.6 si po návratu stáhne deník ze
  serveru znovu a neodeslané záznamy z 0.7 odešle. Bez signálu by 0.6 ukázala prázdný deník, dokud se nepřipojí.

## Jak funguje offline a synchronizace
- Každý podpis se nejdřív uloží v zařízení (IndexedDB) a pak odešle. Bez signálu se
  zápisy řadí do fronty („čeká na signál“) a odejdou samy po připojení.
- Server záznamy jen přidává – nejdou změnit ani smazat. Oprava je nový podepsaný záznam.
- Ostatní zařízení dostávají nové zápisy živě, nebo při dalším otevření.
- Vypršení přihlášení bez signálu posádku nezablokuje – synchronizace jen počká.

### Jádro od 0.7 – aby se aplikace nezpomalovala s přibývajícími záznamy
- **Jeden záznam = jeden řádek v úložišti zařízení** (databáze `etechlog-ev`). Do 0.6 byl celý deník jedna hodnota,
  která se při každé změně přepsala celá. S daty za rok provozu (83 000 záznamů) trvalo uložení jedné hodnoty v OFP
  165 ms na stolním počítači; v 0.7 je to pod 1 ms a na délce deníku to nezávisí.
- Nová hodnota v OFP se do stavu promítne přímo, deník se nepřehrává celý. Celé přehrání zůstává pro podpisy a pro
  záznamy, které dorazí z jiného zařízení se starším časem – výsledek je vždy stejný (hlídá test).
- **Zařízení, které neukládá** (plné úložiště), to řekne: stav „Zařízení neukládá“ a pokyn nechat aplikaci otevřenou
  se signálem. Zápis na disk je potvrzovaný (durability strict).
- **Hodiny zařízení** se při startu a pak každou hodinu porovnají se serverem; rozdíl přes 2 minuty aplikace ohlásí.
  Pořadí záznamů a časy podpisů se řídí hodinami zařízení.
- Záznam z jiného zařízení s posunutým časem nic nerozbije: podepsaný let se znovu neotevře, hodnoty OFP zapsané
  „před“ nahráním OFP se neztratí.
- **Jedno okno na zařízení.** Druhé okno nebo záložka se nespustí (dvě okna by si přepisovala frontu neodeslaných záznamů).
- Záznam, který server odmítne, nezablokuje odeslání ostatních; stav ukáže „server odmítl N“.
- Dotaz na server, který neodpoví, se po 30 s vzdá (dřív mohl zablokovat další stahování až do restartu).
- Nová verze se nenačte pod rukama: počká, až není otevřený formulář, klávesnice ani rozepsané pole.
- Soubory aplikace se vždy ověřují proti serveru (`atis.js`, `ftl.js` byly dřív mimo) – nemíchají se dvě verze.

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
4. OFP je rozdělené podle fáze letu (otevře se na té aktuální a při psaní na ní zůstane – další fázi otevřete záložkou
   nebo *Pokračovat*; Shrnutí se samo otevře až při dalším otevření OFP s on-blockem a palivem po přistání); kroky jsou očíslované, hotový krok má štítek „hotovo“:
   - **Před letem**: 1 Posádka a kontrola OFP · 2 Palivo a olej před odletem (natankováno, na odlet, minimum; olej
     doplněný před letem v litrech, motor L a P – vše jde upravit až do uzavření letu) · 3 Performance.
   - **Let**: 4 Před odletem (ATIS, clearance, taxi, výškoměry) · 5 Odlet a trať (navigační log s řádkem TEĎ pro ATC instrukce, divert) ·
     6 Přílet a přistání (ATIS ARR, příletová clearance, taxi, přistávací data, čas přistání, on-block, palivo po přistání, přiblížení, počet přistání).
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
Lety přepsané z papíru zůstávají v ATL na svém papírovém čísle stránky (v nabídce stránek „(papír)“, v hlavičce
„přepis z papíru“) a neubírají čísla elektronickým stránkám.

### Převzetí historie z papíru – OK-UFF (15.–17. 11. 2026)
Správa → **Lety z papíru** → *Vložit lety OK-UFF z papíru* (jen správce v Kanceláři, testovací režim není potřeba).
Vloží 7 letů ze stránek 600227–600229 včetně paliva, PF, security prohlídky a začátku služby z papíru.
1. Založte OK-UFF: typ C560XL, přechod 15/11/2026, poslední papírová stránka 600226, TTAF 4560:45, cykly 3401
   (převod na str. 600227), první elektronická stránka 600230. Pak *Uvést do e-deníku*.
2. Založte oba piloty (role Posádka). V dialogu přiřaďte zkratky z papíru (PENA = velitel, JOPA = druhý pilot);
   když jméno zkratce odpovídá (např. PEtr NAvrátil → PENA), je předvybrané.
3. Zkontrolujte tabulku proti papíru, nechte zaškrtnutý přechodový bod a podepište. Po vložení musí sedět
   TTAF 4569:10 a cykly 3408 (součet na str. 600229). Podruhé stejné stránky vložit nejde.

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
  služba o čas ukončení později. Čekání mezi lety kratší než 12 h na základně / 10 h mimo ni je součástí služby
  (nanejvýš do 24 h od nástupu). Delší přestávka je odpočinek; když je kratší než předchozí služba, je označený jako nález.
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
- **Začátek služby** je standardně nástup před 1. off-blockem (Nastavení); u letů přepsaných z papíru se bere
  zapsaný „Duty on“ (v detailu letu *Začátek služby … (z papíru)*, ve službě poznámka „podle záznamu“).
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
- Stejně se k letu přiřazuje i **odstranění závady (CRS k závadě)** – hodí se hlavně u závad zapsaných mimo let.
  Na stránce ATL je pak v „Uvolnění do provozu na této stránce“, u letu značka *CRS ✓* a v tabulce závad i se závadou.
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
- *Vložit lety OK-WND z papíru (10.–13. 11.)* (jen v testovacím režimu) – přepis papírových stránek 800151–800154 (8 letů, posádka náhodně
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
Závada zjištěná na zemi (záložka Závady → *Zapsat závadu*) se zapíše na stránku ATL **za vybraný let**
(výchozí je poslední let), v tabulce je jako „na zemi po letu N“. Volba *nepřiřazovat k letu* ji nechá jen v záložce Závady.

## ATIS a clearance – klávesnice eTechLogu
V OFP (Let → Před odletem, Přílet a přistání) se ATIS DEP, ATC clearance, **TAXI DEP**, ATIS ARR, **Příletová clearance**, **TAXI ARR** a při divertu **ATIS DIVERT** píšou
na vlastní klávesnici eTechLogu místo klávesnice iPadu. Ťuknutím na políčko se klávesnice vysune zespodu.
- **Pořadí nehraje roli.** Každé tlačítko ví, do kterého pole patří (ILS, CAVOK, BKN, VRB…), číslice jdou tam, kde je kurzor.
  Přiblížení může zaznít před dráhou i po ní. Když pole v ATIS nezazní, číslice skočí do dalšího.
- **Zápis jako na papír, výsledek jednotný:** FEW 2 0 i FEW 2 0 0 0 → FEW020, viditelnost 1 0 → 9999, 2 5 0 0 8 → 250/08,
  1 2 5 → 12/05, QNH 9 8 9 i 1 0 1 3. Pomlčka u jevů = slabý (light): − SH RA = −SHRA, plus = silný (heavy).
- **ILS** s variantou Z / Y / X a **CAT II**, stav dráhy (DRY, WET, SLUSH… + RWYCC 5/5/5), RVR, vítr s nárazy (gusting) a variable between (240V320).
- **Trend:** TEMPO / BECMG nahoře, pak stejně jako v ATIS – vítr 2 5 0 1 7 G 2 7 = 250/17G27, dohlednost, jevy, oblačnost
  (`TEMPO 250/17G27 4000 −SHRA BKN015CB`). NOSIG jedním ťuknutím.
- **Rozsvícená klávesa** ukazuje, co je zapsané: G = vítr má nárazy, VRB, V, CAVOK / 9999, druh poslední vrstvy oblačnosti,
  ILS / CAT II / L-C-R, FL. Klávesy už nemají trvalý modrý rámeček.
- Číslice mimo rozsah klávesnice nenabídne: dráha 01–36, směr větru a kurz 000–360, QNH 930–1069, čas 0000–2359,
  frekvence 118.000–136.975.
- **Frekvence bez úvodní 1:** 2 0 5 3 = 120.53, 2 3 0 = 123.00, 1 8 0 0 5 = 118.005. S jedničkou (1 2 0 5 3) to funguje taky –
  1 a pak 1, 2 nebo 3 znamená, že jednička je napsaná. Platí v clearance i v ATC instrukcích (FREQ).
- **Nový ATIS:** tlačítko *Nový ATIS* u pole (nebo nové písmeno v INFO). Hodnoty zůstanou, přepíšete jen co se změnilo;
  co je stejné jako v předchozím ATIS, je světlejší se značkou „= K“. Celý jiný ATIS: tlačítko *Celý jiný* hodnoty smaže.
  Předchozí ATIS zůstává pod polem přeškrtnutý (do OFP a PDF jde platný).
- **Divert:** ATIS ARR zůstává pro letiště určení, pro letiště divertu je zvlášť ATIS DIVERT (i v PDF).
- **Rychlé poznámky** se šablonou (TWY _ CLSD) otevřou klávesnici s písmeny, číslicemi a mezerou – doplní se označení dráhy.
- **SID a STAR z OFP:** plánovaná procedura z navigačního logu (např. KOK7S, BISBA3X) je v políčku slabě a potvrdí se ✓.
  SID je u úseku z letiště odletu, STAR u úseku do letiště určení. Když OFP u příletu uvádí jen „STAR“, plán se nenabízí
  a jako bod z OFP se nabídne poslední bod před letištěm (u LOWW–LKPR VLM…).
  Jiná procedura: tlačítko s bodem z OFP (KOK…) a doplní se číslo a písmeno. Bez SID: STRAIGHT (straight ahead), PASSING a výška,
  LEFT / RIGHT a HDG s kurzem, nebo jen HDG a tři číslice. Clearance limit se nezapisuje.
  Místo STAR jen bod příletové tratě: **DCT** a bod (W W 6 7 3 = DCT WW673).
- **Výška v odletové clearance:** jedna až tři číslice = letová hladina (8 0 = FL80), čtyři a víc = stopy (5 0 0 0 = 5000 ft);
  klávesa FL není nutná. Číslice napsané hned v prázdném poli SID jdou do výšky – plán SID zůstane nabídnutý k potvrzení ✓.
- **Příletová clearance** výšku nemá: STAR (nebo DCT bod / HDG), APP a RWY. Číslice v prázdném poli STAR jdou do RWY.
  Přiblížení a dráhu v příletové clearance nabídne z ATIS ARR. Dříve použité hodnoty na letišti (SID, dráhy, TL, výšky,
  frekvence) se nabízejí z ostatních OFP.
- Do OFP, PDF a kontroly vyplnění jde jeden normalizovaný řádek (např. `INFO K · ILS · RWY 26 · TL60 · 240/10 · 9999 · FEW020 · 12/05 · Q1018 · NOSIG`).
  Pod polem je poznámka (klávesnice iPadu) a rychlé poznámky (BIRDS, GNSS RFI…).

### Taxi clearance
**TAXI DEP** (Před odletem) a **TAXI ARR** (Přílet; při divertu pro letiště divertu) – stejná klávesnice s písmeny:
- Pojezdové dráhy, jak zazní: B A 2 = `B, A2`. Každé písmeno začne další dráhu, číslice patří k té předchozí.
  Dvoupísmenná dráha: T A a **SPOJIT** = `TA` (SPOJIT a EXIT jsou ve spodní řadě číslic vedle 0).
- **RWY** – dráha (TAXI DEP ji nabídne z ATIS DEP ✓; L / C / R písmenem hned za číslem), **HP** – holding point / intersection (A 1),
  **STAND** – stání (1 2). Číslice bez dráhy, ke které by patřily, jdou na odletu do RWY, na příletu do STAND.
- **HOLD SHORT**, **CROSS**, **BKTRK** a dráha nebo pojezdová dráha: HOLD SHORT 3 3 = `HOLD SHORT RWY 33`.
- **EXIT** a číslo (nebo označení): M EXIT 1 5 B D = `M, EXIT 15, B, D`.
- Do OFP: `RWY 26 · HP A1 · VIA B, A2, HOLD SHORT RWY 33`, na příletu `VIA B2, A · STAND 12`. Dříve použité trasy
  na letišti se nabízejí z ostatních OFP.

## Ovládání na iPadu
- **ATO jen minutami.** U bodů trati stačí napsat minuty jako na papíře: „40“ → 10:40. Hodinu doplní aplikace podle
  ETO bodu – vezme čas s těmi minutami nejbližší k ETO (ETO 11:01, napsáno 59 → 10:59; ETO 12:58, napsáno 01 → 13:01).
  Bez ETO vezme první takový čas po předchozím ATO. Celý čas (1040) jde psát dál.
- **Enter = další pole.** V běžných polích (palivo, takeoff data, časy, formuláře) přeskočí Enter na další pole – klávesa
  na klávesnici iPadu má nápis *další*. Za posledním polem fáze klávesnice zmizí, ve formuláři poslední Enter odešle.
  Víceřádkové poznámky Enter dál zalamuje.
- **× na klávesnici eTechLogu** (ATIS, clearance, taxi, ATC instrukce) ji zavře. Co je napsané, zůstane; jen ATC
  instrukce, která ještě nebyla přidaná tlačítkem *Přidat ›*, se zahodí. *Hotovo* ji naopak zapíše.
- Synchronizace běží každou minutu na pozadí; stránku překreslí jen tehdy, když se na ní opravdu něco změnilo.

## ATC instrukce za letu
V navigačním logu je řádek **▶ TEĎ** za bodem, který letadlo přeletělo naposledy (podle ATO, chybí-li, podle ETO).
**+ ATC instrukce** otevře klávesnici eTechLogu: CLB, DES, FL, HDG, LEFT / RIGHT, DCT, SPD, M., FREQ, QNH, SQ, HOLD,
EXPECT, MAINT, OWN NAV, písmena (ABC) a číslice. **Přidat ›** zapíše instrukci s časem UTC (`06:30 CLB FL360`)
a hned jde psát další; **Hotovo** zavře. Instrukce se ukládají jako poznámky toho bodu (i v PDF) – tlačítko poznámky
u kteréhokoli bodu otevře stejnou klávesnici, volný text s diakritikou přes *Text z iPadu*.
- Druhý direct za bod prvního directu ho nahradí (DCT LANUX, pak DCT VLM): počítá se jen ten platný, úspora se nesčítá.
- **DCT** nabídne body tratě dál po trase; `DCT MOROK` z klávesnice zkrátí trať stejně jako tlačítko DCT v řádku
  (od bodu, u kterého je instrukce zapsaná).
- U vynechaného bodu (direct) je přeškrtnutý jen název – instrukce zapsané u něj zůstávají čitelné.

## Můj účet
Tlačítko **Můj účet** v horní liště (posádka i kancelář):
- **Zápis ATIS a clearance** – pořadí polí (šipky), vypnutí polí (i taxi), předvolby ICAO / Evropa a USA, rychlé poznámky.
  Platí pro přihlášeného pilota na všech iPadech. Čas ATIS je ve výchozím stavu vypnutý.
- **Změna PINu** – současný PIN a dvakrát nový.

## Odmrazování (DEICE)
V OFP v kroku *Před odletem* je tlačítko **DEICE** – zatím jen připravené místo pro záznam o odmrazování do ATL, obsah se doplní.

## PDF z OFP
V OFP tlačítko **PDF / tisk** – vytvoří PDF přímo v iPadu (i bez signálu). Z nabídky sdílení jde vytisknout (AirPrint), uložit do Souborů nebo poslat.

## Omezení testovací verze
- PIN posádky ověřuje zařízení. Otisky PINů jsou čitelné pro přihlášená zařízení –
  pro ostrý provoz se ověření přesune na server.
- Archivní PDF stránek ATL/OFP, e-mailová upozornění a napojení na Fl3xx zatím nejsou.
- Bezplatný tarif Supabase uspí projekt po delší nečinnosti a nemá zálohy ke stažení.
  Pravidelně stahujte **Správa → Stáhnout úplnou zálohu (JSON)**.
- První spuštění na novém zařízení potřebuje internet.

### Otevřené body po auditu 0.7 (k rozhodnutí)
- **Oprávnění hlídá jen aplikace.** Server přijme od přihlášeného účtu jakýkoli záznam (i `user.upsert` s rolí
  správce, `rec.reset`) a vydá všem všechno včetně otisků PINů; čtyřmístný PIN jde z otisku uhodnout okamžitě.
  Patří do odložené bezpečnostní fáze, ale před přístupem OPS / SM z webu je to nutné: pravidla podle typu účtu
  v Supabase, PINy ověřovat na serveru nebo otisk s pomalou funkcí, omezení počtu pokusů.
- **Testovací mazání** (`rec.del`, `rec.reset`) před ostrým provozem vypnout i na serveru.
- **Čísla stránek ATL a čísla závad se počítají z pořadí záznamů.** Let doplněný zpětně (iPad dlouho offline,
  oprava data letu) přečísluje všechny pozdější stránky. Pro ostrý provoz číslo přidělit při otevření letu a uložit.
- **Velikost deníku:** rok provozu dvou letadel ≈ 30 MB, z toho 96 % jsou průběžné hodnoty OFP (`ofp.fill`).
  Zařízení drží celý deník v paměti a nové zařízení ho stahuje celý. Na několik let to stačí; pak archivovat
  průběžné hodnoty uzavřených OFP (ponechat jen výsledný stav).
- **Záloha** je ruční (JSON). Pro ostrý provoz placený tarif Supabase se zálohami, nebo pravidelný export.

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
| `atis.js` | zápis ATIS, clearance, taxi a ATC instrukcí klávesnicí eTechLogu |
| `supabase/schema.sql` | databáze, pravidla přístupu a živá synchronizace |
