#!/usr/bin/env node
// repo.mjs — single source of truth for the repos1tory APT repo.
//
//   packages.json  ->  docs/Packages, docs/Packages.gz, docs/Release,
//                      docs/downloads.json, docs/index.html (between markers)
//
// Commands:
//   node scripts/repo.mjs seed            one-time: build packages.json from the
//                                         existing Packages + index.html
//   node scripts/repo.mjs render          regenerate every output file
//   node scripts/repo.mjs add --deb F ... add/refresh one built package
//   node scripts/repo.mjs check           validate the manifest
//
// Hosting: .deb files live on GitHub Releases (that is where download counts
// come from). Their URLs are absolute and go straight into `Filename:`.
// Legacy versions still point at pool/ on GitHub Pages.

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const MANIFEST = join(ROOT, "packages.json");
const BASE = "https://repos1tory.github.io";

const README_ORDER = ["tweaks", "apps", "tools", "ports"];
const GROUP_TITLES = { tweaks: "tweaks", apps: "apps", tools: "tools", ports: "ports" };

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

// ---------------------------------------------------------------- utilities

const readJSON = async (p) => JSON.parse(await readFile(p, "utf8"));
const writeJSON = (p, v) => writeFile(p, JSON.stringify(v, null, 2) + "\n");

function blankify(v) {
  // packages.json is line-diffed in PRs; keep it stable and readable.
  return v;
}

// Debian version comparison (epoch:upstream-revision, with ~ ordering).
function cmpVersion(a, b) {
  const split = (v) => {
    const m = /^(?:(\d+):)?(.*)$/.exec(v);
    return { epoch: Number(m[1] || 0), rest: m[2] };
  };
  const order = (c) => (c === "~" ? -1 : /[A-Za-z]/.test(c) ? c.charCodeAt(0) : c === "" ? 0 : c.charCodeAt(0) + 256);
  const A = split(a), B = split(b);
  if (A.epoch !== B.epoch) return A.epoch - B.epoch;
  const seg = (s) => s.match(/\d+|\D+/g) || [];
  const sa = seg(A.rest), sb = seg(B.rest);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i] ?? "", y = sb[i] ?? "";
    if (x === y) continue;
    const dx = /^\d+$/.test(x), dy = /^\d+$/.test(y);
    if (dx && dy) {
      const n = Number(x) - Number(y);
      if (n) return n;
    } else if (dx !== dy) {
      return dx ? 1 : -1;
    } else {
      for (let j = 0; j < Math.max(x.length, y.length); j++) {
        const d = order(x[j] ?? "") - order(y[j] ?? "");
        if (d) return d;
      }
    }
  }
  return 0;
}

