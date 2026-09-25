# Studio HQ

Pracovný repozitár malého štúdia z Nitrianskeho kraja. Hľadáme prevádzky v SK/CZ bez webu alebo so slabým
webom a predávame im vlastné, negenerické weby a rezervačné systémy, ktoré už bežia v produkcii.

## Tento repozitár je verejný (profilový repo)
- Nikdy necommituj zoznamy firiem, kontakty, pitche, audity prospektov, ukážkové weby s ich fotkami ani
  bezpečnostné nálezy. Patria do `leads/private/`, `prospects/` a `private/`, ktoré sú v `.gitignore`.
- Pred commitom spusti `git status` a skontroluj, že nič z toho nie je v stage.

## Pipeline

| Krok | Agent (`.claude/agents/`) | Výstup |
|---|---|---|
| 1. Nájsť firmy | `lead-scout` | JSON → `python3 scripts/merge-leads.py batch.json` → `leads/private/leads.json` |
| 2. Zistiť, kde strácajú zákazníkov | `web-auditor` | `prospects/<slug>/audit.md` (+ `node scripts/audit-site.mjs <url>`) |
| 3. Autentický dizajnový smer | `design-director` | `prospects/<slug>/DESIGN.md`, `brief.md` |
| 4. Súkromná ukážka | `demo-builder` | `prospects/<slug>/site/` (noindex) |
| 5. Prvý kontakt | `outreach-writer` | `prospects/<slug>/outreach.md`, `namietky.md` |

Nezávislé kroky pre rôzne firmy spúšťaj paralelne. Ukážku (krok 4) rob len pre leady so skóre ≥ 8.

## Referencie
- `playbook/produkty.md`: čo vieme predať (P1–P5, W), pre koho, koľko hodín a čo treba opraviť pred predajom.
- `playbook/dizajn-smery.md`: smery a zakázané klišé podľa odvetvia. Je povinný pre každý dizajn.
- `playbook/oslovovanie.md`: právne pravidlá (SK vs. CZ) a poradie kanálov.
- `leads/README.md`: skórovanie, formát záznamu a obmedzenia dát.
- Dizajnové skills v `.agents/skills/`: `impeccable` je hlavný (shape → build → critique/polish).
  `design-taste-frontend` slúži ako anti-slop kontrola. `high-end-visual-design`, `gpt-taste`
  a `industrial-brutalist-ui` používaj len vtedy, keď si to smer naozaj žiada.

## Produktové repozitáre (GitHub XxxAnDrei, súkromné)
`porucikos` (P1), `project-start` (P2), `ctvz` (P3), `registraciabmx` (P4), `letne-kino-zaluzie` (P5).

## Prostredie
- Na webe beží WebSearch. Priamy prístup na weby firiem (WebFetch, curl) blokuje sieťová politika
  cloud prostredia, kým ju v nastaveniach nerozšíriš.
- Limit WebSearch je 200 na session a zdieľajú ho všetci agenti. Pri väčšom zbere daj agentom
  menšie oblasti alebo použi `scripts/places-search.mjs` s `GOOGLE_PLACES_API_KEY`.
- Playwright: `npm install`. Chromium je predinštalovaný, `playwright install` nespúšťaj.
