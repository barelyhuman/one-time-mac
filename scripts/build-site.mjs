#!/usr/bin/env node
/**
 * Parse README.md Products sections and build static site output.
 * Exits non-zero if any product line fails to parse.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const README_PATH = path.join(ROOT, "README.md");
const SITE_DIR = path.join(ROOT, "site");
const OUT_DATA = path.join(SITE_DIR, "data", "products.json");
const INDEX_HTML = path.join(SITE_DIR, "index.html");

const SITE_BASE = "https://barelyhuman.github.io/one-time-mac";

const PRODUCT_LINE =
  /^- \[([^\]]+)\]\(([^)]+)\)(?:\s*-\s*(.+))?$/;
const TOC_LINE = /^- \[([^\]]+)\]\(#[^)]+\)\s*$/;

const CURRENCY_ISO = { $: "USD", "£": "GBP", "€": "EUR" };

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseLicenseAndPrice(rest) {
  if (!rest || !rest.trim()) {
    return { price: null, licenseUrl: null, licenseLabel: null };
  }
  const licenseMatch = rest.match(/\[([^\]]+)\]\(([^)]+)\)\s*$/);
  if (!licenseMatch) {
    return null;
  }
  const licenseLabel = licenseMatch[1];
  const licenseUrl = licenseMatch[2];
  const before = rest.slice(0, licenseMatch.index).replace(/\s*-\s*$/, "").trim();
  const price = before.length > 0 ? before : null;
  return { price, licenseUrl, licenseLabel };
}

function parsePriceSort(price) {
  if (!price) {
    return { currency: "", value: null, missing: true };
  }
  const trimmed = price.trim();
  const currencyMatch =
    trimmed.match(/^([$£€])/) || trimmed.match(/([$£€])\s*$/);
  const currency = currencyMatch ? currencyMatch[1] : "";
  const numPart = trimmed.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const value = parseFloat(numPart);
  return {
    currency,
    value: Number.isFinite(value) ? value : null,
    missing: false,
    raw: trimmed,
  };
}

function parseReadme(content) {
  const lines = content.split(/\r?\n/);
  const products = [];
  const categories = [];
  let inProducts = false;
  let category = null;
  let categorySlug = null;
  let description = "";
  let descriptionDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (!descriptionDone && line.trim() && !line.startsWith("#") && !line.startsWith("**")) {
      description += (description ? " " : "") + line.trim();
      if (line.trim().endsWith("license")) {
        descriptionDone = true;
      }
      continue;
    }
    if (!descriptionDone && (line.startsWith("**") || line.startsWith("#"))) {
      if (description.trim()) descriptionDone = true;
    }

    if (line.trim() === "## Products") {
      inProducts = true;
      continue;
    }

    if (!inProducts) continue;

    if (line.startsWith("### ")) {
      category = line.slice(4).trim();
      categorySlug = slugify(category);
      if (!categories.some((c) => c.slug === categorySlug)) {
        categories.push({ name: category, slug: categorySlug });
      }
      continue;
    }

    if (!category) continue;

    if (!line.startsWith("- [")) continue;
    if (TOC_LINE.test(line)) continue;

    const m = line.match(PRODUCT_LINE);
    if (!m) {
      console.error(`FAIL: Line ${lineNo} is not a valid product entry:\n  ${line}`);
      process.exit(1);
    }

    const [, name, productUrl, rest] = m;
    const parsed = parseLicenseAndPrice(rest);
    if (parsed === null) {
      console.error(
        `FAIL: Line ${lineNo} has trailing text without a license link (use dash in site for missing license):\n  ${line}`
      );
      process.exit(1);
    }

    const priceSort = parsePriceSort(parsed.price);
    products.push({
      name,
      slug: slugify(name),
      productUrl,
      category,
      categorySlug,
      price: parsed.price,
      priceSort,
      licenseUrl: parsed.licenseUrl,
      licenseLabel: parsed.licenseLabel,
    });
  }

  const generatedAt = new Date().toISOString();

  return {
    description: description.trim(),
    categories,
    products,
    generatedAt,
  };
}

function apiProduct(p, generatedAt) {
  const ps = p.priceSort || {};
  const symbol = ps.currency || null;
  return {
    name: p.name,
    slug: p.slug,
    url: p.productUrl,
    price: p.price,
    currency: symbol ? CURRENCY_ISO[symbol] || symbol : null,
    price_value: ps.missing ? null : ps.value,
    license_url: p.licenseUrl,
    category: p.category,
    category_slug: p.categorySlug,
    generated_at: generatedAt,
  };
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function buildLlmsTxt(data) {
  return `# One-Time Mac

> ${data.description}

Community-maintained catalog of macOS apps sold with a one-time lifetime license (not subscription). Source of truth: README.md in the GitHub repo; this site is static and rebuilt on every merge to main.

## Inclusion criteria

- One-time purchase fee for the license (perpetual or per-major-version licenses count).
- macOS app with a public product page and license terms link when available.
- Mac App Store entries may omit price (regional pricing).

## How to query

- Full catalog (JSON): ${SITE_BASE}/api/products.json
- Categories index: ${SITE_BASE}/api/categories.json
- Per category: ${SITE_BASE}/api/categories/<slug>.json (slugs match category names, e.g. developer-tools)
- Plain markdown export: ${SITE_BASE}/llms-full.txt
- Human UI with search: ${SITE_BASE}/?q=<term>&category=<slug>

Filter JSON client-side by name, category, price, or license fields. For the HTML UI, share or fetch URLs with query parameters above.

## Data files

- [Product catalog API](${SITE_BASE}/api/products.json): all products with price, currency, and license URLs
- [Categories API](${SITE_BASE}/api/categories.json): category slugs and counts
- [Full list (markdown)](${SITE_BASE}/llms-full.txt): same data as plain text
- [Sitemap](${SITE_BASE}/sitemap.xml)

## Optional

- [GitHub repository](https://github.com/barelyhuman/one-time-mac): propose additions via pull request
`;
}

function buildLlmsFull(data) {
  const lines = [
    "# One-Time Mac — full product list",
    "",
    data.description,
    "",
    `Generated: ${data.generatedAt}`,
    "",
  ];
  for (const cat of data.categories) {
    lines.push(`## ${cat.name}`, "");
    const inCat = data.products.filter((p) => p.categorySlug === cat.slug);
    for (const p of inCat) {
      const price = p.price || "—";
      const license = p.licenseUrl
        ? `[License](${p.licenseUrl})`
        : "—";
      lines.push(
        `- [${p.name}](${p.productUrl}) — ${price} — ${license}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_BASE}/sitemap.xml
`;
}

function buildSitemap(data) {
  const urls = [
    { loc: `${SITE_BASE}/`, priority: "1.0" },
    { loc: `${SITE_BASE}/llms.txt`, priority: "0.8" },
    { loc: `${SITE_BASE}/llms-full.txt`, priority: "0.8" },
    { loc: `${SITE_BASE}/api/products.json`, priority: "0.9" },
    { loc: `${SITE_BASE}/api/categories.json`, priority: "0.7" },
  ];
  for (const cat of data.categories) {
    urls.push({
      loc: `${SITE_BASE}/api/categories/${cat.slug}.json`,
      priority: "0.6",
    });
  }
  const lastmod = data.generatedAt.slice(0, 10);
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function currencyIsoFromProduct(p) {
  const sym = p.priceSort?.currency;
  return sym ? CURRENCY_ISO[sym] || sym : null;
}

function buildJsonLd(data) {
  const items = data.products.map((p, i) => {
    const entry = {
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SoftwareApplication",
        name: p.name,
        url: p.productUrl,
        applicationCategory: p.category,
        operatingSystem: "macOS",
      },
    };
    const iso = currencyIsoFromProduct(p);
    const value = p.priceSort?.value;
    if (iso && value != null && !p.priceSort?.missing) {
      entry.item.offers = {
        "@type": "Offer",
        price: value,
        priceCurrency: iso,
      };
    }
    return entry;
  });

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "One-Time Mac — lifetime license apps",
    description: data.description,
    numberOfItems: data.products.length,
    itemListElement: items,
  };
}

function injectJsonLd(ld) {
  let html = fs.readFileSync(INDEX_HTML, "utf8");
  const block = `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  const pattern =
    /<!-- catalog-json-ld -->[\s\S]*?<!-- \/catalog-json-ld -->/;
  if (!pattern.test(html)) {
    console.error(
      "FAIL: index.html missing <!-- catalog-json-ld --> markers"
    );
    process.exit(1);
  }
  html = html.replace(
    pattern,
    `<!-- catalog-json-ld -->\n${block}\n<!-- /catalog-json-ld -->`
  );
  fs.writeFileSync(INDEX_HTML, html);
}

function ensureSiteDirs() {
  if (!fs.existsSync(SITE_DIR)) {
    fs.mkdirSync(SITE_DIR, { recursive: true });
  }
  for (const sub of ["data", "assets", "api", "api/categories"]) {
    fs.mkdirSync(path.join(SITE_DIR, sub), { recursive: true });
  }
}

function writeAgentArtifacts(data) {
  const apiDir = path.join(SITE_DIR, "api");
  const catDir = path.join(apiDir, "categories");

  const apiProducts = {
    generated_at: data.generatedAt,
    count: data.products.length,
    products: data.products.map((p) => apiProduct(p, data.generatedAt)),
  };
  writeJson(path.join(apiDir, "products.json"), apiProducts);

  const apiCategories = {
    generated_at: data.generatedAt,
    categories: data.categories.map((c) => ({
      name: c.name,
      slug: c.slug,
      count: data.products.filter((p) => p.categorySlug === c.slug).length,
      url: `${SITE_BASE}/api/categories/${c.slug}.json`,
    })),
  };
  writeJson(path.join(apiDir, "categories.json"), apiCategories);

  for (const cat of data.categories) {
    const inCat = data.products
      .filter((p) => p.categorySlug === cat.slug)
      .map((p) => apiProduct(p, data.generatedAt));
    writeJson(path.join(catDir, `${cat.slug}.json`), {
      generated_at: data.generatedAt,
      name: cat.name,
      slug: cat.slug,
      count: inCat.length,
      products: inCat,
    });
  }

  fs.writeFileSync(path.join(SITE_DIR, "llms.txt"), buildLlmsTxt(data));
  fs.writeFileSync(path.join(SITE_DIR, "llms-full.txt"), buildLlmsFull(data));
  fs.writeFileSync(path.join(SITE_DIR, "robots.txt"), buildRobotsTxt());
  fs.writeFileSync(
    path.join(SITE_DIR, "sitemap.xml"),
    buildSitemap(data)
  );

  injectJsonLd(buildJsonLd(data));
}

function main() {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const data = parseReadme(readme);

  if (data.products.length === 0) {
    console.error("FAIL: No products parsed from README.md");
    process.exit(1);
  }

  ensureSiteDirs();

  writeJson(OUT_DATA, data);

  writeAgentArtifacts(data);

  console.log(
    `OK: Wrote ${data.products.length} products in ${data.categories.length} categories`
  );
  console.log(`    UI data: ${OUT_DATA}`);
  console.log(`    API: site/api/products.json, categories, llms.txt`);
}

main();