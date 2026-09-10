#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRAWLER_DIRECTIVES="noindex, nofollow, noarchive, nosnippet, noimageindex"

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -F -- "$expected" "$REPO_ROOT/$file" >/dev/null; then
    echo "$file is missing: $expected" >&2
    exit 1
  fi
}

robots_file="$REPO_ROOT/frontend/public/robots.txt"
if [ ! -f "$robots_file" ]; then
  echo "frontend/public/robots.txt is missing" >&2
  exit 1
fi

if [ "$(<"$robots_file")" != $'User-agent: *\nDisallow: /' ]; then
  echo "frontend/public/robots.txt must contain only the default-deny policy" >&2
  exit 1
fi

if [ -e "$REPO_ROOT/frontend/public/sitemap.xml" ]; then
  echo "private-by-default frontend must not ship sitemap.xml" >&2
  exit 1
fi

assert_contains frontend/index.html "name=\"robots\" content=\"$CRAWLER_DIRECTIVES, nocache\""
assert_contains frontend/nginx.conf "add_header X-Robots-Tag \"$CRAWLER_DIRECTIVES\" always;"
assert_contains frontend/nginx.conf "location = /sw.js"
assert_contains frontend/nginx.conf "default_type application/manifest+json;"
assert_contains render.yaml "name: X-Robots-Tag"
assert_contains render.yaml "value: $CRAWLER_DIRECTIVES"
assert_contains render.yaml "path: /sw.js"
assert_contains render.yaml "path: /manifest.json"

echo "Privacy and crawler policy checks passed"
