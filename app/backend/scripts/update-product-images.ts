// scripts/update-product-images.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bulk-update every product's `image` with REAL, working photo URLs.
//
// Why the old version 404'd: Unsplash returns 404 for any photo-id that isn't an
// exact match for a real photo — you cannot guess valid ids. This version checks
// every candidate URL over the network and uses the first one that returns 200.
// If none of the topical Unsplash ids resolve, it falls back to Lorem Picsum,
// which ALWAYS returns a real image — so no product is ever left with a 404.
//
// Requires Node 18+ (uses global fetch). Deterministic, idempotent.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { prisma } from "../src/config/database";

// Unsplash CDN URL helper
const UNS = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=600&q=80&auto=format&fit=crop`;

// Lorem Picsum — guaranteed-working fallback, deterministic per seed.
function picsum(productId: string, name: string, categoryName: string | null): string {
  const seed = encodeURIComponent(
    `${categoryName ?? "product"}-${name}-${productId}`.toLowerCase().replace(/\s+/g, "-"),
  );
  return `https://picsum.photos/seed/${seed}/600/600`;
}

// ── Keyword buckets — matched against the lowercased product NAME
// (the three malformed ids from the old file have been removed)
const NAME_BUCKETS: Array<{ keywords: string[]; ids: string[] }> = [
  { keywords: ["earbud", "earphone"], ids: ["1590658268037-41439a3e1c24"] },
  {
    keywords: ["headphone", "headset"],
    ids: ["1505740420928-5e560c06d30e", "1524678606370-a47ad25cb2ae"],
  },
  { keywords: ["speaker"], ids: ["1608043152269-423dbba4e7e1"] },
  { keywords: ["microphone", "mic"], ids: ["1478737270239-2f02b77fc618"] },
  { keywords: ["power bank", "powerbank"], ids: ["1624996407937-3a8e8a52c9bb"] },
  { keywords: ["wireless charg", "charging pad"], ids: ["1580910051081-c771de2c5cff"] },
  {
    keywords: ["charger", "charging station"],
    ids: ["1609091839311-d5365f9ff1c5", "1601721061989-0f38c7cdafe1"],
  },
  { keywords: ["keyboard"], ids: ["1541140532154-b024d705b90a"] },
  { keywords: ["mouse pad", "mouse mat", "desk mat"], ids: ["1587829741301-dc798b83add3"] },
  { keywords: ["mouse"], ids: ["1527864550417-7fd91fc51a46"] },
  { keywords: ["desk lamp", "lamp"], ids: ["1593814579394-c8c1e6e1e52a"] },
  { keywords: ["webcam", "camera"], ids: ["1611532736576-c2dc59d5e30e"] },
  { keywords: ["laptop stand"], ids: [] }, // old id was malformed → relies on fallback chain
  {
    keywords: ["t-shirt", "tee", "shirt"],
    ids: ["1521572163474-6864f9cf17ab", "1574180046565-52d5eb37082f"],
  },
  { keywords: ["shoe", "sneaker", "footwear"], ids: ["1542291026-7eec264c27ff"] },
  { keywords: ["backpack", "bag"], ids: ["1553062407-98eeb64c6a62", "1636207289485-90c6a30f1d3a"] },
  { keywords: ["cable", "cord", "usb-c cable", "lightning"], ids: ["1587740908122-9a0db01b3f01"] }, // dropped malformed id
  { keywords: ["adapter", "otg"], ids: ["1553621042-f6e147245754"] },
  { keywords: ["screen protector", "tempered glass"], ids: ["1567581935884-3349723552ca"] },
  { keywords: ["wallet", "card holder"], ids: [] }, // old id was malformed → relies on fallback chain
  { keywords: ["kit", "bundle", "essentials", "setup"], ids: ["1593642632602-0cf57ef53458"] },
];

