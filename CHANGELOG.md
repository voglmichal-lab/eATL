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
