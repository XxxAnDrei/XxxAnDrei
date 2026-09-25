#!/usr/bin/env node
// Audit a prospect's website: mobile + desktop screenshots and the facts an owner cares about.
//
//   node scripts/audit-site.mjs https://example.sk [--psi] [--out audits]
//
// Writes audits/<host>/{mobile.png,desktop.png,report.json}. --psi adds PageSpeed Insights (mobile)
// scores and needs GOOGLE_API_KEY. Uses the preinstalled Chromium; never run `playwright install`.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices } from "playwright";

const BOOKING = /bookio|reservio|booksy|noona|treatwell|setmore|booqme|planfy|reenio|calendly|apnt\.app|notino/i;
const SOCIAL = /facebook\.com|instagram\.com|tiktok\.com/i;
const BUILDER_SIGNS = [
  ["Webnode", /webnode/i], ["Wix", /wix\.com|wixstatic|_wixCssImports/i], ["WordPress", /wp-content|wp-includes/i],
  ["Estránky", /estranky/i], ["Shoptet", /shoptet/i], ["Mozello", /mozello/i], ["Webgarden", /webgarden/i],
  ["Squarespace", /squarespace/i], ["Odoo", /odoo/i], ["Lovable", /lovable/i],
];

function parseArgs(argv) {
  const args = { url: null, psi: false, out: "audits" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--psi") args.psi = true;
    else if (argv[i] === "--out") args.out = argv[++i];
    else args.url = argv[i];
  }
  return args;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  }
}

async function inspect(browser, url, contextOptions, shotPath) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  let bytes = 0;
  let requests = 0;
  page.on("response", async (res) => {
    requests++;
    const len = Number(res.headers()["content-length"]);
    if (len) bytes += len;
  });
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: "load", timeout: 45000 });
  const loadMs = Date.now() - started;
  await page.waitForTimeout(1500);
  const facts = await page.evaluate(() => {
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.href);
    const text = document.body?.innerText ?? "";
    const years = [...text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
    return {
      title: document.title,
      description: meta("description"),
      viewport: meta("viewport"),
      generator: meta("generator"),
      lang: document.documentElement.lang || null,
      h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.trim()).slice(0, 3),
      links,
      copyrightYear: years.length ? Math.max(...years) : null,
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      html: document.documentElement.outerHTML.slice(0, 200000),
    };
  });
  await page.screenshot({ path: shotPath, fullPage: false });
  await context.close();
  return { status: response?.status() ?? null, finalUrl: page.url(), loadMs, requests, bytes, ...facts };
}

async function pageSpeed(url, key) {
  const api = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", "mobile");
  api.searchParams.set("key", key);
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) api.searchParams.append("category", c);
  const data = await (await fetch(api)).json();
  if (data.error) return { error: data.error.message };
  const lr = data.lighthouseResult;
  return {
    scores: Object.fromEntries(Object.entries(lr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
    lcp: lr.audits["largest-contentful-paint"]?.displayValue,
    cls: lr.audits["cumulative-layout-shift"]?.displayValue,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error("Použitie: node scripts/audit-site.mjs <url> [--psi] [--out audits]");
    process.exit(2);
  }
  const url = /^https?:\/\//.test(args.url) ? args.url : `https://${args.url}`;
  const host = new URL(url).host.replace(/[^a-z0-9.-]/gi, "_");
  const dir = join(args.out, host);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const browser = await launch();
  try {
    const mobile = await inspect(browser, url, { ...devices["iPhone 13"] }, join(dir, "mobile.png"));
    const desktop = await inspect(browser, url, { viewport: { width: 1440, height: 900 } }, join(dir, "desktop.png"));
    const builder = BUILDER_SIGNS.filter(([, re]) => re.test(mobile.html) || re.test(mobile.generator ?? "")).map(([n]) => n);
    const report = {
      url,
      finalUrl: mobile.finalUrl,
      https: mobile.finalUrl.startsWith("https://"),
      status: mobile.status,
      title: mobile.title,
      description: mobile.description,
      lang: mobile.lang,
      h1: mobile.h1,
      mobileViewportMeta: Boolean(mobile.viewport),
      mobileHorizontalScroll: mobile.horizontalScroll,
      builder,
      copyrightYear: mobile.copyrightYear,
      clickablePhone: mobile.links.some((l) => l.startsWith("tel:")),
      email: mobile.links.some((l) => l.startsWith("mailto:")),
      bookingLinks: [...new Set(mobile.links.filter((l) => BOOKING.test(l)))],
      socialLinks: [...new Set(mobile.links.filter((l) => SOCIAL.test(l)))],
      mobileLoadMs: mobile.loadMs,
      mobileRequests: mobile.requests,
      mobileKnownBytes: mobile.bytes,
      screenshots: { mobile: join(dir, "mobile.png"), desktop: join(dir, "desktop.png") },
    };
    if (args.psi) {
      report.pageSpeed = process.env.GOOGLE_API_KEY
        ? await pageSpeed(url, process.env.GOOGLE_API_KEY)
        : { error: "chýba GOOGLE_API_KEY" };
    }
    writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 1) + "\n");

    const flags = [];
    if (!report.https) flags.push("web nebeží na https");
    if (!report.mobileViewportMeta) flags.push("chýba mobilný viewport (na mobile sa zmenšuje)");
    if (report.mobileHorizontalScroll) flags.push("na mobile sa posúva do strany");
    if (!report.clickablePhone) flags.push("telefón sa nedá kliknúť");
    if (!report.bookingLinks.length) flags.push("žiadna online rezervácia");
    if (report.copyrightYear && report.copyrightYear < new Date().getFullYear() - 1) flags.push(`© ${report.copyrightYear}`);
    if (report.builder.length) flags.push(`postavené na: ${report.builder.join(", ")}`);
    console.log(`${report.finalUrl}\n  ${flags.length ? flags.join("\n  ") : "bez zásadných nálezov"}\n  → ${join(dir, "report.json")}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
