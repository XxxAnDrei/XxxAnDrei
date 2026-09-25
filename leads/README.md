# Leady: firmy bez webu alebo so slabým webom

Stav k 25. 9. 2026 je **56 overených leadov** (47 SK, 9 CZ). Priorita A má 19 leadov, B 29 a C 8.

## Obmedzenia týchto dát

- **Žiadny web sme priamo neotvorili.** Sieťová politika tohto cloud prostredia blokuje prístup na weby
  firiem, takže stav webu je odvodený z výsledkov vyhľadávania (titulky, URL, zhrnutia). Pri `weak_site`
  sa pred návštevou pozri na web sám (2 minúty).
- **Session mala limit 200 vyhľadávaní** a agenti ho vyčerpali. Pokrytie je preto nerovnomerné: západné
  Slovensko je pokryté dobre, zvyšok SK a ČR len čiastočne.
- `confidence: low` znamená, že pri leade chýba jedno overovacie vyhľadávanie. Pred oslovením skontroluj
  posledné príspevky na FB (či firma v 2026 funguje).

## Skóre (0–10) a priorita

| Zložka | Body |
|---|---|
| Stav webu | žiadny alebo len FB/IG = 3, len booking platforma = 2, slabý web = 2 |
| Dopyt (recenzie, počet ľudí, pobočky, ceny) | 0–3 |
| Zhoda s produktom | priamo P1–P5 = 2, len web = 1 |
| Dosah | Nitriansky, Trnavský alebo Bratislavský kraj = 2, inde = 1 |

**Priorita A** = západné SK a zároveň (skóre ≥ 9 s istotou aspoň medium, alebo skóre 8 s istotou high).
Tieto leady navštív ako prvé.

## Kde sú dáta

Tento repozitár je **verejný**, preto zoznam firiem a ich kontakty ležia len lokálne v `leads/private/`
(v `.gitignore`) a v súkromnom trackeri na claude.ai. Do gitu nepatria mená firiem, kontakty ani pitche.

- `leads/private/leads.json` je hlavné úložisko, ktoré zapisuje `scripts/merge-leads.py`.
- `leads/private/leads.csv` je export pre Excel alebo Google Sheets.
- `leads/private/trasy.md` sú trasy na osobné návštevy.
- `leads/private/na-overenie.md` sú kandidáti, ktorých treba ešte overiť.

## Formát záznamu

```json
{"id":"slug","tier":"A|B|C","score":0,"confidence":"high|medium|low","name":"","category":"","city":"",
 "region":"","country":"SK|CZ","address":null,"phone":null,"email":null,
 "web_status":"none|social_only|platform_only|weak_site","current_url":null,"facebook":null,
 "instagram":null,"booking_platform":null,"demand_signals":"","product_fit":"P1|P2|P3|P4|P5|W",
 "pitch":"","evidence":["dopyt → čo ukázal"],"segment":"","status":"nový","found":"YYYY-MM-DD","notes":""}
```

Kontakty sú **iba verejné firemné údaje**, ktoré agent reálne videl. Pred e-mailom si prečítaj
`playbook/oslovovanie.md`: v ČR je cold e-mail firmám nezákonný.

## Ďalšie kolo

1. V nastaveniach prostredia zvýš limit vyhľadávaní (`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`) alebo
   pridaj `GOOGLE_PLACES_API_KEY`. S kľúčom `scripts/places-search.mjs` vráti hodnotenie, počet recenzií,
   telefón aj web pre každú prevádzku, čo je presnejšie a lacnejšie ako vyhľadávanie.
2. Spusti agenta `lead-scout` s oblasťou, napr. „Prievidza, Trenčín, Považská Bystrica – barber,
   kaderníctvo“ alebo „Morava – pneuservisy“.
3. Výsledok ulož do JSON a spusti `python3 scripts/merge-leads.py nove.json`. Duplicity sa preskočia
   a stav existujúcich leadov ostane zachovaný.
