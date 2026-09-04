# Overenie: čo sa stane po zrušení auth hooku

Rozhodnutie: **cesta A** — zrušiť `auth-email-hook`, auth e-maily posielať
priamo cez Supabase + Brevo SMTP.

Toto je kontrola, či sa tým niečo nerozbije. Celý audit prebehol nad lokálnym
klonom repozitára a čítaním produkčnej databázy. **Na bežiacom systéme sa
nespustilo nič.**

---

## 1. Kto frontu vôbec používa

```
enqueue_email()   volá   výhradne  supabase/functions/auth-email-hook/index.ts:255
z fronty číta     výhradne          supabase/functions/process-email-queue/index.ts
```

Overené `grep`-om cez celý repozitár. Žiadny iný súbor — ani frontend, ani
iná edge funkcia — sa fronty nedotýka.

## 2. Rezervačné e-maily idú úplne inou cestou

`send-email` posiela priamo do Brevo REST API. Volajú ho:

| Odkiaľ | Kedy |
|---|---|
| `src/hooks/useAppointments.ts` | vytvorenie, potvrdenie, zrušenie |
| `src/components/admin/AdminCalendar.tsx` | presun termínu |
| `supabase/functions/create-guest-booking` | rezervácia bez účtu |
| `supabase/functions/handle-booking-action` | tlačidlá Potvrdiť/Zrušiť v e-maile |
| `supabase/functions/send-booking-reminders` | pripomienka 24 h vopred |

**Ani jeden z nich frontu nepoužíva.** Zrušenie fronty sa ich nedotkne.

## 3. Frontend na e-mailových tabuľkách nestojí

Hľadané v celom `src/`: `email_send_log`, `email_send_state`,
`suppressed_emails`, `email_unsubscribe_tokens`.

Jediné výskyty sú v `src/integrations/supabase/types.ts` — automaticky
generované TypeScript typy. **Žiadny komponent ich nečíta ani nezapisuje.**
Admin panel žiadny prehľad e-mailov nemá.

Zapisujú do nich len `auth-email-hook` a `process-email-queue` — teda presne
tie dve funkcie, ktoré rušíme. Po zrušení zostanú tabuľky osirelé (dá sa ich
neskôr zmazať, ale nič nepokazia, ak zostanú).

## 4. Štyri zo šiestich šablón sú mŕtvy kód

`auth-email-hook` mapuje šesť typov, ale appka spúšťa iba dva:

| Typ | Šablóna | Spúšťa appka? |
|---|---|---|
| `signup` | `signup.tsx` | áno — `useAuth.ts:106` |
| `recovery` | `recovery.tsx` | áno — `Auth.tsx:117` |
| `invite` | `invite.tsx` | **nie** |
| `magiclink` | `magic-link.tsx` | **nie** (žiadne `signInWithOtp`) |
| `email_change` | `email-change.tsx` | **nie** |
| `reauthentication` | `reauthentication.tsx` | **nie** |

## 5. Zamestnanci nedostávajú e-mail vôbec

`manage-employee-auth` zakladá účty cez:

```ts
adminClient.auth.admin.createUser({
  email: emp.email,
  password: emp.password,
  email_confirm: true,     // ← rovno potvrdené, žiadny e-mail sa neposiela
  user_metadata: { name: emp.name },
})
```

Nie `inviteUserByEmail`. Zrušenie hooku sa zakladania barberov nijak nedotkne.

## 6. Koľko tých e-mailov reálne odišlo

Namerané v produkčnej `auth.users` (180 účtov):

| | |
|---|---|
| Potvrdených e-mailov | **180 zo 180** |
| Nepotvrdených | **0** |
| Komu sa poslalo potvrdenie | **7** |
| Komu sa poslal reset hesla | **2** |

Celá tá mašinéria — 4 fronty, 6 DB funkcií, 2 edge funkcie a cron s taktom
5 sekúnd — obsluhuje **deväť e-mailov za celú históriu projektu**.

---

## JEDINÉ REÁLNE RIZIKO: nastavenie „Confirm email"

Z čísel vyššie vyplýva, že na starom projekte je **potvrdzovanie e-mailu
vypnuté**. 180 zo 180 účtov je potvrdených, ale potvrdzovací e-mail dostalo
len 7 ľudí — zvyšok bol potvrdený rovno pri registrácii (a 105 účtov je cez
Google, kde potvrdzuje Google).

**Ak by nový projekt mal „Confirm email" zapnuté, vznikne táto chyba:**

```ts
// src/hooks/useAuth.ts:106
const { data, error } = await supabase.auth.signUp({ ... })

if (!error && data.user) {
  await supabase.from('customers').insert({      // ← zlyhá na RLS
    user_id: data.user.id, name, phone, email,
  })
}
```

So zapnutým potvrdzovaním `signUp()` nevráti session. Insert potom beží ako
`anon`, `auth.uid()` je NULL a RLS politika

```
"Customers can view and update own data"  ALL  USING (user_id = auth.uid())
```

ho zamietne. Výsledok: **človek sa zaregistruje, ale nevznikne mu záznam
zákazníka** — v „Moje rezervácie" nič neuvidí a rezervácie sa mu nespárujú.

Appka to navyše nijak neošetruje, chybu insertu ignoruje a používateľovi
napíše „Registrácia úspešná! Môžete sa prihlásiť."

### Opatrenie

V novom projekte: **Authentication → Sign In / Providers → Email →
„Confirm email" nechať VYPNUTÉ**, rovnako ako na starom.

Do testovacieho zoznamu vo fáze 2 pribúda: *zaregistrovať nový testovací účet
a overiť, že v `public.customers` naozaj pribudol riadok.*

---

## Záver

**Cesta A je bezpečná.** Nič, čo appka reálne používa, na fronte nestojí.
Jediná vec, ktorú treba postrážiť, je nastavenie potvrdzovania e-mailu —
a to je jedno políčko v dashboarde, nie zásah do kódu.

### Čo po migrácii zostane pre auth e-maily

Prakticky len **reset hesla** (2 použitia za celú históriu). Pôjde cez
Supabase → Brevo SMTP so šablónou editovateľnou v dashboarde.

### Na čo nezabudnúť pri nastavovaní Brevo SMTP

Supabase potrebuje **SMTP údaje**, nie REST API kľúč, ktorý používa
`send-email`. V Breve sú pod *SMTP & API → SMTP*:

```
Host:  smtp-relay.brevo.com
Port:  587
User:  <SMTP login z Brevo>
Pass:  <SMTP kľúč — iný než API kľúč>
Sender: barbershop@porucikos.sk   (rovnaký ako v send-email)
```

### Čo sa NEmá mazať hneď

Tabuľky `email_send_log`, `email_send_state`, `suppressed_emails`,
`email_unsubscribe_tokens` nechaj po migrácii ešte stáť. Nič nestoja
(sú prázdne alebo takmer prázdne) a keby sa ukázalo, že niečo prehliadlo,
je jednoduchšie sa k nim vrátiť než ich obnovovať.
