#!/usr/bin/env node
// Creates .env.local with a fresh random MEDIA_TOKEN_SECRET (never overwrites an existing file).
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target)) {
  console.log(`${target} already exists — leaving it untouched.`);
  process.exit(0);
}
const template = readFileSync(".env.example", "utf8");
const secret = randomBytes(32).toString("base64url");
const out = template
  .replace(/^MEDIA_TOKEN_SECRET=.*$/m, `MEDIA_TOKEN_SECRET=${secret}`)
  .replace(/^PYTHON_API_URL=.*$/m, "PYTHON_API_URL=http://127.0.0.1:8000");
writeFileSync(target, out, { mode: 0o600 });
console.log(`Created ${target} with a random MEDIA_TOKEN_SECRET.`);
