# Alsinas Labs iPad Tweaks

Public APT repository for Alsinas Labs iPadOS packages. Add this URL to Sileo or Zebra:

`https://al5ina5.github.io/alsinas-labs-ipad-tweaks/`

## Packages

- **MultiDelete** `0.1.12-1+debug`
- **MDControl** `0.3.0`
- **OpenCode Server** `2.0.28-0ios12`

All packages target `iphoneos-arm64`. OpenCode Server requires firmware 15.0 or newer and PreferenceLoader 2.2.6 or newer. MultiDelete's available build carries the `+debug` version suffix.

## Update the repository

Place each `.deb` below `docs/pool/` using the existing package-family directories, then rebuild the package indexes:

```sh
./build-index.sh
```

Commit and push to `main`. The GitHub Actions workflow publishes `docs/` to GitHub Pages.

The `Release` index is unsigned, so package managers may display their usual warning for unsigned sources.
