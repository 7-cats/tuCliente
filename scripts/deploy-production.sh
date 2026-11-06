#!/usr/bin/env bash
set -Eeuo pipefail
: "${GITHUB_SHA:?Run through GitHub Actions}"
ROOT=/home/tomas/dockers/tucliente
SITE="$ROOT/site"
BASE=https://tucliente.sevencats.com.ar
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
test -s dist/index.html
test -d "$SITE"
# Keep backups outside the served directory. Serialize even manual invocations.
exec 9>"$ROOT/.deploy.lock"
flock -w 60 9
mkdir -p "$ROOT/backups"
BACKUP=$(mktemp -d "$ROOT/backups/release-XXXXXXXX")
rsync -a "$SITE/" "$BACKUP/"
PROBE=$(mktemp)
rollback() {
  rc=${1:-1}
  trap - ERR INT TERM
  printf 'Deploy failed; restoring previous static release\n' >&2
  rsync -a --delete "$BACKUP/" "$SITE/"
  chmod 755 "$SITE"
  rm -f "$PROBE"
  exit "$rc"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
# Explicit modes avoid private checkout permissions causing nginx 403.
rsync -a --delete --chmod=D755,F644 dist/ "$SITE/"
printf '%s\n' "$GITHUB_SHA" > "$SITE/deploy-revision.txt"
chmod 644 "$SITE/deploy-revision.txt"
curl --connect-timeout 10 --max-time 25 --retry-max-time 60 --fail --silent --show-error --retry 2 --retry-all-errors --retry-delay 2 \
  -H 'Host: tucliente.sevencats.com.ar' http://127.0.0.1/ -o "$PROBE"
cmp dist/index.html "$PROBE"
curl --connect-timeout 10 --max-time 25 --retry-max-time 60 --fail --silent --show-error --retry 2 --retry-all-errors --retry-delay 2 "$BASE/health"
curl --connect-timeout 10 --max-time 25 --retry-max-time 60 --fail --silent --show-error --retry 2 --retry-all-errors --retry-delay 2 \
  "$BASE/deploy-revision.txt?release=$GITHUB_SHA" -o "$PROBE"
test "$(tr -d '\n' < "$PROBE")" = "$GITHUB_SHA"
curl --connect-timeout 10 --max-time 25 --retry-max-time 60 --fail --silent --show-error --retry 2 --retry-all-errors --retry-delay 2 \
  "$BASE/?release=$GITHUB_SHA" -o "$PROBE"
# CDN may inject scripts into HTML; verify the actual build's JS/CSS references.
python3 - "$PROBE" "$BASE" <<'PY'
import pathlib, re, subprocess, sys
html = pathlib.Path('dist/index.html').read_text()
public = pathlib.Path(sys.argv[1]).read_text()
assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
assert assets, 'No generated assets'
for asset in assets:
    assert asset in public, f'Missing deployed asset: {asset}'
    body = subprocess.check_output(['curl', '--connect-timeout', '10', '--max-time', '25', '--retry-max-time', '60', '--fail', '--silent', '--show-error', '--retry', '2', sys.argv[2] + asset])
    assert body == pathlib.Path('dist' + asset).read_bytes(), f'Asset mismatch: {asset}'
print('Public HTML references and asset bytes verified')
PY
trap - ERR INT TERM
rm -f "$PROBE"
printf 'Repository: https://github.com/7-cats/tuCliente\nCommit: %s\n' "$GITHUB_SHA" > "$ROOT/RELEASE"
printf 'Published %s; backup: %s\n' "$GITHUB_SHA" "$BACKUP"
