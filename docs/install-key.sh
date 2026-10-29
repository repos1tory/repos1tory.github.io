#!/var/jb/bin/sh
# install-key.sh — trust the repos1tory APT signing key on a rootless jailbreak.
#
#   curl -fsSL https://repos1tory.github.io/install-key.sh -o /tmp/repos1tory-key.sh
#   sudo /var/jb/bin/sh /tmp/repos1tory-key.sh
#
# This only installs the public key into apt's trusted keyring. It does not
# install any package and does not disable signature checking.
set -eu

PREFIX="${PREFIX:-/var/jb}"
KEY_URL="${KEY_URL:-https://repos1tory.github.io/repos1tory.gpg}"
KEYRING="$PREFIX/etc/apt/trusted.gpg.d/repos1tory.gpg"

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "run as root: curl -fsSL https://repos1tory.github.io/install-key.sh -o /tmp/repos1tory-key.sh && sudo /var/jb/bin/sh /tmp/repos1tory-key.sh"
[ -d "$PREFIX/etc/apt" ] || fail "no apt config under $PREFIX (is this a rootless jailbreak?)"
command -v curl >/dev/null 2>&1 || fail "curl not found"

mkdir -p "$PREFIX/etc/apt/trusted.gpg.d"
tmp="$KEYRING.tmp.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
curl -fsSL "$KEY_URL" -o "$tmp"
chmod 644 "$tmp"
mv "$tmp" "$KEYRING"
trap - EXIT HUP INT TERM

echo "installed $KEYRING"
if command -v apt-get >/dev/null 2>&1; then
  # Update only repos1tory. A full `apt-get update` can fail because an
  # unrelated repo on the device is missing its own key (ElleKit/BigBoss on
  # this bootstrap), which should not make installing *this* key look failed.
  LIST="$(mktemp "${TMPDIR:-/tmp}/repos1tory-key.XXXXXX")"
  printf 'deb https://repos1tory.github.io/ ./\n' > "$LIST"
  trap 'rm -f "$LIST"' EXIT HUP INT TERM
  apt-get \
    -o "Dir::Etc::sourcelist=$LIST" \
    -o "Dir::Etc::sourceparts=-" \
    -o "Acquire::AllowInsecureRepositories=false" \
    update
  rm -f "$LIST"
  trap - EXIT HUP INT TERM
fi

echo ""
echo "Done. Existing sources that point at https://repos1tory.github.io/ will"
echo "now authenticate. To pin the key explicitly, use docs/repos1tory.sources."
