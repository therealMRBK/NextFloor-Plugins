# NextFloor Plugins

The plugin and furniture store of [NextFloor](https://github.com/therealMRBK/NextFloor), the 3D floor plan for Home Assistant.

Plugins add things NextFloor does not do itself: your own light animations, support for entities it does not know, and small cards in a room's panel. How to write one: [docs/plugins.md](https://github.com/therealMRBK/NextFloor/blob/main/docs/plugins.md).

## Community furniture

Furniture packs built by the community with the **[NextFloor furniture builder](https://therealmrbk.github.io/NextFloor/builder/)**: build furniture in your browser from boxes, cylinders, tapers and round bodies, see it exactly as NextFloor draws it, and save it as a pack.

- **Install:** in NextFloor open **Extensions → Community furniture** and press **Install**.
- **Share yours:** press **Share in the community store** in the builder. It opens the [furniture form](https://github.com/therealMRBK/NextFloor-Plugins/issues/new?template=furniture.yml) with your pack; send it. A check runs by itself with NextFloor's own import check and turns your pack into a pull request (`packs/<id>.json` and its entry under `packs` in `index.json`). If something is wrong, it says so on the issue; edit the issue and it runs again.
- **New version:** raise the pack's version in the builder and send it the same way. Only who first shared a pack can update it.
- Packs are data, not code: NextFloor checks every pack again when it imports it. Shared packs are published under the MIT licence.

## Plugins

## Using the store

In NextFloor open **Extensions → Plugins → Open plugin store** and press **Install**. That is all; the plugin is added to your plan and loads right away.

Every plugin listed here was looked at before it was added, and it cannot change afterwards: an entry points at a file **pinned to one commit** and carries that file's **SHA-256**. NextFloor downloads the file, checks the hash, and refuses to run it if it differs. A new version of a plugin is a new entry that goes through review again, and NextFloor then offers it as an update.

> A plugin still runs in your browser with the rights of NextFloor and Home Assistant's frontend. A review lowers the risk, it does not remove it. Install plugins from authors you trust.

## Submitting your plugin

1. Publish your plugin as **one self-contained `.js` file** in a public GitHub repository (no imports, under 100 KB, readable code, not minified).
2. Note the **commit** the file is in (`git rev-parse HEAD`) and its hash: `sha256sum plugin.js`.
3. Fork this repository and add an entry to [`index.json`](index.json):

   ```json
   {
     "id": "garage-door-plus",
     "name": "Garage Door Plus",
     "description": "One short sentence about what it does (max. 300 characters).",
     "author": "your-github-name",
     "version": "1.0.0",
     "homepage": "https://github.com/you/garage-door-plus",
     "url": "https://raw.githubusercontent.com/you/garage-door-plus/<40-character commit>/plugin.js",
     "sha256": "<hash of that file>"
   }
   ```

4. Run `node scripts/validate.mjs`. It checks the entry, downloads the file and compares the hash. The same check runs on the pull request.
5. Open a pull request. It is reviewed by hand and merged when the plugin does what it says.

To publish a new version, push the change to your repository and open a pull request that updates `version`, `url` and `sha256` of your entry.

### What the review looks at

- The code is readable and does what the description says, nothing more.
- It uses the public API only and registers through `window.NextFloor.register`.
- No data leaves the browser, no Home Assistant services are called and nothing is stored, unless that is the plugin's purpose and the description says so.
- No obfuscation, no `eval`, no loading of further scripts.

Plugins can be refused or removed at any time, for example when a problem turns up later. Removing an entry does not uninstall the plugin from plans that already use it; the person can remove it on the Extensions page.

## License

The index and scripts in this repository are MIT licensed. Every plugin keeps the license of its own repository.
