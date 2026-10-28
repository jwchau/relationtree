# Load performance

Work on branch `perf/lcp-and-requests` (2026-10-28): the first page's content sooner, and fewer
repeated API calls. Decisions PA–PE were approved before building.

## How it was measured

A production build (`vite build`, `vite preview`) against a local API, in Chrome with DevTools
set to 4× CPU slowdown, "Fast 4G" network throttling (each request ~170–200 ms, close to the
Cloudflare tunnel's 70–130 ms plus connection setup) and "Disable cache", so every load is a
first visit. The before build is `dev` at cf6e743.

LCP alone misled here: the old person page painted "Loading..." in its `<h1>` while it waited,
and Chrome counted that as its largest paint, ahead of any real content. So the comparison is
the time each page's real content appeared (an observer added to the measurement builds only):
the first person row, the person's name, the first family frame.

## Before

- One 755 kB script (231 kB gzipped): the whole app, d3 and the map included, downloaded and run
  before the first API call could start.
- Every page waited for three API calls in a row, because nothing renders until
  `/api/auth/me` answers and each page's data waited on that or on the tree list:
  People list `me → trees → people`, person page `me → person → graph`, map `me → trees → graph`.
- The whole-tree graph (816 kB uncompressed for 1,000 people) was fetched on every visit to a map
  (`refetchOnMount: 'always'`, from FG-1, made unnecessary once edits invalidated it in FG-11 and
  12c), and the 30 s default stale time refetched every page on return and on tab focus.

## What changed

- **PA, startup prefetch** (`src/api/prefetch.ts`, called from `main.tsx`): the session, the
  trees and the opening page's data (from the URL and the remembered tree) are requested at once,
  into the same cache the hooks read. Hooks export their query options (`meQuery`,
  `treesQuery`, `personListQuery`, `personQuery`, `connectionsQuery`, `treeGraphQuery`) so both
  use the same keys.
- **PB, pages split** (`src/routes/lazy.ts`): the map, the person page, new person, tree settings
  and invites load on first use; the People list and login stay in the main bundle. A build
  plugin (`preloadOpeningPage` in `vite.config.ts`) inlines `lazyRouteFor`
  (`src/routes/routeChunks.ts`) into `index.html` right after the charset, so the opening page's
  chunks start loading alongside the main bundle. Without it they started only after the main
  bundle had run (1185 ms), and once placed after the stylesheet they waited for the CSS (756 ms);
  now they start with it.
- **PC:** the graph no longer refetches on every visit; edits refresh it, it goes stale after
  30 minutes and reloads every 45.
- **PD:** the default stale time is 5 minutes, not 30 s. Your own edits show at once; another
  member's edits to a shared tree show within 5 minutes or on reload.
- **PE:** `index.html` preconnects to the API (`crossorigin="use-credentials"`, as the app's
  requests send cookies), so the connection is set up while the code loads.

## Results

| | Before | After |
|---|---|---|
| Script loaded upfront | 755 kB (231 kB gzipped) | 501 kB (157 kB gzipped) |
| People list: first row | 2087–2143 ms | 1522–1569 ms |
| People list: LCP | 1888–1916 ms | 1472–1496 ms |
| Person page: name | 1827–1997 ms | 1806–1859 ms |
| Person page: its map | 2265–2420 ms | 1959–2012 ms |
| Map page: first frame | 2112–2248 ms | 1797–1998 ms |
| API calls in a 7-step walk* | 7 (graph 4 times) | 3 |

\* List → a person → back → the person again → their map → back → back, after the first load.

## Not done (measure before proposing)

- The People list sends every field for everyone: 389 kB for 1,000 people.
- Whether Cloudflare compresses API responses: look for `content-encoding` on `/graph` in DevTools.
