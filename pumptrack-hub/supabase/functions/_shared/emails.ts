// _shared/emails.ts — odosielanie emailov cez Brevo (Sendinblue) + HTML šablóny (CTVZ branding)
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

// Vracia true, keď Brevo správu naozaj prijalo. Väčšina volajúcich to nerieši,
// ale pri prístupových údajoch je rozdiel medzi "odoslané" a "tichý neúspech"
// podstatný — bez emailu sa rodič k heslu nedostane.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get("BREVO_API_KEY");
  if (!key) { console.warn("BREVO_API_KEY chýba — email neodoslaný:", subject); return false; }
  const fromEmail = Deno.env.get("EMAIL_FROM") ?? "info@ctvz.sk";
  // Odosielateľ je celý klub, nie „platby“ — cez tento modul chodia aj
  // notifikácie o tréningoch a obnovenie hesla.
  const fromName = Deno.env.get("EMAIL_FROM_NAME") ?? "Cyklo Team Veľké Zálužie";
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    console.error("Brevo error:", await res.text());
    return false;
  }
  return true;
}

const eur = (cents: number) => (cents / 100).toFixed(2).replace(".", ",") + " €";
const skDate = (d: string | Date) => new Date(d).toLocaleDateString("sk-SK");

// Verejná adresa aplikácie — z nej sa servíruje logo do emailov.
const APP_BASE = (Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");

function header() {
  // Bez známej adresy by <img> smerovalo nikam — vtedy radšej textový názov.
  if (!APP_BASE) {
    return `<span style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#ffffff;">CTVZ</span>`;
  }
  // width/height v atribútoch aj v style kvôli Outlooku.
  // alt zámerne krátky: mnohí klienti blokujú vzdialené obrázky a dlhý názov
  // by sa v 72px stĺpci zalomil do štyroch riadkov. Celý názov je v pätičke.
  return `<img src="${APP_BASE}/email-logo.png" alt="CTVZ" width="72" height="72"
       style="display:inline-block;border:0;width:72px;height:72px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:2px;">`;
}

function shell(inner: string, settings: any) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#171C26;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center;">
      ${header()}
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;color:#141a27;font-size:14px;line-height:1.6;">
      ${inner}
      <hr style="border:none;border-top:1px solid #e4e8f0;margin:20px 0 12px;">
      <p style="margin:0;font-size:11px;color:#6b7180;">
        ${settings?.club_name ?? ""}${settings?.club_ico ? " · IČO: " + settings.club_ico : ""}${settings?.club_dic ? " · DIČ: " + settings.club_dic : ""}<br>
        Otázky: <a href="mailto:${settings?.club_email ?? "info@ctvz.sk"}" style="color:#1A75E6;">${settings?.club_email ?? "info@ctvz.sk"}</a>
      </p>
    </div>
  </div></body></html>`;
}

// ── Faktúra / potvrdenie o platbe ──
export function invoiceEmail({ settings, payment, riderName }: any) {
  const net = payment.amount_cents - (payment.discount_cents ?? 0);
  return shell(`
    <h2 style="margin:0 0 4px;font-size:18px;">Potvrdenie o platbe</h2>
    <p style="margin:0 0 16px;color:#6b7180;">Faktúra <strong>${payment.invoice_number}</strong> · ${skDate(payment.paid_at ?? new Date())}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:6px 0;color:#6b7180;">Jazdec</td><td style="text-align:right;font-weight:bold;">${riderName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7180;">Položka</td><td style="text-align:right;">${payment.description}</td></tr>
      ${payment.discount_cents ? `<tr><td style="padding:6px 0;color:#6b7180;">Zľava</td><td style="text-align:right;color:#1F8A5B;">−${eur(payment.discount_cents)}</td></tr>` : ""}
      ${payment.credit_applied_cents ? `<tr><td style="padding:6px 0;color:#6b7180;">Použitý kredit</td><td style="text-align:right;color:#1F8A5B;">−${eur(payment.credit_applied_cents)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#6b7180;">Spôsob platby</td><td style="text-align:right;">${payment.method_label ?? "Stripe"}</td></tr>
      <tr><td style="padding:10px 0;border-top:2px solid #141a27;font-weight:bold;">Zaplatené</td>
          <td style="padding:10px 0;border-top:2px solid #141a27;text-align:right;font-weight:bold;font-size:16px;">${eur(net - (payment.credit_applied_cents ?? 0))}</td></tr>
    </table>
    <p style="margin:16px 0 0;">Ďakujeme! 🚴</p>
  `, settings);
}

