"""Merge lead batches from lead-scout agents into leads/private/leads.json and leads/private/leads.csv (gitignored).

Usage: python3 scripts/merge-leads.py batch1.json [batch2.json ...]
Existing leads are kept (with their status/notes); new ones are appended. Dedup key: normalized name + city.
"""
import csv, json, re, sys, unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "leads" / "private" / "leads.json"
OUT_CSV = ROOT / "leads" / "private" / "leads.csv"
WEST = {"Nitriansky kraj", "Trnavský kraj", "Bratislavský kraj"}
CONF = {"high": 0, "medium": 1, "low": 2}


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def tier(lead):
    west = lead["country"] == "SK" and lead.get("region") in WEST
    strong = (lead["score"] >= 9 and lead["confidence"] != "low") or (lead["score"] >= 8 and lead["confidence"] == "high")
    if west and strong:
        return "A"
    if lead["score"] >= 7:
        return "B"
    return "C"


def main(paths):
    existing = json.loads(OUT_JSON.read_text()) if OUT_JSON.exists() else []
    by_key = {slugify(f"{l['name']} {l.get('city') or ''}"): l for l in existing}
    for path in paths:
        segment = Path(path).stem.replace("batch_", "")
        for lead in json.loads(Path(path).read_text()):
            key = slugify(f"{lead['name']} {lead.get('city') or ''}")
            if key in by_key:
                continue
            lead.update(id=key, segment=segment, status="nový", found=str(date.today()), notes="")
            by_key[key] = lead
    leads = list(by_key.values())
    for lead in leads:
        lead["tier"] = tier(lead)
    leads.sort(key=lambda l: (l["tier"], -l["score"], CONF.get(l["confidence"], 3), l["name"]))
    OUT_JSON.write_text(json.dumps(leads, ensure_ascii=False, indent=1) + "\n")
    cols = ["tier", "score", "confidence", "name", "category", "city", "region", "country", "web_status",
            "product_fit", "phone", "email", "current_url", "facebook", "instagram", "booking_platform",
            "address", "demand_signals", "pitch", "status", "notes", "id"]
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(leads)
    counts = {}
    for l in leads:
        counts[l["tier"]] = counts.get(l["tier"], 0) + 1
    print(f"{len(leads)} leads -> {OUT_JSON.relative_to(ROOT)}, tiers {dict(sorted(counts.items()))}")


if __name__ == "__main__":
    main(sys.argv[1:])