// ── Category buckets — matched against the lowercased CATEGORY name
const CATEGORY_BUCKETS: Array<{ keywords: string[]; ids: string[] }> = [
  {
    keywords: ["audio"],
    ids: ["1505740420928-5e560c06d30e", "1608043152269-423dbba4e7e1", "1590658268037-41439a3e1c24"],
  },
  {
    keywords: ["charg", "power"],
    ids: ["1609091839311-d5365f9ff1c5", "1624996407937-3a8e8a52c9bb", "1580910051081-c771de2c5cff"],
  },
  {
    keywords: ["computer", "accessor"],
    ids: ["1541140532154-b024d705b90a", "1527864550417-7fd91fc51a46", "1593642632559-0c6d3fc62b89"],
  },
  { keywords: ["mobile"], ids: ["1601974749753-d4b9f4b10aa9", "1567581935884-3349723552ca"] },
  {
    keywords: ["display", "monitor", "screen", "cable"],
    ids: ["1558618666-fcd25c85cd64", "1596558450255-7c0d7531f799", "1540974464-eb4e5ab44592"],
  },
  {
    keywords: ["bag", "storage"],
    ids: ["1636207289485-90c6a30f1d3a", "1528360983277-13d401cdc186", "1553062407-98eeb64c6a62"],
  },
  {
    keywords: ["t-shirt", "shirt", "clothing", "apparel"],
    ids: ["1521572163474-6864f9cf17ab", "1574180046565-52d5eb37082f"],
  },
  { keywords: ["footwear", "shoe"], ids: ["1542291026-7eec264c27ff"] },
  { keywords: ["service"], ids: ["1601986872029-4be756c47677", "1537832816757-edd30793e3bd"] },
  { keywords: ["electronic"], ids: ["1593642632602-0cf57ef53458", "1588200908242-1b4b6e9c1f44"] },
];

// Safe, generic pool — tried before Picsum.
const GENERIC_IDS = [
  "1593642632602-0cf57ef53458",
  "1606220838315-056192d5e927",
  "1556910103-1c02745aae4d",
  "1526401281622-c5b0e6a3e17f",
  "1586070558557-c179b9e14efb",
];

// ── Deterministic helpers
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
function rotate<T>(arr: T[], start: number): T[] {
  if (arr.length === 0) return arr;
  const s = start % arr.length;
  return [...arr.slice(s), ...arr.slice(0, s)];
}

// ── Network validation (cached so each unique id is checked at most once)
const validationCache = new Map<string, boolean>();

async function urlWorks(url: string, timeoutMs = 8000): Promise<boolean> {
  const cached = validationCache.get(url);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: "HEAD", signal: controller.signal });
    // Some CDNs reject HEAD — retry with a 1-byte ranged GET.
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: controller.signal,
      });
    }
    const ok = res.ok || res.status === 206;
    validationCache.set(url, ok);
    return ok;
  } catch {
    validationCache.set(url, false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Pick the first candidate image that actually resolves; else Picsum.
async function chooseImage(
  productId: string,
  name: string,
  categoryName: string | null,
): Promise<string> {
  const candidates: string[] = [];

  const n = name.toLowerCase();
  for (const b of NAME_BUCKETS) {
    if (b.keywords.some((k) => n.includes(k))) candidates.push(...b.ids);
  }
  if (categoryName) {
    const c = categoryName.toLowerCase();
    for (const b of CATEGORY_BUCKETS) {
      if (b.keywords.some((k) => c.includes(k))) candidates.push(...b.ids);
    }
  }
  candidates.push(...GENERIC_IDS);

  // Deterministic ordering: same product always starts at the same candidate.
  const ordered = rotate(dedupe(candidates), hash(productId));

  for (const id of ordered) {
    const url = UNS(id);
    if (await urlWorks(url)) return url;
  }

  // Guaranteed real image — never 404s.
  return picsum(productId, name, categoryName);
}

// ── Main script
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyMissing = args.includes("--only-missing");
  const tenantIdx = args.indexOf("--tenant");
  const tenantId = tenantIdx !== -1 ? args[tenantIdx + 1] : undefined;

  const where: { tenantId?: string; OR?: unknown[] } = {};
  if (tenantId) where.tenantId = tenantId;
  if (onlyMissing) where.OR = [{ image: null }, { image: "" }];

  const products = await prisma.product.findMany({
    where: where as never,
    select: { id: true, name: true, category: { select: { name: true } } },
  });

  console.log(
    `Found ${products.length} product(s)` +
      (tenantId ? ` for tenant ${tenantId}` : " across all tenants") +
      (onlyMissing ? " missing an image" : "") +
      (dryRun ? " — DRY RUN, no changes will be written." : ""),
  );

  let updated = 0;
  let fallbacks = 0;
  for (const p of products) {
    const image = await chooseImage(p.id, p.name, p.category?.name ?? null);
    if (image.includes("picsum.photos")) fallbacks++;

    if (dryRun) {
      console.log(`  • ${p.name}  →  ${image}`);
    } else {
      await prisma.product.update({ where: { id: p.id }, data: { image } });
      updated++;
    }
  }

  if (dryRun) {
    console.log(
      `\nDry run complete — ${products.length} product(s) would be updated (${fallbacks} via Picsum fallback).`,
    );
  } else {
    console.log(`\n✅ Updated images on ${updated} product(s) (${fallbacks} via Picsum fallback).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n❌ Failed to update product images:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
