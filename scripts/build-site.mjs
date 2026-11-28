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

const PRODUCT_LINE =
  /^- \[([^\]]+)\]\(([^)]+)\)(?:\s*-\s*(.+))?$/;
const TOC_LINE = /^- \[([^\]]+)\]\(#[^)]+\)\s*$/;

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
  const currencyMatch = trimmed.match(/^([$£€])/);
  const currency = currencyMatch ? currencyMatch[1] : "";
  const numPart = trimmed.replace(/^[^0-9]*/, "").replace(/,/g, "");
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
      if (!categories.includes(category)) categories.push(category);
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
      productUrl,
      category,
      price: parsed.price,
      priceSort,
      licenseUrl: parsed.licenseUrl,
      licenseLabel: parsed.licenseLabel,
    });
  }

  return {
    description: description.trim(),
    categories,
    products,
    generatedAt: new Date().toISOString(),
  };
}

function ensureSiteAssets() {
  if (!fs.existsSync(SITE_DIR)) {
    fs.mkdirSync(SITE_DIR, { recursive: true });
  }
  fs.mkdirSync(path.join(SITE_DIR, "data"), { recursive: true });
  fs.mkdirSync(path.join(SITE_DIR, "assets"), { recursive: true });
}

function main() {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const data = parseReadme(readme);

  if (data.products.length === 0) {
    console.error("FAIL: No products parsed from README.md");
    process.exit(1);
  }

  ensureSiteAssets();
  fs.writeFileSync(OUT_DATA, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `OK: Wrote ${data.products.length} products in ${data.categories.length} categories to ${OUT_DATA}`
  );
}

main();