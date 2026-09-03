// =============================================================================
// 30-copy-storage.mjs   —   PRENOS SÚBOROV ZO STARÉHO DO NOVÉHO PROJEKTU
// =============================================================================
// pg_dump prenesie len záznamy v storage.objects, NIE samotné súbory.
// Tie treba stiahnuť a nahrať cez Storage API.
//
// Zo starej DB len číta, do novej zapisuje.
//
// Očakávaný obsah (namerané 3. 9. 2026):
//   employee-avatars  — 12 súborov, ~11 MB, verejný
//   email-assets      —  1 súbor,  580 kB, verejný  (logo v e-mailoch)
//
// Použitie:
//   npm i @supabase/supabase-js
//   export OLD_URL='https://csteuzcbybwfwxmjmkjb.supabase.co'
//   export OLD_SERVICE_KEY='...'      # Lovable → Cloud → API keys → service_role
//   export NEW_URL='https://vfewttbwcxvvpjpmvhhy.supabase.co'
//   export NEW_SERVICE_KEY='...'
//   node scripts/30-copy-storage.mjs
//
// Skript je idempotentný (upsert), takže sa dá pustiť aj opakovane.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const { OLD_URL, OLD_SERVICE_KEY, NEW_URL, NEW_SERVICE_KEY } = process.env;

for (const [k, v] of Object.entries({ OLD_URL, OLD_SERVICE_KEY, NEW_URL, NEW_SERVICE_KEY })) {
  if (!v) {
    console.error(`Chýba premenná prostredia: ${k}`);
    process.exit(1);
  }
}

const OLD_REF = 'csteuzcbybwfwxmjmkjb';
const NEW_REF = 'vfewttbwcxvvpjpmvhhy';

if (NEW_URL.includes(OLD_REF)) {
  console.error(`NEW_URL ukazuje na STARÝ projekt (${OLD_REF}). Skript zapisuje — končím.`);
  process.exit(1);
}
if (!NEW_URL.includes(NEW_REF)) {
  console.error(`NEW_URL neobsahuje očakávaný ref nového projektu (${NEW_REF}).`);
  console.error('Ak si zámerne založil iný projekt, uprav NEW_REF v tomto skripte.');
  process.exit(1);
}
if (!OLD_URL.includes(OLD_REF)) {
  console.error(`OLD_URL neobsahuje ref starého projektu (${OLD_REF}) — číta sa z neho.`);
  process.exit(1);
}

const oldDb = createClient(OLD_URL, OLD_SERVICE_KEY);
const newDb = createClient(NEW_URL, NEW_SERVICE_KEY);

/** Rekurzívne vylistuje všetky súbory v buckete vrátane podpriečinkov. */
async function listAll(bucket, prefix = '') {
  const { data, error } = await oldDb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  if (!data?.length) return [];

  const files = [];
  for (const item of data) {
    // Položka bez metadata je priečinok.
    if (!item.metadata) {
      files.push(...(await listAll(bucket, `${prefix}${item.name}/`)));
    } else {
      files.push({ path: `${prefix}${item.name}`, metadata: item.metadata });
    }
  }
  return files;
}

async function ensureBucket(name, source) {
  const { data: existing } = await newDb.storage.getBucket(name);
  if (existing) {
    console.log(`   bucket "${name}" už existuje`);
    return;
  }
  const { error } = await newDb.storage.createBucket(name, {
    public: source.public,
    fileSizeLimit: source.file_size_limit,
    allowedMimeTypes: source.allowed_mime_types,
  });
  if (error) throw new Error(`createBucket ${name}: ${error.message}`);
  console.log(`   bucket "${name}" vytvorený (public=${source.public})`);
}

async function copyFile(bucket, file) {
  const { data, error: dlErr } = await oldDb.storage.from(bucket).download(file.path);
  if (dlErr) throw new Error(`download ${bucket}/${file.path}: ${dlErr.message}`);

  const { error: upErr } = await newDb.storage.from(bucket).upload(file.path, data, {
    upsert: true,
    contentType: file.metadata?.mimetype,
    cacheControl: file.metadata?.cacheControl ?? '3600',
  });
  if (upErr) throw new Error(`upload ${bucket}/${file.path}: ${upErr.message}`);
}

async function main() {
  console.log('=== Prenos súborov ===');
  console.log(`zo:  ${OLD_URL}`);
  console.log(`do:  ${NEW_URL}\n`);

  const { data: buckets, error } = await oldDb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);

  let ok = 0;
  const failed = [];

  for (const bucket of buckets) {
    console.log(`\n-- ${bucket.name} --`);
    await ensureBucket(bucket.name, bucket);

    const files = await listAll(bucket.name);
    console.log(`   ${files.length} súborov na prenos`);

    // Po desiatich naraz, nech to API neuškrtí.
    for (let i = 0; i < files.length; i += 10) {
      const batch = files.slice(i, i + 10);
      const results = await Promise.allSettled(batch.map((f) => copyFile(bucket.name, f)));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          ok++;
          console.log(`   ok  ${batch[idx].path}`);
        } else {
          failed.push(`${bucket.name}/${batch[idx].path}`);
          console.error(`   ZLYHALO  ${batch[idx].path}: ${r.reason.message}`);
        }
      });
    }
  }

  console.log(`\n=== Hotovo: ${ok} prenesených, ${failed.length} zlyhalo ===`);
  if (failed.length) {
    failed.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }

  console.log('\nSkontroluj ešte ručne, že logo v e-mailoch je dostupné:');
  console.log(`  ${NEW_URL}/storage/v1/object/public/email-assets/logo.png`);
  console.log('A v send-email/index.ts prepíš LOGO_URL na novú adresu.');
}

main().catch((err) => {
  console.error('\nChyba:', err.message);
  process.exit(1);
});
