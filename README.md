# arch1ve

a minimal repository for jailbroken iOS. Add this URL to Sileo or Zebra:

`https://repos1tory.github.io/`

## Packages

- **MultiDelete** `0.1.12-1+debug`
- **MDControl** `0.3.0`
- **OpenCode Server** `2.0.28-0ios12`
- **Node.js** `22.19.0-1` — upstream Node.js 22 with full JIT + WebAssembly for iOS, bundles `npm`/`npx`
- **Wrangler** `4.151.0-1` — Cloudflare Workers CLI (esbuild-wasm); needs `nodejs`; local `wrangler dev` unavailable

All packages target `iphoneos-arm64`. OpenCode Server requires firmware 15.0 or newer and PreferenceLoader 2.2.6 or newer. MultiDelete's available build carries the `+debug` version suffix. The Node.js/Wrangler packages are cross-compiled from `ports/nodejs-ios` and `ports/wrangler` (see their READMEs); the `node` wrapper passes the flags the iOS W^X JIT and wasm-memory paths require.

## Update the repository

Place each `.deb` below `docs/pool/` using the existing package-family directories, then rebuild the package indexes:

```sh
./build-index.sh
```

Commit and push to `main`. The GitHub Actions workflow publishes `docs/` to GitHub Pages.

The `Release` index is unsigned, so package managers may display their usual warning for unsigned sources.
