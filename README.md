# repos1tory

*things were made*

### [repos1tory.github.io](https://repos1tory.github.io/)

## layout

```
packages.json    source of truth: every package, every version, group + blurb
scripts/repo.mjs seed | render | add | check
docs/            published by GitHub Pages (main /docs)
  Packages, Packages.gz, Release   generated — do not edit
  downloads.json                   generated — latest version per package
  index.html                       generated between <!-- BEGIN/END --> markers
  pool/                            legacy .deb host (frozen)
ci/tweak-release.yml               caller to copy into a tweak repo
.github/workflows/publish.yml      ingest a release -> Packages + site
.github/workflows/publish-tweak.yml  reusable: build -> release -> dispatch
```

## how a release flows

1. A tweak repo builds its `.deb` and attaches it to a GitHub Release.
   Download counts come from GitHub's release asset counter.
2. It dispatches `package-release` at this repo with `repo`, `tag`, `group`.
3. `publish.yml` downloads the asset, hashes it, records it in `packages.json`,
   regenerates `Packages`/`Release`/`downloads.json`/`index.html`, commits.
4. Pages redeploys; Sileo sees the new version on its next refresh (≤ 5 min).

`Filename:` for new versions is the absolute release URL; legacy versions keep
their relative `pool/…` path.

## onboarding a tweak repo

Copy `ci/tweak-release.yml` to `<repo>/.github/workflows/release.yml`, set
`deb_glob` to that repo's package id, then:

```sh
gh secret set DISPATCH_TOKEN -R repos1tory/<repo>
# fine-grained PAT: Contents read+write on repos1tory/repos1tory.github.io
```

Release with `git tag v0.2.3 && git push --tags`, or run the workflow manually
with a tag. Without `DISPATCH_TOKEN` the release is still created; the site
step warns and skips.

## notes

- Theos repos build on `macos-14` with Theos installed by the workflow.
- On-device build scripts (SoundDeck, psychosis) use `build_command: "true"`
  and publish a `.deb` that is committed to the repo — build on the iPad, tag,
  push.
- Private source repos (`opencode-ios`) cannot serve public release assets;
  they keep using the `pool/` flow until the repo (or the assets) is public.
- `scripts/repo.mjs add --deb <file>` without `--url` puts the file in `pool/`
  and keeps the relative filename, i.e. the old manual flow.
