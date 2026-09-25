#!/usr/bin/env node
// Asserts the built IIFE bundle stays under SPEC.md §4.1's 12 KB gzipped budget.
// Run after `bun run build` — `bun run size` does not build dist/ itself.

import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BUDGET_BYTES = 12 * 1024;
const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(__dirname, "..", "dist", "embed.iife.js");

let source;
try {
  source = readFileSync(bundlePath);
} catch (error) {
  if (error.code === "ENOENT") {
    console.error(`check-bundle-size: ${bundlePath} does not exist — run "bun run build" first.`);
    process.exit(1);
  }
  throw error;
}

const gzippedBytes = gzipSync(source).length;
const gzippedKb = (gzippedBytes / 1024).toFixed(2);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);

if (gzippedBytes > BUDGET_BYTES) {
  console.error(
    `check-bundle-size: dist/embed.iife.js is ${gzippedKb} KB gzipped, over the ${budgetKb} KB budget (SPEC.md §4.1).`,
  );
  process.exit(1);
}

console.log(
  `check-bundle-size: dist/embed.iife.js is ${gzippedKb} KB gzipped (budget ${budgetKb} KB) — ok.`,
);
