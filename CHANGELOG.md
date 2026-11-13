# eTechLog – evidence změn

Každá dodávka má pořadové číslo změny (Z-xxx) a verzi aplikace (`version.js`).
Zip změny obsahuje jen změněné soubory ve správných složkách a popis `ZMENA-xxx.txt`.

| Změna | Verze | Datum | Obsah |
|---|---|---|---|
| Z-001 | 0.1.0 | 2026-11-07 | První testovací verze: PWA pro iPad a web, Supabase synchronizace, ATL, závady, CRS, OFP z PDF. |
| Z-002 | 0.2.0 | 2026-11-08 | Úvodní nastavení správcem: provozovatel, letadla s počátečním stavem z papíru, převzaté závady, uvedení do e-deníku. |
| Z-003 | 0.3.0 | 2026-11-09 | Přihlášení: společný účet iPadů + PIN posádky, osobní e-mail pro web. |
| Z-004 | 0.3.1 | 2026-11-09 | OFP: off-block a vzlet nahoře, EMR rychlosti u vzletových dat, kontrola výškoměrů on ground / RVSM, let mimo RVSM. |
| Z-005 | 0.3.2 | 2026-11-09 | Offline start: odolná instalace, upozornění na Safari, stav „Spuštění bez signálu“. |
| Z-006 | 0.4.0 | 2026-11-09 | Předání dat mezi iPady (QR kód, soubor/AirDrop); PDF z OFP pro tisk a archiv. |
| Z-007 | 0.4.2 | 2026-11-09 | OFP: předvyplnění a limity polí v nastavení, zvýrazněný emergency return, divert (route to alternate). ATL: odstranění závady vedle závady na stránce letu. (Verze 0.4.1 nebyla dodána samostatně.) |
| Z-008 | 0.4.3 | 2026-11-09 | Posádka v OFP (PIC, SIC, palubní průvodčí – nepovinně) s přenosem do ATL při uzavření; výběr PIC/SIC i při zahájení letu na iPadu; role Palubní průvodčí bez PINu. |
| Z-009 | 0.5.0 | 2026-11-10 | Let řízený z OFP: přihlášení jednoho uživatele na iPad, OFP ve třech záložkách (Před letem / Let / Přílet a uzavření), zahájení letu v OFP, posádka s předvolbou, SIC rukou s ověřením CAMO, let podepisuje jen PIC (PIN PIC při uzavření). Opraveno řazení záznamů se stejným časem. |
| Z-010 | 0.5.1 | 2026-11-10 | OFP jako jedna stránka s očíslovanými kroky v pořadí letu (místo záložek); uzavření ve dvou krocích (OFP → kontrola záznamu v ATL a podpis PIC); „Není v seznamu“ odkryje pole pro jméno SIC / palubní průvodčí. |
| Z-011 | 0.5.2 | 2026-11-10 | OFP znovu rozdělené podle fáze letu (Před letem / Let / Přistání a uzavření) s kroky v pořadí letu; bez fajfek, hotový krok zůstává vidět s označením „hotovo“. Divert: výběr ze dvou alternate s vlastní tratí, jiné letiště s ručním routingem; čtečka OFP už neslévá dvě trasy k alternate. Po odhlášení webového účtu se hned ukáže přihlášení. |
| Z-012 | 0.5.3 | 2026-11-10 | Krok Před odletem (ATIS, clearance, výškoměry) přesunut do sekce Let; OFP se po zahájení letu a vyplnění performance otevře rovnou na sekci Let. |
| Z-013 | 0.6.0 | 2026-11-10 | Security search samostatně nahoře v OFP (podpis a odeslání založí let v ATL, pak jeden řádek). Palivo jako samostatný krok OFP, editovatelné až do uzavření, do ATL se zapíše při uzavření. Zip vždy s celou sadou souborů; aplikace upozorní na neúplnou aktualizaci (app.css z jiné verze). |
| Z-014 | 0.6.1 | 2026-11-10 | Přistání (čas, on-block, palivo, přiblížení, počet) na straně Let; strana 3 = Shrnutí letu s editovatelnými časy a palivem a jedním podpisem kapitána. DCT: přeletěný direct nejde zrušit jedním klepnutím, body bez ATO před posledním ATO označené „bez ATO“. |
| Z-015 | 0.6.2 | 2026-11-10 | Shrnutí: divert výrazně označený (i v potvrzení a v ATL „DIVERT · plán …“); palivo natankováno / na odlet převzaté i z letu zahájeného dřívějším způsobem a editovatelné; Pilot Flying i v kroku Posádka a vždy vidět ve shrnutí. Při divertu se nepočítají jako chybějící body hlavní trati, kam se neletělo. |
| Z-016 | 0.6.3 | 2026-11-10 | Oprava označení „hotovo“: krok 5 Odlet a trať až po přistání (čas přistání nebo ATO v destinaci), krok 4 Před odletem až s ATIS, clearance a kompletní kontrolou výškoměrů. |
| Z-017 | 0.6.4 | 2026-11-10 | Pilot Flying jako zaškrtávací pole „PF“ u kapitána a druhého pilota (krok Posádka i Shrnutí); ve Shrnutí posádka pod sebou s PF vpravo. |
| Z-018 | 0.6.5 | 2026-11-10 | Olej v litrech (motor L a P, bez APU). Krok 2 OFP „Palivo a olej před odletem“, olej opravitelný ve Shrnutí. Mechanik na bázi zapíše doplnění oleje po letu (iPad: *Mechanik na bázi – doplnění oleje*, web: *Doplnění oleje*); posádce dalšího letu se předvyplní a do ATL se zapíše u toho letu. Olej v řádku ATL, v potvrzení, v PDF z OFP a v CSV exportu. |
| Z-019 | 0.6.6 | 2026-11-13 | Prozatímní testovací režim mazání záznamů (zapíná správce v Správě, červený pruh na všech zařízeních): mazání jednotlivých letů, OFP, závad (celých nebo jen odstranění / odkladu), CRS, uzemnění, prohlídek, oleje, security a přihlášení; u letu nabídka souvisejících záznamů; hromadně za letadlo, všechny provozní záznamy, nebo úplně od nuly. Vymazání dat v jednom zařízení. Úplná záloha obsahuje i smazané záznamy. |
