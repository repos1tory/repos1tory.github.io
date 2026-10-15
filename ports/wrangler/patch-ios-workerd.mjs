import fs from "node:fs";
import path from "node:path";

const installRoot = process.argv[2];
if (!installRoot) throw new Error("usage: patch-ios-workerd.mjs <node_modules-root>");

const entry = path.join(installRoot, "workerd", "lib", "main.js");
let source = fs.readFileSync(entry, "utf8");
const anchor = "function generateBinPath() {";
if (source.split(anchor).length !== 2) {
  throw new Error("Unexpected workerd entry point; refusing an unreviewed patch");
}

// Workerd is only needed for Wrangler's local `dev` runtime. Its npm package
// throws during import on iOS, which also prevents API/deploy commands from
// starting. Defer that unsupported-runtime failure until Wrangler tries to
// spawn workerd; do not ship or execute a macOS/Linux binary on iOS.
source = source.replace(
  anchor,
  `${anchor}\n  if (process.platform === "ios") {\n` +
    `    return { binPath: "/var/jb/usr/bin/workerd-ios-unavailable" };\n` +
    `  }`,
);
fs.writeFileSync(entry, source);
