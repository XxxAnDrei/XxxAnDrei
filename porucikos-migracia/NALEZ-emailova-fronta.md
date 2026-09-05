# Nález: e-mailová fronta a 5-sekundový cron

Zistené 3. 9. 2026 pri kontrole, či migrácie v repozitári zodpovedajú produkcii.
**Toto je zdroj tých 1,5 GB** a zároveň štvrtý bod naviazania na Lovable,
ktorý predtým v pláne nebol.

---

## Ako sme sa k tomu dostali

Porovnanie migrácií v repozitári s produkčnou schémou:

| | Migrácie | Produkcia | |
|---|---|---|---|
| Tabuľky | 16 | 16 | sedí |
| Triggery | 10 | 10 | sedí |
| RLS politiky | 52 | 52 | sedí |
| Enum typy | 1 | 1 | sedí |
| **Funkcie** | **17** | **19** | **nesedí** |

Dve funkcie v produkcii nevytvára žiadna migrácia:
`email_queue_dispatch` a `email_queue_wake`. Boli teda vytvorené priamo
v databáze, mimo migračných súborov.

> **Dôsledok pre plán:** migrácie v repozitári **nie sú** úplný obraz produkcie.
> Potvrdzuje to, že schéma sa musí brať z `pg_dump`, nie prehraním migrácií.

---

## Čo tie funkcie robia

```
auth-email-hook (edge)  →  enqueue_email()  →  pgmq fronta q_auth_emails
                                                      ↓ TRIGGER
                                              email_queue_wake()
                                                      ↓
                              cron.schedule('process-email-queue', '5 seconds', ...)
                                                      ↓ každých 5 sekúnd
                                              email_queue_dispatch()
                                                      ↓
                              net.http_post → process-email-queue (edge) → Brevo
                                                      ↓ keď je fronta prázdna
                                              cron.unschedule('process-email-queue')
```

`email_queue_wake` je trigger na tabuľkách `pgmq.q_auth_emails`
a `pgmq.q_transactional_emails`. Pri vložení správy **naplánuje cron úlohu
s taktom 5 sekúnd**. Keď sa fronta vyprázdni, `email_queue_dispatch` ju zase
odplánuje.

### Prečo to vysvetľuje 1,5 GB

| | |
|---|---|
| Takt armovanej úlohy | 5 sekúnd = **17 280 behov denne** |
| Historický priemer všetkých úloh | 3 923 behov denne |
| Súčasné dve trvalé úlohy | 384 behov denne |

Rozdiel 3 539 behov denne zodpovedá tomu, že fronta bola armovaná zhruba
20 % času. Každý beh = riadok v `cron.job_run_details`, ktorý nikto nemazal.

**Aktuálny stav:** fronty sú prázdne, `process-email-queue` momentálne
naplánovaný nie je. Ale triggery sú živé — pri najbližšom e-maile sa
úloha znovu naplánuje.

---

## Prečo je to riziko pri migrácii

`pg_dump` obe funkcie prenesie tak, ako sú. Na novom projekte by potom:

1. **Mierili na starý projekt.** Obe majú natvrdo
   `https://csteuzcbybwfwxmjmkjb.supabase.co/functions/v1/process-email-queue`.

2. **Nenašli tajný kľúč.** Obe čítajú
   `vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'`.
   Vault šifruje kľúčom viazaným na projekt — dumpom sa použiteľne neprenesie.
   Bez neho je hlavička `Authorization` prázdna a odoslanie zlyhá.

3. **Znovu rozbehli 5-sekundový cron.** Na Lovable to stálo peniaze.
   Na Supabase Free je limit 500 MB tvrdý — databáza by prešla do
   read-only režimu a rezervácie by prestali fungovať.

---

## Štvrtý bod naviazania na Lovable

`auth-email-hook/index.ts` obsluhuje **potvrdenie registrácie, reset hesla,
magic link, zmenu e-mailu a reautentifikáciu** — a je postavený na Lovable:

```ts
import { parseEmailWebhookPayload } from 'npm:@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from 'npm:@lovable.dev/webhooks-js'
...
const apiKey = Deno.env.get('LOVABLE_API_KEY')
const verified = await verifyWebhookRequest({ ..., secret: apiKey })
```

Overuje podpis Lovable webhooku pomocou `LOVABLE_API_KEY`. Čistý Supabase
posiela Auth hook podpísaný podľa **Standard Webhooks** (`v1,whsec_...`) —
iná schéma, iný formát payloadu. Bez prepísania funkcia na novom projekte
zamietne každý požiadavok.

**Dopad, ak sa prehliadne:** noví zákazníci nepotvrdia e-mail a nikto si
neresetuje heslo. Pri 399 nových zákazníkoch mesačne je to okamžite viditeľné.

---

## Dve cesty

### A) Zrušiť vlastný hook, poslať auth e-maily cez Brevo SMTP

V *Authentication → Emails → SMTP Settings* nastaviť Brevo a auth hook vypnúť.
Supabase potom posiela potvrdzovacie e-maily sám.

Odpadá tým:
- `auth-email-hook` (a s ním závislosť na `@lovable.dev/*`)
- `process-email-queue`
- pgmq fronty `auth_emails` + DLQ
- `email_queue_wake`, `email_queue_dispatch`, `enqueue_email`,
  `read_email_batch`, `delete_email`, `move_to_dlq`
- **celý 5-sekundový cron a s ním hlavná príčina rastu databázy**
- vault secret `email_queue_service_role_key`

Cena: auth e-maily budú zo šablón Supabase (editovateľné HTML v dashboarde),
nie z React komponentov v `_shared/email-templates/`. Dajú sa nabrandovať,
ale nie tým istým kódom.

Transakčné e-maily o rezerváciách (`send-email` → Brevo) **zostávajú
nedotknuté** — tie cez frontu nechodia.

### B) Prepísať hook na Standard Webhooks a frontu zachovať

Zachová React šablóny, ale znamená to:
- prepísať overovanie podpisu a parsovanie payloadu
- prepísať obe funkcie na nový project ref
- znovu vytvoriť vault secret
- žiť s 5-sekundovým cronom (nutne aj s dennou purge úlohou)

Viac práce, viac pohyblivých častí, zachovaná hlavná príčina rastu DB.

---

## Odporúčanie

**Cesta A.** Odstraňuje najväčší zdroj zápisov do databázy, ruší najkrehkejšiu
väzbu na Lovable a znižuje počet vecí, ktoré sa pri nočnom prepínaní môžu
pokaziť. Branding auth e-mailov sa dá dorobiť v pokoji potom, cez šablóny
v dashboarde.
