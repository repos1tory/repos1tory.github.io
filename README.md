# repos1tory

*things were made*

### [repos1tory.github.io](https://repos1tory.github.io/)

## layout

```
packages.json    source of truth: every package, every version, group + blurb
scripts/repo.mjs seed | render | add | check
scripts/sign-release.mjs      sign docs/Release -> InRelease + Release.gpg
scripts/verify-repo.mjs       verify signatures and every pool hash
scripts/generate-signing-key.mjs  create the signing key (private key stays outside the repo)
docs/            published by GitHub Pages (main /docs)
  Packages, Packages.gz, Release   generated — do not edit
  InRelease, Release.gpg           generated signatures — do not edit
  repos1tory.gpg, repos1tory.asc   public APT key
  install-key.sh, repos1tory.sources  client key/source helpers
  downloads.json                   generated — latest version per package
  index.html                       generated between <!-- BEGIN/END --> markers
  pool/                            .deb files served to APT/Sileo
ci/tweak-release.yml               caller to copy into a tweak repo
.github/workflows/publish.yml      ingest a release -> Packages + site
.github/workflows/publish-tweak.yml  reusable: build -> release -> dispatch
```

## how a release flows

1. A tweak repo builds its `.deb` and attaches it to a GitHub Release.
   Download counts come from GitHub's release asset counter.
2. It dispatches `package-release` at this repo with `repo`, `tag`, `group`.
3. `publish.yml` downloads and hashes the asset, mirrors it into `docs/pool/`,
   records both URLs in `packages.json`, regenerates the indexes, signs
   `Release`, and commits.
4. Pages redeploys; Sileo sees the new version on its next refresh (≤ 5 min).

`Filename:` is always a relative path into `pool/`. APT resolves it against the
repo host, so absolute GitHub Release URLs there would be incorrectly appended
to the repo URL. The web page still links to the GitHub Release asset for its
download counter.

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

## signing

APT verifies `InRelease` (preferred) or `Release.gpg` against
`docs/repos1tory.gpg`. Do not commit a private key, and do not publish an
unsigned index.

```sh
npm ci
node scripts/generate-signing-key.mjs   # once; private key -> ~/.config/repos1tory/
node scripts/repo.mjs render
node scripts/sign-release.mjs
sh scripts/verify-repo.sh
```

The private key path can be overridden with `APT_SIGNING_KEY_FILE`, or the
armored key can be supplied inline as `APT_SIGNING_KEY` (how CI does it):

```sh
gh secret set APT_SIGNING_KEY -R repos1tory/repos1tory.github.io \
  < ~/.config/repos1tory/apt-signing-key.asc
```

`publish.yml` runs `sign-release.mjs` after every ingest and fails the job if
the key secret is missing or the signature does not verify. Clients install the
public key once with `docs/install-key.sh`; existing sources then authenticate
without disabling signature checks.

## notes

- Theos repos build on `macos-14` with Theos installed by the workflow.
- On-device build scripts (SoundDeck, psychosis) use `build_command: "true"`
  and publish a `.deb` that is committed to the repo — build on the iPad, tag,
  push.
- Private source repos (`opencode-ios`) cannot serve public release assets;
  they keep using the `pool/` flow until the repo (or the assets) is public.
- `scripts/repo.mjs add --deb <file>` mirrors the file into `pool/`; `--url`
  keeps the GitHub Release as the visible download link while APT uses the
  relative pool path.
