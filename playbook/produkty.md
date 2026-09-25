# Produkty: čo reálne vieme predať

Zdroj: read-only audit repozitárov (25. 9. 2026). **Všetko sú to single-tenant projekty.** Každý nový
klient potrebuje vlastnú databázu, vlastný deploy a prepísanie natvrdo zapísaných textov.

## Prehľad

| Kód | Zdroj | Hodí sa pre | Nehodí sa pre | Prvý klient | Po šablóne |
|---|---|---|---|---|---|
| **P1** Rezervácie služieb | `porucikos` | barber, kaderníctvo, nechty, masáže, fyzio, psí salón, tetovanie; pneuservis a detailing, ak stojiská zadáš ako „zamestnancov“ | zálohy a online platby, viac pobočiek, kapacitné lekcie, CZ jazyk | 20–30 h | 4–6 h |
| **P2** Tréningy a lekcie | `project-start` | trénerské a športové školy, plávanie, tenis, jazdenie, lyžiarska škola; viac lokalít, skupiny s kapacitou | salóny, platba vopred | 35–50 h | predávať ako vertikálu pre športové školy |
| **P3** Klubová aplikácia | `ctvz` | detské kluby s mesačným členským (šport, tanec, hudba, jazyky) | verejné rezervácie termínov | 12–20 h | ~6 h |
| **P4** Registrácie na podujatia | `registraciabmx` | preteky, súťaže, kempy bez platby | štartovné vopred, limit miest | 6–10 h | 2–3 h |
| **P5** Požičovňa na dni | `letne-kino-zaluzie` | **jeden** kus na deň (saunový príves, vírivka, stan, sála) | viac kusov naraz (4 hrady), hodinové sloty, platby vopred | 8–14 h | ~3 h |
| **W** Web | nový | kdekoľvek | — | podľa rozsahu | — |

### Dôležité rozdiely voči tomu, čo agenti sľubujú v pitchoch
- **P1** má mriežku termínov natvrdo 30 min (`DateTimeSelector.tsx:66`). Kategórie `vlasy/brada/komplet`
  sú zapísané v DB ako CHECK, takže pre pneuservis ich treba premenovať cez `label_overrides` alebo rozšíriť.
- **P5** zvládne na deň len jednu rezerváciu (unikátny index na dátum). Požičovne s viacerými kusmi
  (musicDRIVE má 4 hrady) potrebujú rozšírenie o `resource_id`. Počítaj s tým v cene.
- **ČR:** P1 a P3 sú iba po slovensky. P2 má PL, DE, HU, EN, ale nie CZ. P4 češtinu má.

## Pred prvým predajom treba opraviť

Audit našiel bezpečnostné nálezy v P1, P2, P4 a P5, z toho dva s vysokou závažnosťou. Pri P1 ide
o komerčnú licenciu použitej knižnice. Podrobnosti sú v súkromnom reporte (`private/bezpecnostny-audit.md`,
mimo gitu), pretože tento repozitár je verejný. **Kým nie sú opravené, systém nikomu ďalšiemu nepredávaj.**

Mimo bezpečnosti: P1 a P2 závisia od Lovable (auth e-maily, OAuth). Mimo Lovable to treba nahradiť.

## Bežné náklady na klienta (nezabudni ich zarátať do mesačného poplatku)

- **Vercel Hobby** je podľa podmienok len na nekomerčné použitie. Pre platiacich klientov treba
  Vercel Pro (20 $/mesiac), Cloudflare Pages alebo Netlify. [Pravdepodobne] platí aj v 2026, over si
  aktuálny cenník.
- **Supabase Free** dovoľuje max. 2 aktívne projekty, pozastavuje sa po 7 dňoch nečinnosti a nemá zálohy.
  Produkčná DB sa na free pláne už pozastavila. Pro stojí 25 $/mesiac za organizáciu plus zhruba 10 $ za každý
  ďalší projekt.
- **Brevo Free** má 300 e-mailov denne pre všetkých klientov spolu, ak zdieľajú účet.

## Najväčšia páka

Jedna konfigurácia na klienta: `tenant.config.ts` pre texty, farby a kontakty, tabuľka `business_settings`
pre e-maily a právne stránky, a bootstrap skript (`supabase db push`, `secrets set`, cron). Pri P1 to je
25–35 h jednorazovo a potom 4–6 h na klienta namiesto 20–30 h. Bez toho sa pri 5 klientoch utopíš
v údržbe.
