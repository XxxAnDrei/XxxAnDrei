# Tajné kľúče a premenné

Zoznam **názvov** — žiadne hodnoty tu nie sú a nikdy tu byť nemajú.
Hodnoty sa berú zo starého projektu a nastavujú v novom.

---

## Edge funkcie (Supabase → Edge Functions → Secrets)

| Názov | Odkiaľ | Poznámka |
|---|---|---|
| `BOOKING_ACTION_HMAC_SECRET` | zo **starého** projektu | **Musí zostať rovnaký.** Podpisuje odkazy „Potvrdiť/Zrušiť" v e-mailoch, ktoré platia 30 dní. Zmena = mŕtve tlačidlá u 30 čakajúcich rezervácií. |
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

Ak `BOOKING_ACTION_HMAC_SECRET` v starom projekte nenájdeš, **nevymýšľaj nový**
skôr, než uplynie 30 dní od poslednej odoslanej rezervácie — inak prestanú
fungovať potvrdzovacie odkazy, ktoré ľuďom ležia v schránke.

---

## Zásady

- Nič z tohto nepatrí do gitu ani do `.env` commitnutého do repozitára.
- `.env` v repozitári porucikos obsahuje len `VITE_*` hodnoty — tie sú verejné
  (anon key je aj tak zabudovaný v prehliadačovom bundle a chránený RLS).
- `service_role` kľúč sa **nikdy** nesmie dostať do frontendu.
