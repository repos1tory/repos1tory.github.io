#!/usr/bin/env node
// verify-repo.mjs — verify the signed APT metadata and every pool hash.
//
// Checks:
//   * docs/InRelease is a valid cleartext signature over docs/Release
//   * docs/Release.gpg is a valid detached signature over docs/Release
//   * Package stanzas use relative pool Filenames
//   * Size/SHA256 in Packages match the files in docs/pool
//   * Release's SHA256 entries match Packages and Packages.gz
import * as openpgp from "openpgp";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const read = (p) => fs.readFileSync(path.join(DOCS, p), "utf8");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const release = read("Release");
const inRelease = read("InRelease");
const publicKey = await openpgp.readKey({ armoredKey: read("repos1tory.asc") });

const clear = await openpgp.readCleartextMessage({ cleartextMessage: inRelease });
const clearCheck = await openpgp.verify({ message: clear, verificationKeys: publicKey });
await clearCheck.signatures[0].verified;
if (clear.getText().replace(/\r\n/g, "\n") !== release.replace(/\r\n/g, "\n")) {
  fail("InRelease body does not match Release");
}

const detached = await openpgp.readSignature({
  binarySignature: fs.readFileSync(path.join(DOCS, "Release.gpg")),
});
const detCheck = await openpgp.verify({
  message: await openpgp.createMessage({ text: release }),
  signature: detached,
  verificationKeys: publicKey,
});
await detCheck.signatures[0].verified;

const packages = read("Packages");
const stanzas = packages.split(/\n\n+/).filter((s) => s.trim());
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

for (const stanza of stanzas) {
  const fields = {};
  let key = null;
  for (const line of stanza.split("\n")) {
    if (/^\s/.test(line) && key) {
      fields[key] += "\n" + line.replace(/^ /, "");
      continue;
    }
    const m = /^([A-Za-z0-9][A-Za-z0-9-]*):\s?(.*)$/.exec(line);
    if (m) {
      key = m[1];
      fields[key] = m[2];
    }
  }
  const id = fields.Package;
  if (!id) fail("stanza without Package");
  const filename = fields.Filename;
  if (!filename) fail(`${id}: missing Filename`);
  if (/^https?:/i.test(filename) || filename.startsWith("/") || filename.split("/").includes("..")) {
    fail(`${id}: Filename must be a safe relative pool path, got ${filename}`);
  }
  const file = path.join(DOCS, filename);
  if (!fs.existsSync(file)) fail(`${id}: missing ${filename}`);
  const buf = fs.readFileSync(file);
  if (fields.Size && Number(fields.Size) !== buf.length) {
    fail(`${id}: Size ${fields.Size} != ${buf.length}`);
  }
  if (fields.SHA256 && fields.SHA256 !== sha(buf)) {
    fail(`${id}: SHA256 mismatch for ${filename}`);
  }
}

// Release hashes for the indexes themselves.
const indexHashes = new Map();
let inSha = false;
for (const line of release.split("\n")) {
  if (line === "SHA256:") { inSha = true; continue; }
  if (inSha) {
    const m = /^\s+([0-9a-f]{64})\s+(\d+)\s+(\S+)$/.exec(line);
    if (!m) { inSha = false; continue; }
    indexHashes.set(m[3], { hash: m[1], size: Number(m[2]) });
  }
}
for (const name of ["Packages", "Packages.gz"]) {
  const expected = indexHashes.get(name);
  if (!expected) fail(`Release has no SHA256 for ${name}`);
  const buf = fs.readFileSync(path.join(DOCS, name));
  if (buf.length !== expected.size || sha(buf) !== expected.hash) {
    fail(`Release SHA256/Size mismatch for ${name}`);
  }
}

console.log(`PASS: InRelease + Release.gpg signatures valid (${publicKey.getFingerprint()})`);
console.log(`PASS: ${stanzas.length} Packages stanzas, all pool hashes match`);
