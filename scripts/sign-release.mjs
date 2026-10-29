#!/usr/bin/env node
// sign-release.mjs — sign docs/Release for APT/Sileo.
//
// Produces docs/InRelease (cleartext signature, preferred by APT) and
// docs/Release.gpg (detached binary signature, for older clients).
//
// Key source, in order:
//   APT_SIGNING_KEY       armored private key in the environment (CI secret)
//   APT_SIGNING_KEY_FILE  path to an armored private key
//   ~/.config/repos1tory/apt-signing-key.asc
import * as openpgp from "openpgp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const RELEASE = path.join(DOCS, "Release");
const INRELEASE = path.join(DOCS, "InRelease");
const DETACHED = path.join(DOCS, "Release.gpg");
const PUBLIC = path.join(DOCS, "repos1tory.gpg");

function readArmoredKey() {
  if (process.env.APT_SIGNING_KEY?.includes("BEGIN PGP PRIVATE KEY")) {
    return process.env.APT_SIGNING_KEY;
  }
  const file = process.env.APT_SIGNING_KEY_FILE ||
    path.join(os.homedir(), ".config", "repos1tory", "apt-signing-key.asc");
  if (!fs.existsSync(file)) {
    throw new Error(
      `no signing key at ${file}\n` +
      "Set APT_SIGNING_KEY (armored key) or APT_SIGNING_KEY_FILE, or run\n" +
      "  node scripts/generate-signing-key.mjs\n" +
      "in a trusted local environment.",
    );
  }
  return fs.readFileSync(file, "utf8");
}

if (!fs.existsSync(RELEASE)) {
  console.error("docs/Release is missing — run `node scripts/repo.mjs render` first");
  process.exit(1);
}
const release = fs.readFileSync(RELEASE, "utf8");
if (!/^SHA256:/m.test(release) || !/^Date:/m.test(release)) {
  console.error("docs/Release is incomplete (missing Date or SHA256)");
  process.exit(1);
}

const privateKey = await openpgp.readPrivateKey({ armoredKey: readArmoredKey() });
const publicKey = privateKey.toPublic();
const clear = await openpgp.createCleartextMessage({ text: release });
const inRelease = await openpgp.sign({
  message: clear,
  signingKeys: privateKey,
  format: "armored",
});
fs.writeFileSync(INRELEASE, inRelease, { mode: 0o644 });

const message = await openpgp.createMessage({ text: release });
const detached = await openpgp.sign({
  message,
  signingKeys: privateKey,
  detached: true,
  format: "binary",
});
fs.writeFileSync(DETACHED, Buffer.from(detached), { mode: 0o644 });

// Verify immediately with the public key that will be published.
const check = await openpgp.verify({
  message: await openpgp.readCleartextMessage({ cleartextMessage: inRelease }),
  verificationKeys: publicKey,
});
await check.signatures[0].verified;

if (!fs.existsSync(PUBLIC)) {
  fs.writeFileSync(PUBLIC, Buffer.from(publicKey.write({ armor: false })), { mode: 0o644 });
}
console.log(`signed docs/InRelease and docs/Release.gpg`);
console.log(`key: ${publicKey.getFingerprint()}`);
