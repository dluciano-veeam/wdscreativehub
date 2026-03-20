# Veeam Creative Hub (POC Gallery)

A lightweight gallery for UI POCs with tag filtering, in-browser previews, and AI-assisted styling.

## Features
- Gallery grid with tag filters and search
- Detail view with embedded demo (`iframe`)
- JSON file storage (no DB required)
- AI-assisted code adaptation to a Veeam-like look & feel
- One-click thumbnail generation from the preview

## Running locally

```bash
npm install
npm run dev
```

Create a `.env` file based on `.env.example` and add your OpenAI API key.

## Notes
- POCs are stored in `data/pocs.json`.
- Thumbnails are stored as base64 strings in the JSON file.
- The preview `iframe` uses `sandbox="allow-scripts allow-same-origin"` so the app can capture thumbnails.
# wdscreativehub
