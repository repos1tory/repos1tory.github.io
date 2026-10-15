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
