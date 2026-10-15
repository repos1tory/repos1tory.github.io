# Node.js iOS port

This build starts from upstream Node.js and targets rootless, jailbroken
`iphoneos-arm64` devices running iOS 15 or newer. The iOS cross-build and V8
W^X/JIT approach are adapted from
[`j0shua-SYSON/node-ios`](https://github.com/j0shua-SYSON/node-ios), then updated
for the pinned Node.js release. See `LICENSE.upstream` for that port's MIT
license. Node.js retains its own license and third-party notices.

This is an experimental community port, not an official Node.js iOS build. The
packaged `node` wrapper enables V8's `--predictable --single-threaded` mode,
which is required by the current iOS W^X implementation. The CI build and
on-device JIT, WebAssembly, TLS, SQLite, npm, and Wrangler tests must pass before
publishing the packages to the Sileo repository.

## Published package

`nodejs 22.19.0-1` is published: built from the validated
[`j0shua-SYSON/node-ios`](https://github.com/j0shua-SYSON/node-ios) v22.19.0
build (maintained fork with fixes: [`repos1tory/node-ios`](https://github.com/repos1tory/node-ios)),
packaged and verified on-device. The CI pipeline here builds the next version
(the default is `v24.22.0`) from `ios-source-fixups.sh`.

Runtime flags baked into the `node`/`npm`/`npx` wrappers:

- `--predictable --single-threaded` — makes the process-wide `mprotect` W^X flip
  race-free (required by the JIT patch).
- `--disable-wasm-trap-handler` — **required for WebAssembly memory**: with trap
  handling on, V8 reserves 10GB of guarded address space per wasm memory, which
  iOS's per-process VA cap rejects (`could not allocate memory`). Breaks
  blake3-wasm / esbuild-wasm / wrangler otherwise.

The `entitlements.plist` also requests
`com.apple.developer.kernel.extended-virtual-addressing` for larger reservations.
