#!/bin/bash
set -euo pipefail
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SITE_URL=https://woyatablo.com
export NODE_OPTIONS=--max-old-space-size=768
# TypeScript 7 runs a native Go process alongside Next during production builds.
export GOMEMLIMIT=384MiB
export GOMAXPROCS=1
# Compatibility for the reviewed Linux test dependency until upstream records it.
# Keep approval scoped to the exact package version; do not allow all scripts.
python3 - <<'PY'
from pathlib import Path
import json
p = Path('pnpm-workspace.yaml')
s = p.read_text()
entry = "  '@embedded-postgres/linux-x64': set this to true or false"
package = json.loads(Path('package.json').read_text())
native = package.get('devDependencies', {}).get('embedded-postgres')
if native and (entry in s or "'@embedded-postgres/linux-x64':" not in s):
    assert package['devDependencies']['embedded-postgres'] == '18.4.0-beta.17', 'Review new native dependency version before approval'
    approved = "  '@embedded-postgres/linux-x64': true"
    if entry in s:
        s = s.replace(entry, approved)
    else:
        assert s.count('allowBuilds:\n') == 1, 'Unexpected workspace format'
        s = s.replace('allowBuilds:\n', 'allowBuilds:\n' + approved + '\n')
    p.write_text(s)
PY
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:admin
pnpm test:pricing
pnpm test:artwork
pnpm test:crop
for suite in test:payments test:legal test:customer test:customer:email; do
  if node -e 'process.exit(Object.hasOwn(require("./package.json").scripts, process.argv[1]) ? 0 : 1)' "$suite"; then
    pnpm run "$suite"
  fi
done
# Webpack's build worker releases compiler memory before Next's type check.
pnpm build --webpack
# This suite uses a disposable PGlite database and temporary upload directory.
pnpm test:admin:http
for suite in test:payments:http test:customer:http; do
  if node -e 'process.exit(Object.hasOwn(require("./package.json").scripts, process.argv[1]) ? 0 : 1)' "$suite"; then
    pnpm run "$suite"
  fi
done
touch .verified
