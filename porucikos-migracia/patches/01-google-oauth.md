# Patch 01 — Google prihlásenie bez Lovable

**Týka sa 105 zo 180 účtov.** Ak sa toto pokazí, väčšina zákazníkov sa neprihlási.
Preto sa testuje na preview nasadení, nikdy nie rovno na produkcii.

Dnes ide Google login cez `@lovable.dev/cloud-auth-js` → `oauth.lovable.app` →
Lovable si vypýta tokeny a tie sa vložia do Supabase klienta. Po odpojení od
Lovable táto cesta prestane existovať.

Náhradou je natívne `supabase.auth.signInWithOAuth`, ktoré ide priamo na Google.

---

## Ako to funguje (aby dávali kroky zmysel)

Tá callback adresa **nie je tvoja stránka** — je to adresa Supabase:

```
porucikos.sk  →  Google (človek sa prihlási)  →  Supabase  →  porucikos.sk
                                                    ↑
                                        https://vfewttbwcxvvpjpmvhhy.supabase.co/auth/v1/callback
```

Google pustí prihlásenie len na vopred zaregistrovanú adresu. Bez nej vráti
chybu `redirect_uri_mismatch`.

---

## Krok A — Google Cloud Console (zadarmo)

### A1. Nový projekt
1. <https://console.cloud.google.com/>
2. Rozbaľovačka projektov hore → **New project**
3. Názov `porucikos-auth` → **Create** → prepnúť sa doň

### A2. Súhlasná obrazovka
**APIs & Services → OAuth consent screen**
(Google to premenoval na *Google Auth Platform*; ak vidíš **Get started**, klikni.)

| Pole | Hodnota |
|---|---|
| App name | `Poručíkos Barbershop` |
| User support email | tvoj / barbershopu |
| Audience | **External** |
| Contact information | tvoj e-mail |

> **NAJDÔLEŽITEJŠÍ BOD CELÉHO POSTUPU**
>
> Po vytvorení musí byť stav **In production**, nie **Testing**.
> V režime Testing sa prihlásia len ručne pridaní testeri — teda **nikto
> zo 105 zákazníkov, ktorí dnes používajú Google**.
>
> **Audience → Publish app.** Pri základných rozsahoch (meno, e-mail)
> je publikovanie okamžité, overovanie Googlom netreba.

### A3. OAuth klient
**Clients** (staršie *Credentials*) → **Create client**

- Application type: **Web application**
- Name: `porucikos-web` (interné)
- **Authorized redirect URIs** → **+ Add URI**:
  ```
  https://vfewttbwcxvvpjpmvhhy.supabase.co/auth/v1/callback
  ```
  Bez lomky na konci.

  *Authorized JavaScript origins* nechaj **prázdne** — pri tomto type
  prihlásenia sa nepoužívajú (potrebné sú len pri Google One Tap).

**Create** → skopíruj si **Client ID** a **Client Secret**.

## Krok B — Supabase Dashboard (nový projekt)

### B1. Google provider
**Authentication → Sign In / Providers → Google**
1. **Enable Sign in with Google** → zapnúť
2. **Client ID** a **Client Secret (for OAuth)** → vložiť z Googlu
3. **Save**

Supabase v tej istej sekcii zobrazuje **Callback URL** s tlačidlom Copy —
skontroluj ňou, že u Googlu je presne tá istá.

### B2. Povolené návratové adresy
**Authentication → URL Configuration**

- *Site URL*: `https://porucikos.sk`
- *Redirect URLs*:
  ```
  https://porucikos.sk/**
  https://www.porucikos.sk/**
  https://porucikos.vercel.app/**
  http://localhost:8080/**
  ```
  Tretia je nutná na otestovanie pred ostrým prepnutím.

### B3. Kontrolný zoznam pred pokračovaním
- [ ] Consent screen je **In production**, nie Testing
- [ ] Redirect URI u Googlu sedí znak po znaku s tým v Supabase
- [ ] Google provider je Enabled a uložený

---

## Krok C — Zmeny v kóde

### C1. `src/pages/Auth.tsx`

