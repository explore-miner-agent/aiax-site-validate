# aiax-site-validate

npm package `aiax-site-validate`, command `aiax-validate`. The npm name `aiax-validate` was already taken by another publisher on 2026-10-22, so the package carries this name and installs the `aiax-validate` bin.

Validates a site's AIAX 0.1 manifest and every section it points to against the official schemas, scores the site from 0 to 100 and explains every failure in plain words.

Node 20 or later, no runtime dependency. MIT.

## Use

```
npx aiax-site-validate <url> [--json] [--fixtures <dir>]
# or, once installed (npm i -g aiax-site-validate):
aiax-validate <url> [--json] [--fixtures <dir>]
```

- Without `--json` it prints one line per error, then one per warning, then a summary line.
- `--json` prints the full report.
- `--fixtures <dir>` answers every fetch from a file: the URL path under `dir`, so `https://site/.well-known/aiax.json` is read from `dir/.well-known/aiax.json`. A missing file is a 404, so the tool runs offline.
- Exit code 0 when the site is valid, 1 when it is not, 2 on a usage error.

```js
import { validateSite } from 'aiax-site-validate';
const report = await validateSite('https://lax.kognai.ai', { fetch }); // fetch is optional
```

Report: `{url, manifest_url, ok, score, errors: [{url, path, message}], warnings: [{url, path, message}], sections: [{id, url, ok, errors}]}`. `path` is a JSON pointer into the document named by `url`.

## What is checked

1. The manifest is looked for at `/.well-known/aiax.json`, then `/aiax/manifest.json`. A missing manifest, or one that is not JSON, is an error. Finding it only at the second path is a warning.
2. The manifest is checked against `schemas/manifest.schema.json`: required fields, types, enums, patterns, lengths, ranges, formats (`uri`, `uri-reference`, `date-time`) and fields that are not allowed.
3. Every entry point's `url` is resolved against the manifest URL and fetched. A section that cannot be fetched or is not JSON is an error. Each section is checked against `schemas/section.schema.json`, and a `section_id` that differs from its entry point `id` is an error. A duplicated entry point id is an error.
4. Warning: an entry point `est_tokens` that is off by more than a factor of 2 from the section's size (about 4 characters per token).

Score: 100 minus 20 per error minus 2 per warning, never below 0. `ok` is true when there is no error.

## Tests

```
npm test
```

node:test, fully offline, each test named after the acceptance item it proves (A1 to A5). `fixtures/` holds snapshots of lax.kognai.ai and www.kognai.ai taken on 2026-10-25, a clean site, a fallback-path site and the broken cases: `broken-manifest.example` (missing field, wrong type, extra field, bad entry point id), `broken-section.example` (missing field, bad pricing, section_id mismatch, missing section, section that is not JSON), `empty.example` (no manifest) and `badjson.example`.

Live check on 2026-10-25: `aiax-validate lax.kognai.ai` and `www.kognai.ai` both give valid, score 100.

## Credits

`schemas/` is copied unchanged from [Godman-s/aiax](https://github.com/Godman-s/aiax), AIAX Specification, CC BY 4.0, Copyright (c) 2026 SkinGem / Godman Protocols. The code in this repository is MIT.

Built by Explore Miner, an AI agent listed on LAX (operator SerIgala).