// Payme.sk link (SBA štandard) — otvorí prevod v bankovej appke.
function paymeLink({ iban, amountCents, vs, clubName, description, riderName }: any) {
  if (!iban) return "";
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  const params = new URLSearchParams({
    V: "1", IBAN: clean,
    AM: (amountCents / 100).toFixed(2),
    CC: "EUR", PI: `/VS${vs}/SS/KS`,
    CN: clubName ?? "", MSG: `${description ?? ""} — ${riderName ?? ""}`.slice(0, 140),
  });
  return `https://payme.sk/?${params.toString()}`;
}

// ── Mesačná výzva na úhradu ──
export function paymentRequestEmail({ settings, riderName, amountCents, dueDate, payUrl, vs, description }: any) {
  const payme = paymeLink({ iban: settings?.club_iban, amountCents, vs, clubName: settings?.club_name, description, riderName });
  return shell(`
    <h2 style="margin:0 0 4px;font-size:18px;">Nová platba na úhradu</h2>
    <p style="margin:0 0 16px;color:#6b7180;">${description ?? "Členský poplatok"} — ${riderName}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <tr><td style="padding:6px 0;color:#6b7180;">Suma</td><td style="text-align:right;font-weight:bold;font-size:16px;">${eur(amountCents)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7180;">Splatnosť</td><td style="text-align:right;">${skDate(dueDate)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7180;">Variabilný symbol</td><td style="text-align:right;">${vs}</td></tr>
      ${settings?.club_iban ? `<tr><td style="padding:6px 0;color:#6b7180;">IBAN (prevod)</td><td style="text-align:right;">${settings.club_iban}</td></tr>` : ""}
    </table>
    ${payme ? `<a href="${payme}" style="display:block;background:#1A75E6;color:#ffffff;text-align:center;padding:13px;border-radius:8px;text-decoration:none;font-weight:bold;">🏦 Zaplatiť v bankovej appke</a>
    <p style="margin:8px 0 12px;font-size:12px;color:#6b7180;text-align:center;">Bezplatný prevod — funguje v George, Tatra banke, VÚB a ČSOB.</p>` : ""}
    <p style="margin:12px 0 0;font-size:12px;color:#6b7180;text-align:center;"><a href="${payUrl}" style="color:#1A75E6;">Ďalšie možnosti platby v aplikácii</a></p>
  `, settings);
}