**Zmazať riadok 10:**
```ts
import { lovable } from "@/integrations/lovable";
```

**Nahradiť celú funkciu `handleGoogleSignIn` (od r. 156):**

```ts
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      // signInWithOAuth presmeruje prehliadač na Google. Ak uspeje, kód pod
      // ním sa už nevykoná — preto sa isGoogleLoading vypína len pri chybe.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        toast.error("Chyba pri prihlásení cez Google");
        console.error("Google sign-in error:", error);
        setIsGoogleLoading(false);
      }
    } catch (error) {
      toast.error("Chyba pri prihlásení cez Google");
      console.error("Google sign-in error:", error);
      setIsGoogleLoading(false);
    }
  };
```

`supabase` je v súbore už naimportovaný (r. 9), nič pridávať netreba.

> **Rozdiel oproti pôvodnému:** Lovable verzia vracala tokeny a nastavovala
> session ručne. Natívna verzia presmeruje na Google a späť; session zachytí
> `detectSessionInUrl` v Supabase klientovi automaticky. Preto sa
> `setIsGoogleLoading(false)` presunul dovnútra vetiev s chybou — pri úspechu
> stránka aj tak zaniká.

### C2. Zmazať `src/integrations/lovable/index.ts`

```bash
git rm src/integrations/lovable/index.ts
```

Overiť, že nikde inde nezostala referencia:
```bash
grep -rn "integrations/lovable" src/
```

### C3. `package.json`

Odstrániť z `dependencies`:
```json
"@lovable.dev/cloud-auth-js": "^1.0.0",
```
a prebuildovať lockfile (`npm install` / `bun install`).

---

## Krok D — Nepovinné, ale odporúčané

Tieto veci po odchode z Lovable nič nerobia, len zavadzajú.
**Rob ich až po tom, čo je migrácia overená** — nemiešaj ich do rovnakého kroku
ako OAuth, nech vieš, čo prípadnú chybu spôsobilo.

### D1. `src/integrations/supabase/client.ts`

Dnes používa `brokeredPreviewStorage()` — brokera, ktorý existuje kvôli tomu,
aby session fungovala vo vnútri Lovable preview iframe. Mimo Lovable domén
padá na `localStorage`, takže funguje, ale je to zbytočná vrstva.

```ts
// bolo
import { brokeredPreviewStorage } from './previewAuthStorage';
...
    storage: brokeredPreviewStorage(),

// bude
    storage: localStorage,
```
Potom sa dá zmazať aj `src/integrations/supabase/previewAuthStorage.ts`.

### D2. `vite.config.ts`

```ts
// zmazať
import { componentTagger } from "lovable-tagger";
// a v plugins nechať len:
plugins: [react()],
```
a `lovable-tagger` odstrániť z `devDependencies`.

> Bez tohto kroku build vyžaduje `lovable-tagger` ako devDependency. Na Verceli
> to dnes prechádza, ale je to zbytočná väzba na Lovable.

---

## Krok E — Test PRED ostrým prepnutím

Na preview nasadení (`porucikos.vercel.app`), proti **novej** databáze:

- [ ] „Pokračovať s Google" presmeruje na Google, nie na `oauth.lovable.app`
- [ ] Po návrate je používateľ prihlásený
- [ ] Existujúci Google účet sa napojí na **pôvodný** `auth.users.id`
      (over v DB: `SELECT id, email FROM auth.users WHERE email = 'tvoj@gmail.com'`
      — musí to byť to isté ID ako v starej databáze)
- [ ] Prihlásenie e-mailom a heslom stále funguje
- [ ] Odhlásenie funguje
- [ ] Zákazník vidí svoje staré rezervácie v `/my-reservations`
- [ ] Barber sa dostane do `/admin` a vidí svoj kalendár

> Tretí bod je najdôležitejší. Ak by Google vytvoril **nový** účet namiesto
> napojenia na existujúci, človek by prišiel o históriu rezervácií. Preto sa
> `auth.identities` musí preniesť dumpom — nie nechať dogenerovať pri prvom
> prihlásení.
