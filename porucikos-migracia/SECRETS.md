# Tajné kľúče a premenné

Zoznam **názvov** — žiadne hodnoty tu nie sú a nikdy tu byť nemajú.
Hodnoty sa berú zo starého projektu a nastavujú v novom.

---

## Edge funkcie (Supabase → Edge Functions → Secrets)

| Názov | Odkiaľ | Poznámka |
|---|---|---|
| `BOOKING_ACTION_HMAC_SECRET` | **nový náhodný** (`openssl rand -hex 32`) | Podpisuje odkazy „Potvrdiť/Zrušiť". Starý sa neprenáša — rozposlané odkazy mieria na starý project ref, takže na nový projekt aj tak neprídu. Viď `RUNBOOK.md`, bod 1. |
| `BREVO_API_KEY` | Brevo účet | Ten istý sa dá použiť v oboch projektoch. |
| `SUPABASE_URL` | automatické | Supabase dopĺňa sám. |
| `SUPABASE_SERVICE_ROLE_KEY` | automatické | Supabase dopĺňa sám. |

Nastavenie:
```bash
supabase secrets set --project-ref vfewttbwcxvvpjpmvhhy \
  BOOKING_ACTION_HMAC_SECRET='...' \
  BREVO_API_KEY='...'
```

Kontrola (vypíše len názvy, nie hodnoty):
```bash
supabase secrets list --project-ref vfewttbwcxvvpjpmvhhy
```

---

## Frontend — Vercel Environment Variables

| Názov | Zmena |
|---|---|
| `VITE_SUPABASE_URL` | `https://vfewttbwcxvvpjpmvhhy.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nový anon key |
| `VITE_SUPABASE_PROJECT_ID` | `vfewttbwcxvvpjpmvhhy` |

Nastav pre všetky tri prostredia (Production, Preview, Development).
Zmena premennej sa prejaví až po novom nasadení.

---

## GitHub Actions (repozitár `porucikos`)

| Názov | Hodnota |
|---|---|
| `SUPABASE_DB_URL` | connection string novej DB (Session pooler) |

---

## Google OAuth

| Kde | Čo |
|---|---|
| Google Cloud Console | Client ID + Client Secret |
| Supabase → Auth → Providers → Google | tie isté dve hodnoty |

Redirect URI v Google smeruje na **Supabase**, nie na web:
```
https://vfewttbwcxvvpjpmvhhy.supabase.co/auth/v1/callback
```

---

## Kde vziať hodnoty zo starého projektu

- **DB connection string** — Lovable → projekt → Cloud → Database
- **service_role key** — Lovable → projekt → Cloud → API keys
- **Secrets edge funkcií** — Lovable → projekt → Cloud → Edge Functions → Secrets

`BOOKING_ACTION_HMAC_SECRET` zo starého projektu **nehľadaj** — Supabase
hodnoty secretov po uložení nezobrazuje (sú write-only) a hlavne ho netreba:
adresa v rozposlaných odkazoch je poskladaná z konštanty `PROJECT_REF`, ktorá
je v `send-email/index.ts` napevno, takže tie odkazy mieria na starý projekt.

Kľúč na novom projekte je preto ľubovoľný náhodný reťazec a dá sa kedykoľvek
vymeniť — zneplatní len odkazy vystavené novým projektom. Po zmene netreba
nič nasadzovať nanovo, secrety sa načítavajú za behu.

---

## Zásady

- Nič z tohto nepatrí do gitu ani do `.env` commitnutého do repozitára.
- `.env` v repozitári porucikos obsahuje len `VITE_*` hodnoty — tie sú verejné
  (anon key je aj tak zabudovaný v prehliadačovom bundle a chránený RLS).
- `service_role` kľúč sa **nikdy** nesmie dostať do frontendu.
