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
| `src/styles.css` | Design tokens: colours (the Malaysian bin colours), fonts, shadows |

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