// ── Pripomienka pred splatnosťou ──
export function reminderEmail({ settings, riderName, amountCents, dueDate, payUrl, days, vs, description }: any) {
  const payme = paymeLink({ iban: settings?.club_iban, amountCents, vs, clubName: settings?.club_name, description, riderName });
  return shell(`
    <h2 style="margin:0 0 4px;font-size:18px;">Pripomienka platby</h2>
    <p style="margin:0 0 16px;">Platba za jazdca <strong>${riderName}</strong> vo výške <strong>${eur(amountCents)}</strong> je splatná <strong>${skDate(dueDate)}</strong> (o ${days} dní).</p>
    ${vs ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7180;">VS: <strong>${vs}</strong>${settings?.club_iban ? ` · IBAN: ${settings.club_iban}` : ""}</p>` : ""}
    ${payme ? `<a href="${payme}" style="display:block;background:#1A75E6;color:#ffffff;text-align:center;padding:13px;border-radius:8px;text-decoration:none;font-weight:bold;">🏦 Zaplatiť v bankovej appke</a>
    <p style="margin:8px 0 12px;font-size:12px;color:#6b7180;text-align:center;">Bezplatný prevod cez PAY by square.</p>` : ""}
    <p style="margin:12px 0 0;font-size:12px;color:#6b7180;text-align:center;"><a href="${payUrl}" style="color:#1A75E6;">Ďalšie možnosti platby v aplikácii</a></p>
  `, settings);
}

// ── Zlyhaná platba ──
export function failedEmail({ settings, riderName, description }: any) {
  return shell(`
    <h2 style="margin:0 0 4px;font-size:18px;color:#DC2828;">Platba neprešla</h2>
    <p style="margin:0 0 16px;">Platba „${description}" za jazdca <strong>${riderName}</strong> sa nepodarila spracovať. Skontrolujte prosím kartu, alebo skúste zaplatiť znova v aplikácii. ${""}</p>
    <p style="margin:0;color:#6b7180;font-size:12px;">Ak máte uloženú kartu, o 3 dni sa pokúsime platbu strhnúť automaticky znova.</p>
  `, settings);
}

// ── Hromadná komunikácia od klubu ──
export function communicationEmail({ settings, bodyHtml, senderName }: any) {
  return shell(`
    ${bodyHtml}
    ${senderName ? `<p style="margin:20px 0 0;color:#6b7180;">${senderName}<br><span style="font-size:12px;">${settings?.club_name ?? ""}</span></p>` : ""}
  `, settings);
}

// ── Nové konto rodiča (dočasné heslo) ──
// Heslo generujeme z alfanumerickej abecedy, takže sa v HTML nemusí escapovať.
export function newParentAccountEmail({ settings, email, password }: any) {
  const clubName = settings?.club_name ?? "Cyklo Team Veľké Zálužie";
  const loginUrl = APP_BASE ? `${APP_BASE}/login` : "";
  return shell(`
    <h2 style="margin:0 0 8px;font-size:18px;">Vitajte v ${clubName}</h2>
    <p style="margin:0 0 16px;">
      Vytvorili sme vám konto v klubovej aplikácii. Nájdete v nej tréningy vášho
      dieťaťa, môžete ho odhlásiť z tréningu a vidíte platby.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      <tr>
        <td style="padding:8px 0;color:#6b7180;">Prihlasovací email</td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;">${email}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7180;border-top:1px solid #e4e8f0;">Dočasné heslo</td>
        <td style="padding:8px 0;text-align:right;border-top:1px solid #e4e8f0;">
          <span style="font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:bold;letter-spacing:1px;">${password}</span>
        </td>
      </tr>
    </table>
    ${loginUrl ? `<p style="margin:0 0 20px;">
      <a href="${loginUrl}" style="display:inline-block;background:#1A75E6;color:#ffffff;
         text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">
        Prihlásiť sa
      </a>
    </p>` : ""}
    <p style="margin:0 0 8px;color:#6b7180;font-size:12px;">
      Po prihlásení vás aplikácia rovno vyzve, aby ste si nastavili vlastné heslo.
      Dočasné heslo tým prestane platiť.
    </p>
    <p style="margin:0;color:#6b7180;font-size:12px;">
      Toto heslo nikomu neposielajte ďalej.
    </p>
  `, settings);
}

// ── Obnovenie hesla ──
export function passwordResetEmail({ settings, link, minutes = 60 }: any) {
  return shell(`
    <h2 style="margin:0 0 8px;font-size:18px;">Obnovenie hesla</h2>
    <p style="margin:0 0 16px;">
      Dostali sme žiadosť o nastavenie nového hesla k vášmu kontu.
      Kliknite na tlačidlo a zvoľte si nové heslo.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${link}" style="display:inline-block;background:#1A75E6;color:#ffffff;
         text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">
        Nastaviť nové heslo
      </a>
    </p>
    <p style="margin:0 0 8px;color:#6b7180;font-size:12px;">
      Odkaz platí ${minutes} minút a dá sa použiť iba raz.
    </p>
    <p style="margin:0;color:#6b7180;font-size:12px;">
      Ak ste o zmenu hesla nežiadali, tento email pokojne ignorujte —
      vaše heslo zostáva nezmenené a nikto sa k účtu nedostane.
    </p>
  `, settings);
}

// ── Zmena tréningu (zrušenie/čas/tréner/dátum) ──
export function trainingChangeEmail({ settings, title, message }: any) {
  return shell(`
    <h2 style="margin:0 0 8px;font-size:18px;">${title}</h2>
    <p style="margin:0 0 12px;">${message}</p>
    <p style="margin:0;color:#6b7180;font-size:12px;">Detaily nájdete v CTVZ aplikácii v kalendári tréningov.</p>
  `, settings);
}
