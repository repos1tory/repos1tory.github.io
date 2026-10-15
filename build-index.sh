#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
site="$root/docs"
cd "$site"

dpkg-scanpackages --multiversion pool /dev/null > Packages
gzip -n -9 < Packages > Packages.gz

{
  printf 'Origin: repos1tory\n'
  printf 'Label: repos1tory\n'
  printf 'Suite: ./\n'
  printf 'Codename: repos1tory\n'
  printf 'Date: %s\n' "$(date -Ru)"
  printf 'Architectures: iphoneos-arm64\n'
  printf 'Description: a minimal repository for jailbroken iOS\n'
  for section in MD5Sum SHA1 SHA256; do
    printf '%s:\n' "$section"
    for file in Packages Packages.gz; do
      size="$(wc -c < "$file" | tr -d ' ')"
      case "$section" in
        MD5Sum) sum="$(md5sum "$file" | cut -d ' ' -f 1)" ;;
        SHA1) sum="$(sha1sum "$file" | cut -d ' ' -f 1)" ;;
        SHA256) sum="$(sha256sum "$file" | cut -d ' ' -f 1)" ;;
      esac
      printf ' %s %s %s\n' "$sum" "$size" "$file"
    done
  done
} > Release
