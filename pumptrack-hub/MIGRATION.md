# Presun z Lovable Supabase na vlastný projekt

Runbook a kontrolné body. Cieľ: presun bez straty dát a **bez resetovania hesiel**.

## Projekty

| | ref | poznámka |
|---|---|---|
| zdroj | `ahuszqknzgghrpyqzugz` | spravuje Lovable, prístup cez Lovable konektor |
| cieľ | `mffhhgkgcrupmytayrjx` | vlastný, org XxxAnDrei, eu-west-2 |
| frontend | Vercel `ctvz.vercel.app` | už vlastný, deploy z GitHub `main` — **nepresúva sa** |

## Prečo prežijú heslá

Overené 2026-08-02 na oboch projektoch:

- `auth.users` — 35 stĺpcov, **zhodné názvy v zdroji aj cieli**
- `auth.identities` — 9 stĺpcov, **zhodné**

Hashe (`encrypted_password`, bcrypt) sa preto dajú kopírovať 1:1 a nikto si heslo
meniť nemusí. Toto je jediný dôvod, prečo je presun bez škody vôbec možný —
keby sa schémy líšili, museli by sa všetkým resetovať heslá.

## Záchytný bod zdroja (2026-08-02)

Odtlačok schémy — `md5` cez `table.column:type:nullable:default` všetkých
stĺpcov v `public`:

```
81932bc0914d1a216a4fbe8525264a16   (268 stĺpcov, 33 tabuliek)
```

Overovací dotaz (musí dať rovnaký výsledok na cieli po prenose schémy):

```sql
select md5(string_agg(t, '|' order by t)) as odtlacok, count(*) as stlpcov
from (
  select table_name||'.'||column_name||':'||data_type||':'||is_nullable
         ||':'||coalesce(column_default,'-') as t
  from information_schema.columns where table_schema='public'
) x;
```

Počty riadkov, ktoré musia po prenose sedieť **presne**:

| tabuľka | riadkov | | tabuľka | riadkov |
|---|---:|---|---|---:|
| absences | 303 | | payment_events | 0 |
| attendance | 1386 | | payment_methods | 0 |
| chat_members | 92 | | payment_settings | 1 |
| chat_messages | 24 | | payments | 0 |
| chat_polls | 0 | | poll_votes | 0 |
| chats | 5 | | profiles | 43 |
| coach_unavailability | 32 | | pumptracks | 1 |
| communication_recipients | 0 | | push_subscriptions | 11 |
| communications | 0 | | rider_lap_times | 26 |
| credit_entries | 0 | | rider_parents | **48** |
| employer_contribution_requests | 0 | | riders | 41 |
| event_rsvps | 9 | | session_rider_moves | 4 |
| events | 36 | | stripe_webhook_events | 2 |
| group_time_slots | 9 | | training_notifications | 23 |
| groups | 5 | | training_sessions | 533 |
| message_reactions | 5 | | user_roles | 43 |
| password_reset_attempts | 5 | | | |

Auth: **43** používateľov, **43** identít, 1 MFA faktor, 42 aktívnych relácií.
Storage: bucket `chat-media` (privátny), **9** súborov.

Kontrolný dotaz na počty:

```sql
select table_name,
       (xpath('/row/c/text()', query_to_xml(
          format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int as riadkov
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
order by table_name;
```

## Pozor — `export-backup` NIE je úplná záloha

Funkcia `export-backup` exportuje 24 tabuliek a **vynecháva 9**:

`chats`, `chat_members`, `chat_messages`, `chat_polls`, `poll_votes`,
`message_reactions`, `rider_parents`, `session_rider_moves`,
`password_reset_attempts`

Kritické je hlavne `rider_parents` (48 riadkov) — sú to väzby na druhých
rodičov. Migrácia postavená na tejto funkcii by o nich ticho prišla.

## Stav cieľa pred presunom

21 z 33 tabuliek, všetky prázdne okrem `payment_settings` (1 riadok).
Zastaraná čiastočná kópia z júla 2026. Chýbajú chaty, RSVP, presuny jazdcov,
druhí rodičia. **Schému treba postaviť odznova, nie dopĺňať.**

Zapnuté rozšírenia: `pg_cron`, `pg_net` — cron joby pôjdu vytvoriť rovno.
Storage: 0 bucketov, `chat-media` treba vytvoriť.

## Poradie prenosu (kvôli cudzím kľúčom)

1. `auth.users` → `auth.identities`
2. `profiles`, `user_roles`
3. `groups`, `pumptracks`, `payment_settings`
4. `riders` → `rider_parents`
5. `training_sessions`, `group_time_slots`, `coach_unavailability`
6. `attendance`, `absences`, `session_rider_moves`
7. `events` → `event_rsvps`
8. `chats` → `chat_members` → `chat_messages` → `chat_polls` → `poll_votes`
   → `message_reactions`
9. zvyšok (platby, komunikácia, push, lap times, notifikácie)

## Čo sa neprenesie a treba spraviť ručne

| položka | dopad |
|---|---|
| 42 aktívnych relácií | všetci sa odhlásia, prihlásia sa rovnakým heslom |
| 1 MFA faktor | tajomstvo je šifrované kľúčom projektu → nové naskenovanie QR |
| secrets edge funkcií | `BREVO_API_KEY`, `SITE_URL`, `CRON_SECRET`, `VAPID_*`, `STRIPE_*` — zadať ručne |
| 3 cron joby | majú v príkaze starú URL projektu, vytvoriť nanovo |
| Stripe webhook | prepnúť endpoint + nový `STRIPE_WEBHOOK_SECRET` |

Cron joby na zdroji:

| jobname | schedule | volá |
|---|---|---|
| process-attendance-every-30-min | `*/30 * * * *` | `/functions/v1/process-attendance` |
| training-reminders-hourly | `0 * * * *` | `/functions/v1/training-reminders` |
| payment-automations-daily | `0 6 * * *` | `/functions/v1/payment-automations` |

## Edge funkcie (16)

`admin-payment-actions`, `chat-admin`, `chat-send`, `create-checkout`,
`customer-portal`, `export-backup`, `notify-training-change`, `parent-account`,
`payment-automations`, `process-attendance`, `register-rider`,
`request-password-reset`, `send-communication`, `send-push`, `stripe-webhook`,
`training-reminders`

`verify_jwt = false` (viď `supabase/config.toml`) musí zostať pre:
`stripe-webhook`, `send-push`, `training-reminders`, `notify-training-change`,
`parent-account`, `payment-automations`, `export-backup`,
`request-password-reset`.

## Prepnutie a návrat

Prepnutie = zmena `VITE_SUPABASE_URL` a `VITE_SUPABASE_PUBLISHABLE_KEY` na
Verceli + redeploy. Do tej chvíle appka beží na starom projekte.

Návrat späť = tie isté dve premenné naspäť. Preto **zdrojový projekt nemazať
minimálne dva týždne** po prepnutí.
