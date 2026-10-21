# Lot Planner

Can these vehicles fit in this space?

A static web app with no login and nothing to install. Pick a place from a short list, and its aerial
photograph fills the screen at true scale, showing the space in its wider surroundings. Drag vehicles
from the palette at their real sizes, rotate them to match the space's actual orientation, and see
whether they fit.

## Status

Nothing is placed yet. The repository currently holds the design record, the spec, and the skeleton:
it type-checks, lints, formats, tests and deploys.

- The domain vocabulary is in [`GLOSSARY.md`](./GLOSSARY.md).
- The decisions and their reasons are in [`docs/adr/`](./docs/adr/).
- The spec is [issue #1](https://github.com/rrauenza/lotplanner/issues/1), and the work is broken
  into tickets beneath it.

## Working on it

Node 24 or later (see `.nvmrc`). Yarn is the installer and its lockfile is committed.

```sh
yarn install
yarn dev            # http://localhost:5173/lotplanner/
```

If `yarn` is not on your PATH — Node no longer bundles Corepack — `npx yarn@1.22.22 <script>` runs
the same thing, and `npm install --global yarn@1.22.22` fixes it properly.

| Script              | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `yarn dev`          | Dev server, with hot reload                                        |
| `yarn build`        | Production build into `dist/`                                      |
| `yarn preview`      | Serve the production build                                         |
| `yarn typecheck`    | `tsc --noEmit` for the app and for the config, plus `svelte-check` |
| `yarn lint`         | Type-aware ESLint                                                  |
| `yarn format`       | Prettier, writing                                                  |
| `yarn format:check` | Prettier, checking                                                 |
| `yarn test`         | Unit tests over the pure core (Vitest)                             |
| `yarn test:e2e`     | End-to-end tests in a real browser (Playwright)                    |

Git hooks run the same tools, so they call:

```sh
pre-commit install
```

There are two test seams. Unit tests cover the pure core, which has no DOM, network, storage, clock
or randomness. End-to-end tests drive real touch events in a real browser, because the interaction is
the riskiest surface and a pure core cannot test a gesture. Leaflet's own rendering, the storage
adapters, and the real network calls are deliberately untested.

Neither seam has much to chew on yet. The unit test currently only proves the runner is connected,
and the end-to-end test proves the built app is served from its subpath; both start earning their
keep with the first feature ticket.

**The base path is `/lotplanner/`,** because GitHub Pages serves this from a repository subpath. The
dev server and `yarn preview` both honour it, so a local run has the same shape as the deployment.

## Deployment

Pushing to `main` runs the checks, then publishes `dist/` to GitHub Pages.

One step cannot be automated: **Pages must be switched on once, by someone with repository admin** —
Settings, then Pages, then Source: **GitHub Actions**. The workflow's own token cannot enable it, so
until that is done the `deploy` job fails at `Configure Pages` while the `checks` job stays green.

## Licence

MIT. See [`LICENSE`](./LICENSE).
