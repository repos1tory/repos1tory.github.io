# Wrangler iOS package

Packages the official Cloudflare Wrangler npm release with `esbuild-wasm` in
place of the native esbuild binary. A small downstream patch defers workerd's
unsupported-platform error so Wrangler's API/authentication and deployment
commands can start on iOS.

Cloudflare does not support iOS, and there is no iOS workerd build here. As a
result, `wrangler dev` (local Worker runtime) is intentionally unavailable. The
package must pass on-device authentication/API tests before it is published.

## Published package

`wrangler-ios 4.151.0-1` is published and was verified on-device with a real
`wrangler deploy` to Cloudflare Workers (plus `deploy --dry-run` bundling via
esbuild-wasm). Authenticate on iOS with `wrangler login --device` — the browser
callback flow (`http://localhost:8976`) is unreliable on iOS. The `nodejs`
package is required (the wrapper reuses it with the same required flags).
