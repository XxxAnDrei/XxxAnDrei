# Patch 01 — Google prihlásenie bez Lovable

**Týka sa 105 zo 180 účtov.** Ak sa toto pokazí, väčšina zákazníkov sa neprihlási.
Preto sa testuje na preview nasadení, nikdy nie rovno na produkcii.

Dnes ide Google login cez `@lovable.dev/cloud-auth-js` → `oauth.lovable.app` →
Lovable si vypýta tokeny a tie sa vložia do Supabase klienta. Po odpojení od
Lovable táto cesta prestane existovať.

Náhradou je natívne `supabase.auth.signInWithOAuth`, ktoré ide priamo na Google.

---

## Krok A — Google Cloud Console (zadarmo)

1. <https://console.cloud.google.com/> → nový projekt, napr. `porucikos-auth`.
2. **APIs & Services → OAuth consent screen**
   - typ *External*, stav *In production*
   - názov aplikácie: `Poručíkos Barbershop`
   - podporný e-mail a doména: `porucikos.sk`
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - typ *Web application*
   - **Authorized JavaScript origins:**
     ```
     https://porucikos.sk
     https://www.porucikos.sk
     http://localhost:8080
     ```
   - **Authorized redirect URIs** — sem patrí adresa **Supabase**, nie webu:
     ```
     https://NOVYREF.supabase.co/auth/v1/callback
     ```
4. Odlož si `Client ID` a `Client Secret`.

## Krok B — Supabase Dashboard (nový projekt)

1. **Authentication → Providers → Google** → zapnúť, vložiť Client ID a Secret.
2. **Authentication → URL Configuration**
   - *Site URL*: `https://porucikos.sk`
   - *Redirect URLs* (jedna na riadok):
     ```
     https://porucikos.sk/**
     https://www.porucikos.sk/**
     https://porucikos.vercel.app/**
     http://localhost:8080/**
     ```
   Bez preview adresy sa nedá otestovať pred ostrým prepnutím.

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
