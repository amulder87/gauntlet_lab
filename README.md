# Gauntlet Lab Web

Browser/TypeScript port of Gauntlet Lab. The app is fully client-side: simulations run in browser Web Workers and profiles/settings are stored in `localStorage`. There is no backend and no account/login requirement.

## What is included

- Profiles editor, including automatic `Clone` synchronization from `Me` at 90% move speed.
- Generic T0-T11 profiles and the same static factory defaults as the desktop app.
- Experiment tab with manual simulation and exhaustive fixed-role optimization.
- Three-stage optimizer: pre-screen -> screen -> finalist runs, with batched progress updates.
- Automatic browser worker pool based on `navigator.hardwareConcurrency`.
- Hidden Game Model editor available from the File menu.
- Session result history using `Results 1`, `Results 2`, etc., with a shared/resizable result splitter.
- Autosaved profiles, experiment settings, model settings, and UI preferences in browser `localStorage`.
- Fast deterministic production PRNG so a seed remains reproducible without carrying CPython's slower RNG into the release bundle.

## Build

The project has no runtime dependencies. TypeScript is only needed to build it.

```bash
npm install
npm run build
```

The static site is written to `dist/`. It can be hosted on any normal static web host (GitHub Pages, Cloudflare Pages, Netlify, an ordinary web server, etc.).

The existing `build.sh` and `build.cmd` are also provided for environments where `tsc` is already on PATH.

## Running locally

The site should be served over HTTP rather than opened directly as `file://`, because browsers restrict Web Workers and fetches from local files. One simple option from the repository root is:

```bash
python -m http.server 8000 --directory dist
```

then open `http://localhost:8000`.

## Configuration storage

The shipped `public/gauntlet_lab_config.default.json` is the immutable factory config. The browser copies its defaults into local storage on first use, then autosaves the user's current state under the site's origin. Clearing browser site data resets that local state; `File -> Restore factory defaults` does the same intentionally.

No profile or simulation data is sent to a server by the app.

## Reference/parity testing

The Python desktop engine remains the behavioral reference. The browser port has two RNG paths during development:

1. **Production:** a fast deterministic SplitMix32 stream used by the built website.
2. **Test-only:** a CPython-compatible Mersenne Twister in `tests/python_random_reference.ts`.

The CPython-compatible mode is not included in `dist/`. It exists solely to prove that the TypeScript simulation rules match the Python engine seed-for-seed.

Current parity checks show:

- Enemy health/attack/defense test points: exact match.
- A complete seeded raid: exact match for wave, duration, XP, and death reason.
- 100 seeded Monte Carlo runs: exact distribution and exact aggregate metrics.
- Optimizer unique-assignment enumeration: exact match (201 candidates for the default Me + four identical Clone setup).
- Fast production RNG vs reference RNG, 5,000 runs per scenario:
  - T0 default: mean-wave difference -0.030; XP/hour +0.025%.
  - all-T3 `2H/1D/2M`: mean-wave difference +0.010; XP/hour +0.046%.
  - all-T10 balanced: identical tested outcome metrics.
  - mixed tiers: mean-wave difference -0.016; XP/hour -0.060%.

The fast RNG was roughly 2.1x-3.5x faster than the CPython-compatible RNG in full simulation benchmarks in this environment.

## Project layout

- `src/core.ts` - data types, config helpers, fast seeded RNG.
- `src/engine.ts` - production loops, combat, XP, and Monte Carlo aggregation.
- `src/optimizer.ts` - candidate enumeration/filtering/objectives.
- `src/worker.ts` - browser Web Worker execution.
- `src/app.ts` - browser UI, localStorage, result tabs, worker orchestration.
- `public/` - HTML/CSS/factory config.
- `tests/` - Python-reference RNG and parity/statistical probes.
- `dist/` - generated static site.

## Current model defaults

The web port intentionally mirrors the desktop v0.5 defaults, including 255 px fortress-node paths, 100 px gather-processing paths, 425 incoming mitigation constant, 600 outgoing constant, enemy-first combat, discrete deposits, global wave timing/stacking, per-role double-gather, and no processing-failure resource save.
