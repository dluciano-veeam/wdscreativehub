# WDS LABS – Creative Hub

WDS Labs is a custom-built internal gallery to collect, review, and evolve UI/interaction POCs.

## Current functionality
- Left sidebar navigation (`Creative Hub`, `Competitive Analysis`, `Character Count`, `Who we are?` placeholders)
- Responsive POC gallery with:
  - Search
  - Tag filters
  - Masonry-style card layout
  - Hover emphasis on selected card
- POC detail page with:
  - Embedded live demo (`iframe`)
  - Breadcrumb + repeated sidebar
  - Dark source panels (`HTML`, `CSS`, `JS`)
  - Copy button per source panel
  - `Export ZIP` (downloads POC source package)
- Add/Edit POC flow (modal):
  - Brief-first form
  - Optional thumbnail upload
  - Optional ZIP upload (auto-detects `index.html` anywhere in the ZIP)
  - Optional HTML paste
  - Tags/description/title support
- Draft/pending workflow:
  - Draft items can be created with minimal fields
  - CLI scripts generate/apply pending items
- Static JSON-based storage (no database)
- GitHub Pages sync/deploy workflow via scripts

## Data and file structure
- POC metadata: `data/pocs.json`
- Public mirrored data: `public/data/pocs.json`, `docs/data/pocs.json`
- Uploaded assets: `public/assets/uploads/`
- Default/manual thumbnails: `public/assets/thumbnails/`
- ZIP-based POC projects: `public/pocs/<poc-id>/...`

## Scripts
- `npm run dev` – run local server
- `npm run pages:sync` – sync `public/` to `docs/` for GitHub Pages
- `npm run pages:deploy` – helper deploy flow
- `npm run pocs:pending` – list pending drafts
- `npm run pocs:generate` – export pending skeleton (`data/pocs.generated.json`)
- `npm run pocs:apply` – apply generated metadata/content
- `npm run pocs:autoprocess` – auto-fill pending drafts with inferred title/description/tags
- `npm run pocs:auto-watch` – watch/autoprocess loop
- `npm run pocs:normalize` – sanitize/normalize imported sources

## Local setup
```bash
npm install
npm run dev
```

Optional AI endpoint (`/api/ai/adapt`) requires `.env` based on `.env.example` with:
- `OPENAI_API_KEY`
- optionally `OPENAI_MODEL`
