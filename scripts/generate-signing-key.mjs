#!/usr/bin/env node
// generate-signing-key.mjs — create the APT repository's OpenPGP signing key.
//
// The private key is written OUTSIDE the repository (default
// ~/.config/repos1tory/apt-signing-key.asc, mode 600). Only the public key is
// committed under docs/.
import * as openpgp from "openpgp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const get = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const force = args.includes("--force");
const out = path.resolve(
  get("out", process.env.APT_SIGNING_KEY_FILE ||
    path.join(os.homedir(), ".config", "repos1tory", "apt-signing-key.asc")),
);
const name = get("name", "repos1tory APT");
const email = get("email", "apt@repos1tory.github.io");

if (fs.existsSync(out) && !force) {
  console.error(`refusing to overwrite existing key: ${out}`);
  console.error("pass --force only if you intend to rotate the repository key");
  process.exit(1);
}

const { privateKey: privArmored, publicKey: pubArmored } = await openpgp.generateKey({
  type: "ecc",
  curve: "ed25519",
  userIDs: [{ name, email }],
  format: "armored",
});
const privateKey = await openpgp.readPrivateKey({ armoredKey: privArmored });
const publicKey = await openpgp.readKey({ armoredKey: pubArmored });
const fingerprint = publicKey.getFingerprint();

fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
fs.writeFileSync(out, privateKey.armor(), { mode: 0o600 });
fs.chmodSync(out, 0o600);

const docs = path.join(ROOT, "docs");
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, "repos1tory.gpg"), Buffer.from(publicKey.write({ armor: false })));
fs.writeFileSync(path.join(docs, "repos1tory.asc"), publicKey.armor());
fs.writeFileSync(
  path.join(docs, "repos1tory.fingerprint"),
  `fingerprint: ${fingerprint}\nkey: ${name} <${email}>\ncreated: ${new Date().toISOString()}\n`,
);

console.log(`private key: ${out} (mode 600, not in the repository)`);
console.log(`public key:  docs/repos1tory.gpg`);
console.log(`fingerprint: ${fingerprint}`);
console.log("");
console.log("Next: node scripts/sign-release.mjs");
console.log("Then commit docs/repos1tory.gpg, docs/repos1tory.asc and the signed Release files.");
console.log("For CI, store the private key as the APT_SIGNING_KEY repository secret:");
console.log(`  gh secret set APT_SIGNING_KEY -R repos1tory/repos1tory.github.io < ${out}`);
