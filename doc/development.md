# Developing Kairos

[← Product overview](../README.md) · [中文介绍](../README.zh-CN.md)

Kairos is a Manifest V3 Chrome extension built with Vite and CRXJS. The video overlay uses Shadow DOM; notes are stored locally in IndexedDB.

## Build and load

```sh
pnpm install
pnpm run build
```

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Choose **Load unpacked** and select `dist/`, not the repository root.
3. After rebuilding, reload the extension and refresh open video pages.

Use `pnpm run dev` for development with hot reload.

## Source map

- `src/content/`: video interaction, island and note overlays.
- `src/background.js`: background service worker and AI requests.
- `src/dashboard.html`, `src/dashboard.js`: notes and settings.
- `src/popup.html`: extension popup.
- `manifest.json`, `vite.config.js`: permissions and build configuration.
- `test/`: regression checks and browser fixtures.

## Verification

Run the relevant suite with `node test/<name>.mjs`. Browser tests use an isolated Chrome profile and mocked AI responses; they do not verify paid provider calls. Test native fullscreen, platform playback and authenticated courses manually where fixtures cannot reproduce the real environment.

## Chrome Web Store package

```sh
pnpm run build
python3 scripts/package-store.py
```

The script creates a versioned package under `release/`. Packaging does not upload or submit the extension for review. Follow the script output for the current artifact name.

## Website and public sharing

- [Website development and deployment](../website/README.md)
- [Share-page hosting setup](share-pages-setup.md): Supabase and hosting configuration for optional public links.
