# Lot Planner

Can these vehicles fit in this space?

A static web app with no login and nothing to install. Pick a place from a short list, and its aerial
photograph fills the screen at true scale, showing the space in its wider surroundings. Drag vehicles
from the palette at their real sizes, rotate them to match the space's actual orientation, and see
whether they fit.

## Status

You can pick a place, see its photograph at true scale, drag a vehicle out of the palette onto it,
and drag it around. Tapping a vehicle opens a form on it: name, label, width, length and colour, and
correcting any of them corrects every copy of that vehicle at once. A selection also carries a handle
for turning it, which settles onto the angles of the space and of the vehicles already beside it, and
buttons to duplicate it or delete it. Undo and redo work over every one of those edits, by button or
by keyboard.

Vehicles come in collections, and the palette shows one at a time. The four the app ships with are
always there, in a collection that cannot be renamed, filled or deleted, so the palette is never
empty. Collections of your own are yours to make, name, fill with your actual fleet, correct a
vehicle in, remove one from, and throw away; they belong to the browser rather than to a place, so
they come with you from one site to the next. A collection that was received from somebody else says
whose it was, and importing one always makes a new collection rather than touching an existing one.

Under the photograph, a live count says how many of each vehicle are on the ground and warns when two
of them overlap; the overlapping pair are outlined on the picture as well. Opacity is one control for
all of them, so an overlap can be read through.

Work is saved as it is edited, with no save button anywhere, and a place keeps as many named Layouts
as you make for it: compare two options, come back to either, rename them, throw one away. A reload
returns you to the one you were last working on. If the browser will not keep anything — private
browsing, a full quota — the app says so and carries on in memory rather than refusing to start.

Work too large for a link is exported to a file and imported back. A file is legible JSON — open it and
read it — carrying the same version field a link does, so an old file keeps opening and a file from a
newer app is refused politely rather than misread. Importing a Layout adds it to that place's saved
work, beside whatever is already there; importing a Collection always makes a new one, never
overwriting yours.

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

Leaflet is not exempt from being _measured_, though, only from being tested: several end-to-end
assertions ask Leaflet where it drew something, using its own geometry as a ruler for the app's. That
is a check on the app's arithmetic against the photograph it asked for, not a test of the library.

**The base path is `/lotplanner/`,** because GitHub Pages serves this from a repository subpath. The
dev server and `yarn preview` both honour it, so a local run has the same shape as the deployment.

## Deployment

Pushing to `main` runs the checks, then publishes `dist/` to GitHub Pages.

One step cannot be automated: **Pages must be switched on once, by someone with repository admin** —
Settings, then Pages, then Source: **GitHub Actions**. The workflow's own token cannot enable it, so
until that is done the `deploy` job fails at `Configure Pages` while the `checks` job stays green.

## Licence

MIT. See [`LICENSE`](./LICENSE).