function parseControl(text) {
  const fields = {};
  let key = null;
  for (const line of text.split("\n")) {
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
  return fields;
}

function controlFromDeb(deb) {
  return parseControl(execFileSync("dpkg-deb", ["-f", deb], { encoding: "utf8" }));
}

async function hashFile(path) {
  const buf = await readFile(path);
  return {
    size: buf.length,
    md5: createHash("md5").update(buf).digest("hex"),
    sha1: createHash("sha1").update(buf).digest("hex"),
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

// Field order used in Packages (cosmetic; dpkg doesn't care).
const FIELD_ORDER = [
  "Package", "Version", "Architecture", "Maintainer", "Installed-Size",
  "Depends", "Pre-Depends", "Conflicts", "Replaces", "Provides", "Breaks",
  "Priority", "Section", "Homepage", "Depiction", "SileoDepiction",
  "Author", "Name", "Description",
];

function renderStanza(fields) {
  const keys = [
    ...FIELD_ORDER.filter((k) => fields[k] !== undefined),
    ...Object.keys(fields).filter((k) => !FIELD_ORDER.includes(k)),
  ];
  return keys
    .map((k) => {
      const v = String(fields[k]);
      return v.includes("\n")
        ? `${k}: ${v.split("\n").map((l) => (l ? ` ${l}` : " .")).join("\n")}`
        : `${k}: ${v}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------- rendering

function allReleases(pkg) {
  return [...pkg.versions].sort((a, b) => cmpVersion(a.version, b.version));
}

function latest(pkg) {
  const r = allReleases(pkg);
  return r[r.length - 1];
}

function effectiveUrl(v) {
  return /^https?:/.test(v.url) ? v.url : v.url.replace(/^\/+/, "");
}

async function renderPackages(manifest) {
  // Only what is published on the site: each listed entry at its latest
  // version, plus the package ids declared as `members` of that entry
  // (TopBar's plugins, CLM's sender). Nothing else goes in the index.
  const entries = [];
  for (const [id, pkg] of Object.entries(manifest.packages)) {
    if (!pkg.site) continue;
    const v = latest(pkg);
    if (v) entries.push({ id, v });
    for (const member of pkg.members ?? []) {
      const mp = manifest.packages[member];
      const mv = mp && latest(mp);
      if (mv) entries.push({ id: member, v: mv });
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const seen = new Set();
  const stanzas = [];
  for (const { id, v } of entries) {
    if (seen.has(id)) continue;
    seen.add(id);
    const f = { ...v.control };
    f.Size = v.size;
    f.MD5sum = v.md5;
    f.SHA1 = v.sha1;
    f.SHA256 = v.sha256;
    f.Filename = effectiveUrl(v);
    stanzas.push(renderStanza(f));
  }
  return stanzas.join("\n\n") + "\n";
}

function renderIndex(manifest) {
  const byGroup = new Map(README_ORDER.map((g) => [g, []]));
  for (const [id, pkg] of Object.entries(manifest.packages)) {
    if (!pkg.site) continue;
    const g = byGroup.has(pkg.group) ? pkg.group : "tools";
    const v = latest(pkg);
    if (!v) continue;
    byGroup.get(g).push({ id, pkg, v });
  }
  const out = {};
  for (const [g, items] of byGroup) {
    items.sort((a, b) => (a.pkg.order ?? 999) - (b.pkg.order ?? 999) || a.pkg.name.localeCompare(b.pkg.name));
    out[g] = items
      .map(({ pkg, v }) => {
        const blurb = pkg.blurb || v.control.Description || "";
        const repo = pkg.source || (pkg.repo ? `https://github.com/${pkg.repo}` : null);
        // The name is the link to the source. The only trailing link is the
        // download, so every entry reads the same way.
        const name = repo ? `<a href="${repo}">${pkg.name}</a>` : pkg.name;
        const dl = pkg.links?.[0] ?? { href: effectiveUrl(v), label: "download .deb" };
        const anchors = `<a href="${dl.href}">${dl.label}</a>`;
        return `  <li><b>${name}</b> <span class="ver">${v.version}</span> — ${blurb} ${anchors}</li>`;
      })
      .join("\n");
  }
  return out;
}

function splice(html, group, items) {
  const re = new RegExp(`(<!-- BEGIN:${group} -->)[\\s\\S]*?\\n[ \\t]*(<!-- END:${group} -->)`);
  if (!re.test(html)) throw new Error(`index.html is missing markers for "${group}"`);
  return html.replace(re, `$1\n${items}\n  $2`);
}

async function renderAll(manifest) {
  await mkdir(DOCS, { recursive: true });
  const packages = await renderPackages(manifest);

  await writeFile(join(DOCS, "Packages"), packages);
  await writeFile(join(DOCS, "Packages.gz"), gzipSync(Buffer.from(packages), { level: 9 }));
  const pgz = await readFile(join(DOCS, "Packages.gz"));

  const hash = (buf, alg) => createHash(alg).update(buf).digest("hex");
  const sum = (buf, alg) =>
    alg === "MD5Sum" ? hash(buf, "md5") : alg === "SHA1" ? hash(buf, "sha1") : hash(buf, "sha256");
  const sections = ["MD5Sum", "SHA1", "SHA256"]
    .map((alg) =>
      [`${alg}:`, ...[["Packages", Buffer.from(packages)], ["Packages.gz", pgz]]
        .map(([name, buf]) => ` ${sum(buf, alg)} ${buf.length} ${name}`)].join("\n"))
    .join("\n");

  const release = [
    "Origin: repos1tory",
    "Label: repos1tory",
    "Suite: ./",
    "Codename: repos1tory",
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    "Architectures: iphoneos-arm64",
    "Description: a minimal repository for jailbroken iOS",
    sections,
    "",
  ].join("\n");
  await writeFile(join(DOCS, "Release"), release);

  // Machine-readable mirror of what the site shows.
  const downloads = {};
  for (const [id, pkg] of Object.entries(manifest.packages)) {
    const v = latest(pkg);
    if (!v) continue;
    downloads[id] = {
      name: pkg.name,
      version: v.version,
      url: effectiveUrl(v),
      size: v.size,
      sha256: v.sha256,
      ...(pkg.source ? { source: pkg.source } : {}),
    };
  }
  await writeJSON(join(DOCS, "downloads.json"), { generated: new Date().toISOString(), packages: downloads });

  let html = await readFile(join(DOCS, "index.html"), "utf8");
  for (const [group, items] of Object.entries(renderIndex(manifest))) {
    html = splice(html, group, items);
  }
  await writeFile(join(DOCS, "index.html"), html);

  return packages;
}

// ---------------------------------------------------------------- commands

async function loadManifest() {
  if (!existsSync(MANIFEST)) throw new Error("packages.json not found — run `seed` first");
  return readJSON(MANIFEST);
}

async function seed() {
  const stanzas = (await readFile(join(DOCS, "Packages"), "utf8"))
    .split(/\n\n+/)
    .map(parseControl)
    .filter((f) => f.Package);

  const manifest = { packages: {} };

  // name -> id, for matching the hand-written site entries
  const byName = new Map();

  for (const f of stanzas) {
    const pkg = (manifest.packages[f.Package] ??= {
      name: f.Name || f.Package,
      group: f.Section === "Tweaks" ? "tweaks" : "tools",
      site: false,
      blurb: f.Description || "",
      source: null,
      repo: null,
      versions: [],
    });
    if (f.Name) byName.set(f.Name, f.Package);
    pkg.versions.push({
      version: f.Version,
      url: f.Filename,
      size: Number(f.Size),
      md5: f.MD5sum,
      sha1: f.SHA1,
      sha256: f.SHA256,
      control: stripHashes(f),
      published: null,
    });
  }

  // Pull sections/blurbs/sources out of the current index.html.
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const resolve = (fromFile, display) => {
    if (manifest.packages[fromFile]) return fromFile;
    const want = norm(display);
    const entries = Object.entries(manifest.packages);
    const exact = entries.find(([, p]) => norm(p.name) === want);
    if (exact) return exact[0];
    const prefix = entries.find(([, p]) => norm(p.name).startsWith(want) || want.startsWith(norm(p.name)));
    return prefix ? prefix[0] : null;
  };

  const html = await readFile(join(DOCS, "index.html"), "utf8");
  const sectionRe = /<h2>([^<]+)<\/h2>\s*<ul>([\s\S]*?)<\/ul>/g;
  for (const m of html.matchAll(sectionRe)) {
    const group = m[1].trim();
    const itemRe = /<li><b>(.*?)<\/b> <span class="ver">(.*?)<\/span> — ([\s\S]*?)<\/li>/g;
    let order = 0;
    for (const it of m[2].matchAll(itemRe)) {
      const display = it[1];
      const body = it[3];
      const links = [...body.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)].map((l) => ({
        href: l[1],
        label: l[2],
      }));
      const blurb = body.split("<a href=")[0].replace(/\s+$/, "");
      const firstHref = links[0]?.href ?? "";
      const fromFile = /\.deb$/.test(firstHref)
        ? basename(firstHref).replace(/\.deb$/, "").split("_")[0]
        : "";
      const id = resolve(fromFile, display);
      if (!id) continue;
      const pkg = manifest.packages[id];
      pkg.group = group;
      pkg.site = true;
      pkg.order = order++;
      pkg.blurb = blurb;
      pkg.links = links;
      pkg.autoLinks = links.length > 0 && links[0].label === "download .deb";
      const src = links.find((l) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(l.href));
      if (src) pkg.source = src.href;
      pkg.name = display;
    }
  }

  // Known upstream repos (used by CI dispatch + source links).
  const repos = {
    "com.alsinas.sounddeck": "repos1tory/SoundDeck",
    "com.alsinas.topbar": "repos1tory/topbar-ios",
    "com.alsinas.ratebar": "repos1tory/topbar-ios",
    "com.alsinas.homemanager": "repos1tory/homemanager-ios",
    "com.alsinas.mdcontrol": "repos1tory/psychosis-ios",
    "com.alsinas.psychosis": "repos1tory/psychosis-ios",
    "com.alsinas.opencode-server": "repos1tory/opencode-ios",
    "com.repos1tory.cloudflared": "repos1tory/cloudflared-ios",
    nodejs: "repos1tory/node-ios",
    "wrangler-ios": "repos1tory/wrangler-ios",
  };
  for (const [id, repo] of Object.entries(repos)) {
    if (manifest.packages[id] && !manifest.packages[id].repo) {
      manifest.packages[id].repo = repo;
    }
  }

  await writeJSON(MANIFEST, manifest);
  console.log(`seed: ${Object.keys(manifest.packages).length} packages, ${stanzas.length} versions -> packages.json`);
}

function stripHashes(f) {
  const drop = new Set(["Filename", "Size", "MD5sum", "SHA1", "SHA256"]);
  return Object.fromEntries(Object.entries(f).filter(([k]) => !drop.has(k)));
}

async function add() {
  const deb = flag("deb");
  if (!deb) throw new Error("add requires --deb <file>");
  const repo = flag("repo");
  const tag = flag("tag");
  const url = flag("url");
  const group = flag("group");
  const copy = has("copy");

  const control = controlFromDeb(deb);
  const id = control.Package;
  if (!id) throw new Error(`${deb}: no Package field`);
  const version = control.Version;
  if (!version) throw new Error(`${deb}: no Version field`);

  if (tag) {
    const bare = tag.replace(/^v/, "");
    if (bare !== version) {
      console.warn(`warn: tag ${tag} does not match control Version ${version}; using ${version}`);
    }
  }
  if (version.includes("+")) {
    console.warn(`warn: ${id} ${version} contains "+", which some clients mis-handle in URLs`);
  }

  const hashes = await hashFile(deb);
  let debUrl = url;

  if (/^https?:/.test(url || "")) {
    debUrl = url;
  } else {
    // Legacy mode: keep the file in pool/ and reference it relatively.
    const initial = id.replace(/^com\./, "").replace(/^org\./, "")[0] || "_";
    const dir = join(DOCS, "pool", "main", initial, id.split(".").pop());
    await mkdir(dir, { recursive: true });
    const dest = join(dir, basename(deb));
    if (resolve(deb) !== resolve(dest)) await copyFile(deb, dest);
    debUrl = `pool/main/${initial}/${id.split(".").pop()}/${basename(deb)}`;
    void copy;
  }

  const manifest = await loadManifest();
  const isNew = !manifest.packages[id];
  const pkg = (manifest.packages[id] ??= {
    name: control.Name || id,
    group: group || "tweaks",
    // A package nobody has curated yet is installable but stays off the web
    // page until it is added to packages.json (or published with --site).
    site: has("site"),
    blurb: control.Description || "",
    source: repo ? `https://github.com/${repo}` : null,
    repo: repo || null,
    versions: [],
  });
  if (group) pkg.group = group;
  if (has("site")) pkg.site = true;
  if (has("no-site")) pkg.site = false;
  if (isNew) console.log(`new package ${id} — listed on the site: ${pkg.site}`);
  if (repo) {
    pkg.repo = repo;
    pkg.source ||= `https://github.com/${repo}`;
  }
  pkg.name ||= control.Name || id;
  if (!pkg.blurb) pkg.blurb = control.Description || "";

  const entry = {
    version,
    url: debUrl,
    ...hashes,
    control: stripHashes(control),
    published: new Date().toISOString(),
  };
  const i = pkg.versions.findIndex((v) => v.version === version);
  if (i === -1) pkg.versions.push(entry);
  else pkg.versions[i] = entry;

  // Keep the site's download link in sync, unless it was set by hand
  // (TopBar points at its plugin directory instead of one .deb).
  if (pkg.autoLinks === undefined) pkg.autoLinks = true;
  if (pkg.autoLinks) {
    if (!pkg.links?.length) {
      pkg.links = [{ href: debUrl, label: "download .deb" }];
      if (pkg.source) pkg.links.push({ href: pkg.source, label: "source" });
    } else {
      pkg.links[0] = { href: debUrl, label: pkg.links[0].label };
    }
  }

  await writeJSON(MANIFEST, blankify(manifest));
  await renderAll(manifest);
  console.log(`add: ${id} ${version} -> ${debUrl}`);
}

async function check() {
  const manifest = await loadManifest();
  let versions = 0;
  const problems = [];
  for (const [id, pkg] of Object.entries(manifest.packages)) {
    if (!pkg.versions.length) problems.push(`${id}: no versions`);
    for (const v of pkg.versions) {
      versions++;
      if (v.control.Package !== id) problems.push(`${id}: stanza has Package ${v.control.Package}`);
      if (v.control.Version !== v.version) problems.push(`${id}: stanza Version mismatch`);
      if (v.url.startsWith("http") && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(v.url)) {
        problems.push(`${id} ${v.version}: unexpected asset URL ${v.url}`);
      }
      if (!v.sha256 || !v.size) problems.push(`${id} ${v.version}: missing hashes/size`);
    }
  }
  if (problems.length) {
    console.error(problems.map((p) => "  " + p).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`check: ok — ${Object.keys(manifest.packages).length} packages, ${versions} versions`);
}

switch (cmd) {
  case "seed":
    await seed();
    break;
  case "render":
    await renderAll(await loadManifest());
    console.log("render: Packages, Packages.gz, Release, downloads.json, index.html");
    break;
  case "add":
    await add();
    break;
  case "check":
    await check();
    break;
  default:
    console.error("usage: repo.mjs <seed|render|add|check> [options]");
    process.exit(1);
}
