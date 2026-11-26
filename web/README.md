# web/

The web app: React 19 + Vite + TypeScript + Tailwind 4, with React Router and TanStack Query.
In Docker it is built once and served by nginx, which also proxies `/api` to the API
(see `nginx/default.conf`).

| Path | What it is |
|---|---|
| `src/features/scan/` | The scan flow: photo picker, preview with the model's square, result, "not sure", labels, Grad-CAM |
| `src/pages/` | Home, bin guide, model card, my scans, log in / sign up, 404 |
| `src/lib/recycling.ts` | How each bin is shown and how to prepare each item (the class → bin mapping itself comes from the model's `meta.json`) |
| `src/lib/api.ts` | Typed API client; every error becomes an `ApiError` with a `code` and a readable `message` |
| `src/components/` | Shared UI: shell and navigation, buttons, the photo with the crop box, probability bars |
| `src/tokens.css`, `src/base.css` | Design tokens (colours, the seven bin colours, faces, sizes, spacing) and base rules |
| `src/site.css` | Every component and page, written against the tokens (no literal colours, faces or spacing) |
| `src/styles.css` | Entry stylesheet: the design stamp, then the imports |
| `design.md` | The locked design system (Editorial theme): read it before adding a page |
| `public/captures/` | Screens of the app shown on the home page (see below) |

## Develop

Needs Node 22. Start the API on port 8000 first (see `api/README.md`); Vite proxies `/api` to it.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. Checks (the same as CI):

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

## Home page captures

The home page shows real screens of the app (`public/captures/`), not drawings of it. They were taken with a
stand-in model, so the numbers in them (for example "91% sure") are samples. Once the trained model is served,
retake them with two photos of your own, one the model is sure about and one it is not:

```bash
node scripts/capture-states.cjs path/to/sure-photo.jpg path/to/unsure-photo.jpg
```
