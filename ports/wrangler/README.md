# Wrangler iOS package

Packages the official Cloudflare Wrangler npm release with `esbuild-wasm` in
place of the native esbuild binary. A small downstream patch defers workerd's
unsupported-platform error so Wrangler's API/authentication and deployment
commands can start on iOS.

Cloudflare does not support iOS, and there is no iOS workerd build here. As a
result, `wrangler dev` (local Worker runtime) is intentionally unavailable. The
package must pass on-device authentication/API tests before it is published.
