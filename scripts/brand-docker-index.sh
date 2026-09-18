#!/usr/bin/env bash
# Copy the running image's SPA shell and stamp APP_TITLE into the first paint.
# The official image still assigns document.title = 'LibreChat' before
# /api/config returns, so the injected script intercepts that write.
# Re-run after `docker compose pull`.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONTAINER="${LIBRECHAT_CONTAINER:-LibreChat}"
TITLE="${APP_TITLE:-RakaAI}"
OUT="${ROOT_DIR}/client/dist/index.html"
MANIFEST_OUT="${ROOT_DIR}/client/dist/manifest.webmanifest"

mkdir -p "$(dirname "$OUT")"
docker cp "${CONTAINER}:/app/client/dist/index.html" "$OUT"
docker cp "${CONTAINER}:/app/client/dist/manifest.webmanifest" "$MANIFEST_OUT"

python3 - "$OUT" "$MANIFEST_OUT" "$TITLE" <<'PY'
from pathlib import Path
import json
import sys

path = Path(sys.argv[1])
manifest_path = Path(sys.argv[2])
title = sys.argv[3]
html = path.read_text()
html = html.replace(
    'content="LibreChat - An open source chat application with support for multiple AI models"',
    f'content="{title} - A local chat application with support for multiple AI models"',
)
script = f'''<title>{title}</title>
    <script>
      (function () {{
        var FALLBACK = {title!r};
        var LEGACY = 'LibreChat';
        function preferred() {{
          try {{
            var stored = localStorage.getItem('appTitle');
            if (stored && stored !== LEGACY) {{
              return stored;
            }}
          }} catch (e) {{}}
          return FALLBACK;
        }}
        function brand(value) {{
          if (value == null || value === '' || value === LEGACY) {{
            return preferred();
          }}
          if (typeof value === 'string' && /\\| LibreChat$/.test(value)) {{
            return value.replace(/\\| LibreChat$/, '| ' + preferred());
          }}
          return value;
        }}
        try {{
          if (localStorage.getItem('appTitle') === LEGACY) {{
            localStorage.removeItem('appTitle');
          }}
        }} catch (e) {{}}
        var desc =
          Object.getOwnPropertyDescriptor(Document.prototype, 'title') ||
          Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'title');
        if (desc && desc.get && desc.set) {{
          Object.defineProperty(document, 'title', {{
            configurable: true,
            enumerable: desc.enumerable,
            get: function () {{
              return desc.get.call(this);
            }},
            set: function (value) {{
              desc.set.call(this, brand(value));
            }},
          }});
        }}
        document.title = preferred();
      }})();
    </script>'''
html = html.replace('<title>LibreChat</title>', script)
if f'<title>{title}</title>' not in html:
    raise SystemExit(f'Could not stamp <title>{title}</title> into {path}')
path.write_text(html)
manifest = json.loads(manifest_path.read_text())
manifest['name'] = title
manifest['short_name'] = title
manifest_path.write_text(json.dumps(manifest, separators=(',', ':')))
print(f'Wrote {path}')
print(f'Wrote {manifest_path}')
PY
