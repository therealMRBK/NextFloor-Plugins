## Plugin

- Name / id:
- What it does:
- Source repository:

## Checklist

- [ ] The plugin is one self-contained `.js` file (no imports, under 100 KB)
- [ ] `url` points at a file **pinned to a commit** (40 characters), not at a branch
- [ ] `sha256` is the hash of that file (`sha256sum plugin.js`)
- [ ] The code is readable (not minified or obfuscated) and uses the public API from `docs/plugins.md` only
- [ ] It does not call Home Assistant services, send data anywhere, or store anything in the browser, unless that is its purpose and the description says so
- [ ] `node scripts/validate.mjs` passes
