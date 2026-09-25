#!/usr/bin/env node
// Discover businesses through the Google Places API (New) and classify their web presence.
//
//   GOOGLE_PLACES_API_KEY=... node scripts/places-search.mjs "pneuservis Nitra" [--lang sk] [--pages 3]
//                                                     [--min-reviews 10] [--out leads/private/raw.json]
//
// Needs a Google Cloud key with "Places API (New)" enabled. websiteUri, phone and rating fields are
// billed as Text Search Enterprise; check the current free monthly cap in the Maps Platform pricing.

import { writeFileSync } from "node:fs";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.websiteUri",
  "places.nationalPhoneNumber", "places.rating", "places.userRatingCount", "places.googleMapsUri",
  "places.businessStatus", "places.primaryTypeDisplayName", "nextPageToken",
].join(",");

const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|linktr\.ee)$/;
const PLATFORMS = /(^|\.)(bookio\.com|reservio\.(com|cz|sk)|booksy\.com|noona\.(app|is)|treatwell\.[a-z.]+|setmore\.com|booqme\.sk|planfy\.[a-z]+|notino\.[a-z]+|reenio\.[a-z]+|apnt\.app|calendly\.com)$/;
const BUILDERS = /(^|\.)(webnode\.(sk|cz|com)|wixsite\.com|estranky\.(sk|cz)|mozello\.[a-z]+|websnadno\.cz|webgarden\.(cz|sk)|blogspot\.com|sites\.google\.com|weebly\.com|odoo\.com|inr\.sk)$/;

export function classify(uri) {
  if (!uri) return { web_status: "none", reason: "bez webu v Google profile" };
  let url;
  try { url = new URL(uri); } catch { return { web_status: "weak_site", reason: "neplatná URL" }; }
  const host = url.hostname.replace(/^www\./, "");
  if (SOCIAL.test(host)) return { web_status: "social_only", reason: host };
  if (PLATFORMS.test(host)) return { web_status: "platform_only", reason: host };
  if (BUILDERS.test(host)) return { web_status: "weak_site", reason: `bezplatný builder (${host})` };
  if (url.protocol === "http:") return { web_status: "weak_site", reason: "len http" };
  return { web_status: "has_site", reason: "vlastný web, treba audit" };
}

function parseArgs(argv) {
  const args = { query: [], lang: "sk", pages: 3, minReviews: 0, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lang") args.lang = argv[++i];
    else if (a === "--pages") args.pages = Number(argv[++i]);
    else if (a === "--min-reviews") args.minReviews = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else args.query.push(a);
  }
  args.query = args.query.join(" ");
  return args;
}

async function search(query, lang, pages, key) {
  const places = [];
  let pageToken;
  for (let page = 0; page < pages; page++) {
    const body = { textQuery: query, languageCode: lang, regionCode: lang === "cs" ? "CZ" : "SK", pageSize: 20 };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Places API ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`);
    places.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return places;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!args.query) {
    console.error('Použitie: node scripts/places-search.mjs "kategória mesto" [--lang sk|cs] [--pages 3] [--min-reviews 10] [--out súbor.json]');
    process.exit(2);
  }
  if (!key) {
    console.error("Chýba GOOGLE_PLACES_API_KEY (pridaj ho do secrets prostredia).");
    process.exit(2);
  }
  const rows = (await search(args.query, args.lang, args.pages, key))
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .filter((p) => (p.userRatingCount ?? 0) >= args.minReviews)
    .map((p) => ({
      name: p.displayName?.text,
      category: p.primaryTypeDisplayName?.text ?? null,
      address: p.formattedAddress ?? null,
      phone: p.nationalPhoneNumber ?? null,
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? 0,
      current_url: p.websiteUri ?? null,
      maps_url: p.googleMapsUri,
      place_id: p.id,
      ...classify(p.websiteUri),
    }))
    .sort((a, b) => (a.web_status === "has_site") - (b.web_status === "has_site") || b.reviews - a.reviews);

  for (const r of rows) {
    const stars = r.rating ? `${r.rating}★ (${r.reviews})` : "bez hodnotení";
    console.log(`${r.web_status.padEnd(13)} ${stars.padEnd(16)} ${r.name} | ${r.phone ?? "-"} | ${r.reason}`);
  }
  const gaps = rows.filter((r) => r.web_status !== "has_site").length;
  console.log(`\n${rows.length} prevádzok, ${gaps} bez vlastného alebo so slabým webom.`);
  if (args.out) {
    writeFileSync(args.out, JSON.stringify(rows, null, 1) + "\n");
    console.log(`Uložené: ${args.out}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
