# Snippet Vault

Password-protected code snippet and prompt manager with syntax highlighting and tag-based organization.

## Features

- SHA-256 password lock screen
- Syntax highlighting for 14 languages
- Tag system with color-coded chips and multi-tag filtering
- Tap any card to copy to clipboard
- Pre-loaded with prompt templates

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Vercel

Push to GitHub, then import at [vercel.com/new](https://vercel.com/new). Zero config needed.

## Deploy to GitHub Pages

1. Uncomment `base` in `vite.config.js`
2. Install gh-pages: `npm i -D gh-pages`
3. Add to package.json scripts: `"deploy": "npm run build && gh-pages -d dist"`
4. Run: `npm run deploy`
5. In repo Settings → Pages, set source to `gh-pages` branch

## Storage

All data lives in localStorage — per-device, per-browser, no backend.
