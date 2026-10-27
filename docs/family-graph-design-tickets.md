# Family / Social Graph Viewer — Vertical Slices and Tickets

Source: [family-graph-design.md](./family-graph-design.md). Decision numbers (D1–D9) and question numbers (Q1–Q9) refer to that doc.

Each ticket is a **vertical slice**: it touches every layer it needs (API, data, layout, rendering, URL) and ends in something that can be shown working in the app. Slices build on each other in order. None of them is a layer on its own, such as "write all the layout code".

Working rules for every ticket (the usual milestone loop):

1. Before code: a short plan with the public interface and a numbered list of behaviours to test, approved by the owner.
2. TDD, one test at a time. Layout and ownership are pure functions, so most behaviour is tested without a browser.
3. Check it in the real app in Chrome, on desktop and phone widths, with **synthetic data only** (PRODUCT.md: real trees never appear in screenshots or demos).
4. Update this doc and the design doc when a decision changes.
5. Commit only when asked, on `dev`.

Every slice must meet the floor in PRODUCT.md: WCAG AA contrast in both Kiln themes, full keyboard use, visible focus, a read-only interface for viewers, and no contact details or notes on the canvas.

## Overview

| # | Slice | Demo when done |
|---|---|---|
| FG-1 | Tracer bullet: graph endpoint, `/map` route, root frame's family core | Open `/map` and see yourself with parents, partners, siblings and children |
| FG-2 | Camera and level of detail | Pinch or scroll to zoom; bubbles go from dot to avatar to name to card |
| FG-3 | Nested frames and the ownership walk | Zoom into a parent's slot and see grandparents, aunts and uncles; nobody appears twice |
| FG-4 | Deep zoom and the shareable focus URL | Zoom five levels deep smoothly; copy the URL and it reopens on that frame |
| FG-5 | Make centre | Make a cousin the centre; the canvas cross-fades and rebuilds around them |
| FG-6 | Social bands | Friends, coworkers and acquaintances sit in rings around the family core |
| FG-7 | Cross-frame chips | A `B(S) ↗` chip flies the camera to where B is drawn |
| FG-8 | Parent kinds and former partners (schema) | Mark a link as step-parent or a marriage as ended; the canvas shows it |
| FG-9 | Half-siblings and other couples | Half-siblings sit under their own couple's bar, labelled "half" |
| FG-10 | Crowded bands | 60 coworkers wrap into rows, then a "+N more" chip opens an overflow frame |
| FG-11 | Not connected tray | People with no path to the root are listed in a tray and can be opened |
| FG-12 | Hardening: scale, keyboard, motion, freshness | 1,000 synthetic people stay smooth; the canvas works fully by keyboard |
| FG-13 | The map replaces the person page's graph | A person's page shows the map centred on them; the page still scrolls normally |

Dependencies: FG-1 → FG-2 → FG-3 → FG-4. FG-5 to FG-7 and FG-11 need FG-3. FG-9 needs FG-8. FG-10 needs FG-6. FG-13 needs FG-6 (added later at the owner's request). FG-12 comes last.

---

## FG-1 Tracer bullet: graph endpoint, `/map` route, root frame's family core

**Why:** proves the whole path (one fetch, client-side layout, SVG rendering, routing and auth) with the smallest useful picture.

**Backend**
- `GET /api/trees/{id}/graph` behind `tree_for` ([access.py:39](../backend/relationtree/access.py)). Returns:
  - `people`: id, name, photo_url, birthday, relationship_category, is_me. No phone, email, address, notes or context.
  - `connections`: id, person_a, person_b, type.
  - One query for people and one for connections (assert the query count in the test). Reuse the loading in `graph.py` `_neighbours` where it fits.
- Regenerate `openapi.json` and `schema.d.ts` (`npm run gen:api`).

**Frontend**
- New route `/map` inside the authenticated layout, with a link in the app's navigation. Uses the current tree from `CurrentTreeProvider`.
- A `useTreeGraph(treeId)` TanStack Query hook. Stale time under 1 hour, because photo URLs expire.
- Root resolution (from the interview decisions):
  - `?root=<id>` when given and found in the tree;
  - otherwise the current member's "This is me" person;
  - otherwise a person picker with a one-click "This is me".
  - An unknown `?root=` shows a clear "not in this tree" message with the picker.
- A pure `familyCore(graph, rootId)` that returns the three rows (D6):
  - top: parents, with a couple bar when there are two;
  - middle: the person, current spouse(s), siblings. Siblings are the union of `SIBLING` links and shared parents, as plain siblings (full or half comes in FG-9);
  - bottom: children, grouped under the couple they belong to (derived from each child's two `PARENT` links; a child with one recorded parent goes under that parent alone).
- Render the root frame as SVG (React), fit to the viewport. No zoom yet. Each person gets a fixed-size slot (D5) with avatar and name, reusing `PersonAvatar`. Clicking a person opens their person page.
- Loading, error and "server is off" states, consistent with `ServerStatusBanner`.

**Tests**
- Endpoint: a member gets the tree; a non-member gets 404; contact fields and notes are absent; query count is fixed whatever the tree's size.
- `familyCore`: parents, spouse, explicit siblings, siblings from shared parents (no duplicates when both exist), children grouped by couple, a child with one recorded parent, a person with no family.
- Root resolution: `?root` wins, then "This is me", then the picker; an unknown id.

**Done when:** a synthetic tree's `/map` shows the root's family core, and a viewer sees the same read-only picture.

**Out of scope:** zoom, nesting, social links.

**Status: done.** Notes from building it:
- Connections come back as `ConnectionOut` (`person_a_id`, `person_b_id`), the same shape as `POST /api/connections`. The endpoint only touches photo storage for people who have a photo, so it works locally without R2, as the People list does.
- The graph query lives under the `['people']` key and refetches on every visit to `/map`, so edits made on a person page show when you come back.
- A child's group is the set of their recorded parents. A child with only the root recorded goes in a root-only group. The app doesn't guess the other parent.
- **Slots are plain SVG** (circle, clipped `<image>` over the initials, `<text>`, SVG `<a>`), not HTML in `<foreignObject>`, because `foreignObject` is slow and misplaced under transforms in Safari, which matters for FG-2's camera. (A screenshot hang first blamed on `foreignObject` turned out to be Chrome throttling a covered window.) `PersonAvatar` is therefore not reused on the canvas. A photo that fails to load leaves the initials showing.
- On a phone the whole frame fits, but names are about 9 px. FG-2's zoom and level of detail fix that.
- A sibling recorded only by an explicit `SIBLING` link hangs from the parents' line like the others. FG-9 separates full, half and plain siblings.

---

## FG-2 Camera and level of detail

**Why:** the canvas is a zoomable surface (D1). Level of detail is what keeps it legible and fast.

- Add `d3-zoom` (the one new dependency, Q3). Wheel, trackpad pinch, touch pinch and drag pan on the root frame's `<g>` transform. Double-click or double-tap zooms in on a point.
- A camera model kept outside React's render, applied with transforms. Clamp zoom so the root frame can't be lost off screen.
- Level of detail by a slot's size **on screen** (Q5):
  - under 12 px: coloured dot (colour by family or social group);
  - 12–40 px: avatar (photo or initials);
  - 40–120 px: avatar and name;
  - over 120 px: also birth year or age and last contacted, with **Open** and **Make centre** buttons (Make centre is wired in FG-5; until then it's hidden).
- A "Fit" control resets the camera to the root frame.
- Respect `prefers-reduced-motion` for any animated camera move.

**Tests**
- A pure `detailFor(screenSizePx)` at each threshold and its boundaries.
- The camera clamp keeps the root frame partly visible.

**Done when:** on a phone and on desktop you can pinch, scroll and drag, and each bubble shows the right detail as it grows.

**Status: done.** Notes from building it:
- Dependencies: `d3-zoom`, `d3-selection` and `d3-transition`. The last is already a dependency of d3-zoom, and is declared because the animated Fit imports it.
- **The card leaves out "last contacted"** (owner's decision). It shows the avatar, name, "Born 1982 · 44" and **Open**. The graph endpoint stays as FG-1 left it.
- Zoom range: half to 16 times the scale that fits the frame (`clampTransform`). FG-4 extends it. At least 64 px of the frame always stays on screen.
- The camera writes the transform onto the frame's `<g>` directly. React re-renders only when the level of detail changes, because every slot in a frame is the same size and so shares one level.
- Past 240 px on screen the card's contents stop growing (CSS variable `--map-card-scale`). The box keeps the slot's size, so lines still meet it.
- Dots use one colour until FG-6. A single 9-person frame fits too large to reach the dot and avatar levels, because zoom-out stops at half the fit size. Those levels are for FG-3's nested frames.
- Measured in Chrome on desktop (240 Hz monitor), zooming with one wheel event per frame for 3 s:
  - Desktop frame: 240 fps, slowest frame 4.3 ms.
  - Phone-sized canvas (360×640), switching between card and name 5 times: 240 fps, slowest frame 4.3 ms, no frame over 17 ms.
- Input checked:
  - Mouse: double-click (2× zoom), drag to pan.
  - Trackpad pinch (ctrl+wheel).
  - Touch, with touch support emulated: two-finger pinch (4× spread gives 4× zoom) and double-tap (2× zoom).
  - Fit, and a drag that ends on a card doesn't open it.
- Not checked: reduced motion (needs media emulation) and a real phone.

---

## FG-3 Nested frames and the ownership walk

**Why:** the core idea (D1, D2, D5, D7). Each person's slot holds their own frame, and each person is drawn exactly once.

- A pure `assignOwnership(graph, rootId)`: a breadth-first walk outward from the root. The **nearest frame wins**; at equal distance, **family links beat social links**; any remaining tie goes by birth date, then ID (D7). The result is deterministic and memoised per root.
- A pure `frameFor(graph, ownership, personId)`: that person's frame contains only the people they own. So A's parent P1 shows A's grandparents, aunts and uncles, but not A or A's siblings again (D2).
- Each frame is laid out at its natural size, then scaled to fit its slot (D5). A parent's layout never depends on a child's contents, so each frame's layout is memoised by `(root, personId)`.
- Lazy rendering: a slot draws its nested frame only when the slot's on-screen size passes the "opens into a frame" threshold from FG-2. Frames below that threshold aren't laid out at all.
- Only the family core is drawn in this slice. Social links still affect ownership, but social people aren't drawn until FG-6.

**Tests**
- Ownership: every person reachable from the root is owned exactly once; nearest frame wins; family beats social at equal distance; the tie-break is stable across runs and input orderings.
- D2's examples as fixtures: AA's frame (partners, children, no A or AA's siblings); B's frame (B's partner and children only); P1's frame (grandparents, aunts, uncles).
- Layout memoisation: changing a child frame's contents doesn't change its parent's layout.

**Done when:** zooming into a parent's slot shows their family, and a search of the rendered tree finds each person once.

**Status: done.** Notes from building it:
- `assignOwnership` walks out one ring of frames at a time.
  - Within a ring, owners claim people eldest first, then by id, and only a family claim can replace an earlier claim. That gives D7's order: nearest frame, then family over social, then birth date and id.
  - Family neighbours are the `familyCore` relatives. Social neighbours are friend, coworker, acquaintance and manager links in either direction.
- **A slot opens into its frame at 360 px** on screen, a fifth level `'frame'` in `detailFor`. A slot whose person owns no one stays a card. A frame's own centre slot never opens, because it's the same person.
- When a slot opens, its box stays drawn as the nested frame's border, so the outer frame's lines still visibly meet the person they lead to.
- `planRender(rootId, k, layoutOf)` says which frames are open at scale `k`, and the range of `k` that holds for. The canvas re-renders only when zoom leaves that range. Card size caps use a `--map-k` CSS variable, so they don't need a re-render either.
- `frameLayouts(graph, rootId)` lays each frame out on first use and reuses it. A frame's layout depends only on whom it owns, never on what's inside its slots.
- Social links count for ownership, but social people aren't drawn until FG-6. In the synthetic tree, 19 of 20 people are drawn; the friend is the exception.
- Measured in Chrome on desktop (240 Hz monitor), synthetic tree of 20 people, centred on Robin:
  - No one is drawn twice at fit (1 frame), partly zoomed (5 frames) or fully zoomed (6 frames).
  - Zooming in and out through the nested levels for 3 s: 231 fps, median frame 4.2 ms, slowest 12.5 ms (when frames open), none over 17 ms.
- Two levels deep works on desktop: Robin's frame, then Alan's, then Ida's frame with her husband and child.
- **On a phone, the 16× zoom limit reaches only one nested level.** At fit the root's slots are 62 px, so at full zoom a grandparent-level slot stays a card. FG-4's re-anchoring is what lifts the limit.

---

## FG-4 Deep zoom and the shareable focus URL

**Why:** nested scales compound (about 1/6 per level gives 1/7,776 at five levels). Without re-anchoring, floating-point error makes deep frames jitter.

- Store the camera **relative to the focused frame** and re-anchor when you zoom into a child frame or back out of it, so transform numbers stay near 1 at any depth (Q3).
- The focused frame is the deepest frame that fills most of the viewport.
- URL: `?root=<id>&focus=<personId>` (Q9). Update `focus` with `replaceState` while zooming. A shared link opens zoomed to fit that person's frame. An unknown `focus` falls back to the root frame.
- Breadcrumb of the frames above the focus (for example `Me › P1 › Grandma`). Each crumb zooms out to that frame.

**Tests**
- Re-anchoring: zooming in and out across five levels returns the same world position within a small tolerance.
- `focus` round trip: the camera's focus is written to the URL and restored from it.

**Done when:** five levels deep is as smooth and sharp as the root, and a copied URL reopens on the same frame at a different window size.

**Status: done.** Notes from building it:
- **Re-anchoring happens when drawing, not in d3's state.**
  - d3-zoom keeps the camera relative to the root, in JavaScript's double precision. It remembers the world point under the cursor or fingers for a whole drag or pinch, so swapping its coordinates mid-gesture would make the view jump.
  - The drawing is anchored two frames above the focus, with that frame's transform composed in JS (`anchoredTransform`). Five levels deep, the browser sees a scale of about 26–60 instead of the root's thousands. Higher ancestors are many screens wide and aren't drawn.
- **Focus:** the deepest open frame that contains the middle of the screen and covers at least half of it along its tighter axis (`focusedFrame`).
  - `?focus=` changes only when the focus does (`replaceState`), because browsers throttle frequent history updates.
  - An unknown `focus` opens the root; someone with no frame of their own opens their owner's frame.
- **Opening on a focus:** a shared link or breadcrumb fits the frame, then zooms in just past 360 px if fitting alone would leave its slot a card. Without that, a wide frame on a phone held sideways opened as a card. A sweep of screen sizes from 280 to 2,520 px in both orientations is in the tests.
- **Zoom limit (changed from the plan):** 16× the fit of the deepest frame open anywhere on screen, not only the focused one. With the focus-only limit, zooming toward a frame near the edge hit the limit before that frame reached the middle and became the focus.
- **The render plan skips off-screen slots** and is re-run on each zoom event. React re-renders only when `planKey` changes. This replaces FG-3's k-range, which couldn't account for panning.
- **Breadcrumb** at the top-left of the canvas. Each crumb animates out to that frame (instant with reduced motion). Under 640 px wide it shortens to `root › … › last two`.
- **Synthetic tree:** extended to 32 people, with four more generations above Gus, so Zeb's frame is five levels below Robin.
- **Measured in Chrome on desktop (240 Hz monitor):**
  - Zooming from Robin toward Zeb, the focus moved one level at a time: Alan, Gus, Ed, Abe, Zeb.
  - Zooming in and out at depth for 3 s, with the focus moving between Zeb and Alan: 212 fps, median frame 4.2 ms, 95th percentile 8.4 ms, slowest 16.7 ms.
  - Text and lines are sharp five levels down.
  - A reloaded `?focus=` link reopens fitted on Zeb's frame. After resizing the canvas to 360×640, 640×360 and 390×700, Zeb's frame was still open and in focus.
- **Not checked:** a real phone, and reduced motion.

---

## FG-5 Make centre

**Why:** choosing the root reshapes the whole layout (D2, D9).

- The card's **Make centre** action sets `?root=<id>` and clears `focus`. This is a history push, so Back returns to the previous root (Q9).
- Cross-fade between the old and new canvases (instant with reduced motion).
- The breadcrumb resets to the new root.

**Tests**
- Make centre writes the URL; Back restores the previous root and its focus.
- Ownership and layout are recomputed for the new root and reused from the cache when you go back.

**Done when:** making a cousin the centre rebuilds the tree around them, and Back returns.

**Status: done.** Notes from building it:
- **Make centre is a link.** A card's **Centre** button (accessible name "Make <name> the centre") links to `/map?root=<id>`, so it pushes history, drops `focus`, and opens in a new tab on ctrl/⌘-click. The root's own card shows only Open. On the person page's embedded map it opens the full map centred on that person.
- **Layouts are cached** per graph object and root (`mapModel`). TanStack Query keeps the graph object while the data is unchanged, so Back reuses the previous root's layout; a refetch with new data lays out again.
- **Cross-fade:** for 300 ms the old canvas stays underneath, fading out, while the new one fades in. The old canvas is `inert` and no longer writes the URL. With reduced motion the swap is instant.
- **Measured in Chrome:** making cousin Lou Kerr the centre rebuilt the map around Lou (parents Jay and Ida, Ida's frame opening onto Gus, Hilda and Alan). Sampled every 60 ms, the old map's opacity went 0.44, 0.12, 0.03, 0 while the new one went 0.56, 0.88, 0.97, 1, and the old map was gone by 380 ms. Back restored Robin with Ida in focus (breadcrumb Robin › Alan › Ida). With reduced motion one map was present 40 ms after Back.
- **Open question for FG-12:** at the smallest card size on a phone the Open and Centre buttons are 51 × 21 px, under a 44 px tap target. They grow to about 105 × 44 px as you zoom in.

---

## FG-6 Social bands

**Why:** the social circle is half the product (D3, D4, D6).

- Concentric rectangular bands around the family core: **Friends** inside, then **Coworkers**, then **Acquaintances**. Frames stay roughly square.
- `MANAGER` links (manager and report) go in the coworker band, as the ego graph's "Work" group already does ([graphLayout.ts:42](../frontend/src/components/graph/graphLayout.ts)).
- The `relationship_category` rule from the interview: when the root is the "This is me" person of one of the tree's **owners**, people whose category is FRIEND, COWORKER or ACQUAINTANCE and who have no connection to that person count as first-degree in the matching band. For any other root, only connections count. FAMILY and OTHER categories place nobody.
- Social people are full people (D4): their own slots open into frames with their family and their own circles, under the same ownership walk.
- Band labels visible at readable sizes, in Kiln's muted text, never orange (orange stays for the primary action).

**Tests**
- Band assignment for each connection type, including `MANAGER` in both directions.
- The category rule: applies for an owner's "me"; doesn't apply for an editor's "me" or any other root; people with a real connection aren't double-placed; FAMILY and OTHER place nobody.
- Ownership with social links: family wins at equal distance (already covered by FG-3, extended with drawn social people).

**Done when:** the root frame shows the three bands, and zooming into a friend shows the friend's own family.

**Status: done.** Notes from building it:
- **Backend:** the graph endpoint has `is_owner_me` on each person, true when one of the tree's owners marked them "This is me". It's one more query, still fixed whatever the tree's size. The category rule needs it because it applies around *any* owner's "me", and `is_me` only knows the viewer's.
- **Placement:**
  - `socialCircles` sorts friend, coworker, manager (both directions) and acquaintance links into bands, and says which coworkers are managers and which are reports.
  - With the category rule (only the root's frame, only when the root is an owner's "me"), people categorised Friend, Coworker or Acquaintance who have no link to the root at all join that band. Family and Other place nobody.
  - The ownership walk uses the same circles, so category-placed people are owned by the root.
- **Layout:**
  - Each non-empty band is a ring around what's inside it, with a row above, a row below and a column each side. It's filled in reading order: top row, columns, bottom row.
  - When a ring is full, it grows on its shorter side, which keeps the frame between 0.6 and 1.67 wide to high for 0–30 people per band.
  - The cap of 24 with "+N more" is FG-10.
- **Drawing:**
  - Rounded band outlines, with no lines to social people.
  - Band labels in muted text from card size up. At name size a label would be 5–15 px, too small to read.
  - Cards in the coworker band say "Manager" or "Report".
- **Dots stay one neutral colour (changed from FG-2).** Kiln has no group colours and orange is reserved for primary actions, so groups are told apart by band position and labels.
- **Measured in Chrome on desktop (240 Hz monitor),** synthetic tree of 41 people, centred on Robin, with 3 friends (one with a husband and child), 4 coworkers including a manager, a report and one placed by category, and an acquaintance:
  - Everyone drawn once.
  - Zooming into Gia opens her frame with her husband and child.
  - Zooming in and out for 3 s: 211 fps, slowest frame 16.7 ms once frames were laid out. The first pass, laying each frame out for the first time, had 3 frames over 17 ms (slowest 24.9 ms). Slots are memoised so opening a frame doesn't redraw the others.
- **Fitting on small screens (added at the owner's request).**
  - Bands make a frame several times wider than its family. A whole-frame fit on a 360 px phone gave 23 px slots, all initials; a desktop gets 75 px.
  - Each layout now lists `fitAreas`, largest first: the whole frame, the family with fewer and fewer bands, then the family alone. `fitFrame` uses the largest one whose slots reach the name level (40 px), and the family alone otherwise. Even family plus friends came to 39 px on that phone, which is why it falls back further.
  - Opening the map, Fit, shared `?focus=` links and breadcrumbs all use it.
  - Measured: the phone now opens on Robin's family at 62 px slots with names, with the bands running off the edges. The desktop is unchanged at 75 px.

---

## FG-13 The map replaces the person page's graph

**Why:** the owner wants one picture of a person's relationships, not two (added after FG-6, by the owner's request).

- In the person page's "Graph" section, replace the React Flow ego graph with an embedded map centred on that person (`root` = the person), loaded from the person's tree. Add an **Open full map** link to `/map?root=<id>`.
- **Embedded input, like an embedded Google Map:**
  - Plain scrolling and one-finger swipes scroll the page.
  - Ctrl/⌘ + scroll, trackpad pinch (which arrives as ctrl + wheel) and two-finger touch zoom and pan the map.
  - A short hint appears when you scroll over the map without Ctrl/⌘.
- The embedded map doesn't write `?focus=` to the person page's URL.
- Remove `EgoGraph`, `graphLayout` and its tests, `PersonNode`, `GroupLabelNode` and `LabeledEdge`, and the `@xyflow/react` dependency. Update the design doc, whose Q3 findings say React Flow stays on the person page.

**Tests**
- The embedded input filter: plain wheel is ignored, ctrl/⌘ + wheel zooms, one touch is ignored, two touches zoom, and mouse drag and double-click work.
- The person page shows the map centred on that person, and its link opens `/map?root=<id>`.

**Done when:** the person page shows the map instead of the old graph, the page still scrolls normally on desktop and phone, and React Flow is gone from the bundle.

---

## FG-7 Cross-frame chips

**Why:** a relationship to someone drawn in a different frame must still show, without lines crossing frames (D8).

- For each connection between people in different frames, draw a chip in the right place in the frame that doesn't own the other person. For example `B(S) ↗` in AA's coworker band when AA's coworker is B's spouse.
- Clicking or pressing Enter on a chip animates the camera to where that person is drawn, through the nearest shared ancestor frame, and updates `focus`.
- Chips take the same fixed slot size and level of detail rules as people, with a distinct shape so they're never confused with real slots.

**Tests**
- Chip generation: a cross-frame link yields exactly one chip in the right band; same-frame links yield none.
- The camera path goes through the nearest shared ancestor frame.

**Done when:** every connection a person has is visible from their frame, as a slot or as a chip, and every chip lands on the right person.

**Status: done.** Notes from building it:
- **Frames keep everyone.** `frameFor` lists all of a person's links, and `chips` marks the people another frame owns. Their slots take their usual place (a spouse chip beside the person, a coworker chip in the coworker band) with `chip: true`, and chips never open into frames.
- **Chips for the surrounding frame too (decision G):** Alan's frame shows his wife Beth and his children Robin and Cara as chips, so each frame is a complete picture of that person's family.
- **Who gets a frame (decision H):** anyone who owns someone, or who has a link the frame they sit in can't show, meaning a link to someone drawn in yet another frame who isn't that frame's centre. Known gap: a link between two people in the same frame (say, two of Robin's friends who are friends with each other) still doesn't show.
- **Where a chip lands (decision I):** the person's own frame if they have one, otherwise the frame that draws them (the same rule as `?focus=`). The camera goes out to the nearest shared frame, then in (`chipRoute`), 300 ms a leg; with reduced motion it jumps.
- **Look (decision J):** a dashed outline, the name with "↗", and at card size "In <name>'s family" or "At the centre". The whole chip is one button (click, Enter or Space), named "Beth Ash, spouse, drawn in Robin Ash's family".
- **Checked in Chrome** on the synthetic tree, with one link added for it (Fay COWORKER Hugo):
  - Fay's frame shows Robin as a chip in Friends and "Hugo Park ↗ In Gia Park's family" in Coworkers, the design doc's D8 example.
  - Enter on Hugo's chip flew out through Robin's frame and into Hugo's frame (Robin › Gia › Hugo), where Fay, Gia and Ola are chips.
  - With reduced motion the move was instant.
  - Smoothness wasn't measured: the Chrome window was covered, so animation frames ran at about 2 per second.

---

## FG-8 Parent kinds and former partners (schema)

**Why:** step-parents, adoptive parents and former partners are needed for blended families (D3, Q1 schema gaps).

**Backend**
- Migration adding optional fields to `Connection` ([models.py:149](../backend/relationtree/models.py)):
  - `parent_kind` on `PARENT` links: biological, adoptive or step; default biological;
  - `ended` on `SPOUSE` links: current or former; default current.
- Validation: each field is allowed only on its own type. Existing rows stay valid.
- The fields are returned by `/connections`, the graph endpoint, and accepted by create. Ask and "Add from a note" ignore them for now.

**Frontend**
- The Add connection dialog ([AddConnectionDialog.tsx](../frontend/src/components/connection/AddConnectionDialog.tsx)) shows a parent kind choice for parent links and a "former partner" checkbox for spouse links.
- The person page's connection list labels them ("Step-parent of", "Former spouse of").
- Canvas (Q8a): current partners sit right next to the person; former partners sit further out on alternating sides, earliest furthest away; their couple bars are dashed. "Earliest" means the eldest shared child's birthday, then name. Each couple's children sit under its own bar, and siblings go beyond the partners. Adoptive and step parents are labelled at card size.

**Tests**
- Migration keeps existing rows; the defaults are right; the wrong field on the wrong type is rejected.
- Partner ordering on the middle row with zero, one and several current and former partners.
- Children grouped under the right couple when one person has children with two partners.

**Done when:** you can mark a step-parent and an ended marriage in the dialog, and the canvas lays them out as Q8a describes.

**Status: done.** Notes from building it:
- **Schema (migration 0007):** `parent_kind` (nullable) and `ended` on `Connection`. Existing PARENT rows became biological in a data step before the check constraints were added. The constraints are: a PARENT link always has a kind, no other link has one, and only a SPOUSE link can be ended. `Connection.save()` fills in biological for any PARENT link made without a kind, so code that creates links through the ORM keeps working.
- **API:** create accepts both fields and returns 422 for a field on the wrong type. They're returned by create, `/people/{id}/connections` and the graph. `label` is unchanged ("Parent", "Spouse"), so Ask's search text doesn't change and nothing needs re-embedding (decision L).
- **Editing (decision M, changed by the owner):** `PATCH /connections/{id}` changes only `parent_kind` and `ended`. Fields left out stay as they are, a wrong field gets 422, and editors only. The person page's connection list has an edit button on parent and spouse rows.
- **Dialog:** a Kind select for Parent and a Former partner checkbox for Spouse. The sentence under the type follows them ("Sam Reed is the step-parent of Kit Moss").
- **Map:**
  - Middle row: current partners right next to the person, on the right (decision N). Former partners go further out, the most recent nearest, alternating left then right. Siblings sit beyond the left-hand former partners.
  - Former couple bars are dashed (changed to dotted for every ended couple in FG-9, at the owner's request). Child groups are ordered by their partner's position, so each couple's children hang on that couple's side.
  - Step-parents don't decide which couple a child belongs to, and they sit after the other parents, so the couple bar still joins the other two.
  - Cards label "Step-parent", "Step-child", "Adoptive parent", "Adopted child" and "Former partner", with the birth year (the card is too narrow for the age as well).
  - Step-siblings still show as siblings (decision P, FG-9).
- **Checked against the real thing:** migration 0007 ran on the local database. In Chrome on the synthetic tree:
  - Adding Lee Moss as Robin's spouse, then marking them former with the edit button, gave a "Former spouse" badge.
  - Adding Sam as Kit's step-parent through the Kind select gave Sam's page a "Step-child" badge and the API returned STEP.
  - Robin's map frame then read Cara, Dev, Lee, Robin, Sam along the middle row, with Kit under Robin and Lee on the left, Ivy and Jon under Robin and Sam on the right, and one dashed bar.
- **Not shown in that data:** a step label on a card. Kit has no frame of their own (their links all show in Robin's frame), and chips don't carry kind labels. The component test covers card labels.

---

## FG-9 Half-siblings and other couples

**Why:** half-siblings only make sense next to the couple they come from (Q8b).

- Full or half sibling is derived from shared parents when both children's parents are recorded. An explicit `SIBLING` link with no parent data stays a plain sibling.
- The top row shows a parent's other partner whenever that couple has children (for example a P1–P2 bar and a P2–P3 bar).
- Full siblings sit under P1–P2 next to the person; half-siblings sit under their own couple's bar, on that side, labelled "half" at card size.
- An other partner like P3 who isn't first-degree to the person is drawn as a **chip** at the end of the bar (FG-7), not as a slot. Their real slot stays in P2's frame (D2, D7).

**Tests**
- Full, half and plain siblings across the recorded parent combinations.
- P3 is a chip in the person's frame and a slot in P2's frame, never both as slots.

**Done when:** a synthetic blended family reads correctly at every zoom level.

**Status: done.** Notes from building it:
- **Who is full, half or plain (decisions Q, R, T):** siblings come from explicit links and from sharing a parent other than a step-parent. Adoptive parents count like biological ones.
  - When both children have two recorded parents, sharing both makes a full sibling and sharing one a half-sibling.
  - With less parent data it's a plain sibling, shown with the full ones.
  - A step-parent's other children aren't siblings unless they're explicitly linked; they show in the step-parent's frame.
- **`familyCore`** keeps full and plain siblings in `siblings`, and half-siblings in `half` groups: the shared parent, their other partner, and the children. `firstDegree(core)` lists a person's own family for ownership and frames. Half-siblings are first-degree; their other parent isn't.
- **Layout (decision S):**
  - The two parents sit centred over the person, with each parent's other partners at that parent's end of the top row and step-parents after them.
  - Half-siblings take the far ends of the middle row, beyond siblings and partners, each group hanging from its own couple's bar slightly above the full siblings' bar.
  - The other partner is never the person's to draw, so the FG-7 chip rule makes them a chip, and their slot stays where ownership puts them (the shared parent's frame when they're that parent's spouse).
  - Cards read "Half-sibling · 1975" (decision U).
- **Checked in Chrome** on the synthetic tree, with Beth given a former partner, Otto Brandt, and their daughter Hana (added on the local database through the shell):
  - Robin's frame reads Alan, Beth and Otto (a chip, "drawn in Beth Ash's family") on the top row, and Cara, Dev, Lee, Robin, Sam and Hana on the middle row, with Hana hanging from the Beth–Otto bar.
  - Hana's own frame is the mirror image: Otto, Beth and Alan on top, and Cara and Robin as half-sibling chips under Beth–Alan.
  - At card size Hana's card reads "Half-sibling · 1975".
  - On a 360 px map Robin's slots are 43 px, still names. That's down from 62 px in FG-6, because the family is wider now.
- **Ended couples are dotted everywhere (added at the owner's request).** Any couple recorded as former partners now has a dotted bar (round dots, `0.1 9`), in the same style wherever it shows: the person's former partner, their parents' bar, and a parent's bar with their other partner. `familyCore` gives `parents.ended` and each half group's `ended`, and lines carry `ended`, not `dashed`. Co-parents never linked as partners stay solid, since nothing says they ended. In Chrome, Robin's frame shows Robin–Lee and Beth–Otto dotted, and the dots read clearly at card size.

---

## FG-10 Crowded bands

**Why:** a band of 60 coworkers mustn't break the square frame or the fixed slot size (Q8c).

- A band, or the children row, wraps into extra rows so the frame stays roughly square. Slots keep their size (D5); the frame scales down a little in its parent.
- Past about 24 per band, the last slot becomes a **"+N more"** chip that zooms into an overflow sub-frame holding the rest, sorted by name.
- The overflow sub-frame takes part in `focus` and the breadcrumb like any frame.

**Tests**
- Wrapping keeps the frame's aspect ratio within bounds for 1 to 200 people per band.
- The cap: exactly 24 shown with "+N more" where N is right; the overflow frame holds the rest in name order.

**Done when:** a synthetic tree with 60 coworkers is legible and every coworker can be reached.

**Status: done.** Notes from building it:
- **Cap (decisions V, W):**
  - A band of more than 24 shows the first 23 in its usual order plus a "+N more" tile, so it stays at 24 slots.
  - The rest go to the band's overflow frame, sorted by name: a virtual frame with the id `<ownerId>~<band>` (decision X), laid out as a square grid.
  - Its people stay owned by the band's owner, so they're drawn there once and their own frames open from it.
  - The overflow frame has no cap of its own (decision Z).
- **Paths:** `framePath` steps through the overflow frame for anyone drawn in it, so chips, `?focus=` and shared links reach them. An overflow id in `?focus=` opens that frame. The breadcrumb names it "Coworkers (41 more)", and screen readers hear "Robin Ash's coworkers".
- **The tile:** shaped like a chip, with a dashed outline, "+41" where the avatar would be and "more coworkers" under it. It's one button (click, Enter or Space) that flies there, and zooming opens it like any frame.
- **Children (decision Y):** no cap. Rows wrap at max(6, √n), each couple's children stay together, and a wrapped group hangs its rows from a spine in the gap to its left. The frame stays within a 0.5–2 aspect ratio for 1 to 200 children and 1 to 200 per band.
- **Checked in Chrome** with 60 synthetic colleagues added to Robin on the local database (64 in the band with Wes, Mia, Ray and Tess):
  - The band shows 23 and "+41 more", and the frame stays square.
  - The tile flies to a 7 × 6 grid of the other 41, in name order, and reloading that URL reopens it.
  - Every coworker is reachable: 23 + 41.
- **Smoothness (fixed at the owner's request before committing):**
  - The first measurement, zooming toward the tile for 3 s with frames laid out, gave 64–87 fps with a 95th percentile of 29–33 ms and about 70 of 250 frames over 17 ms.
  - The slow frames changed no DOM. The cause was the camera writing a `--map-k` CSS variable on the `<svg>` every frame for the card cap: an inherited custom property, so every write restyled the whole canvas. Measured without those writes, the 95th percentile fell to 20.6 ms. `will-change: transform` made no clear difference.
  - Fix: MapCanvas keeps a list of the card content groups (`data-card-scale`) after each render, and on each camera move sets `style.transform` on the ones whose `cardContentScale` changed. `--map-k` and `cardScaleCss` are gone.
  - After the fix, toward the tile: 140–148 fps, 95th percentile 16.6–20.5 ms, 18–29 frames over 17 ms. Toward Robin in the same tree: 156 fps, 95th percentile 16.7 ms (it was 139 fps and 21 ms). The display idles at about 140 frames a second, so the map now keeps up with it.
  - Cards still cap: a 666 px slot's contents are scaled 0.36 and come out 210 px wide.
  - Left for FG-12: hiding all text would give 190 fps and a 12 ms 95th percentile, so dropping text below name size remains worth measuring.

---

## FG-11 Not connected tray

**Why:** people with no path to the root would otherwise vanish.

- A strip outside the root frame lists people with no path to the root, with a count.
- Clicking one opens their frame in the tray area and offers **Make centre**.
- For owners and editors, a **link to…** action goes to that person's page with the Add connection dialog open (no editing on the canvas, Q6). Viewers don't see it.
- After returning from the person page, the canvas refetches the graph so the new link shows.

**Tests**
- Unreachable detection for several components, including a lone person.
- The tray's count matches; "link to…" is hidden for viewers.
- Coming back from a person page refetches the graph.

**Done when:** a person you've just added with no connections appears in the tray, and linking them moves them onto the canvas.

**Status: done.** Notes from building it:
- **Who's listed:** `notConnected(graph, ownership)` (`lib/map/notConnected.ts`) is everyone the cached `mapModel` gives no frame, by name. Social links count as connections, and so does the category rule, but only when the root is an owner's "This is me". So from Cara, Tess (filed by category from Robin) is not connected.
- **The tray (decisions AA–AC):** `NotConnectedTray` is a panel under the map on /map only, titled "Not connected · N", with nothing at all when everyone is reached. Each person is a ghost button (avatar and name; pressed while previewed).
  - It shows the first 12 (about two rows on a laptop), then "Show all N". jsdom can't measure rows, so it's a fixed count, not two measured rows.
  - Clicking one shows an embedded MapCanvas rooted at them, 280 px tall, without moving the main map. Under it are **Make centre** (`/map?root=<id>`) and, for owners and editors, **Link to…**. The tray is keyed by root, so a new root closes the preview.
- **Link to… (AD):** it goes to `/people/<id>?connect=1`. PersonDetailPage reads `connect` once, opens AddConnectionDialog through a new `defaultOpen` prop, and removes the param with a replace, so reloading or going Back doesn't reopen it.
- **Freshness (AE):** `useCreateConnection` now invalidates `['people']` as well as `['connections']`, so the graph refetches straight away; the person page's own map redraws as soon as the link is saved. Returning to /map refetched already (`refetchOnMount: 'always'`), and a hook test with a real QueryClient now covers both.
- **Checked in Chrome** on the local synthetic tree, as map-viewer (centred on Cara):
  - With Pia Stone added with no links, the tray read "Not connected · 2" (Pia, Tess), and clicking Pia showed her preview.
  - As an editor, Link to… opened Pia's page with the dialog open and `connect` gone from the URL. After linking her to Robin as a friend, Back to /map showed "Not connected · 1".
  - As a viewer, the preview offered only Make centre.

---

## FG-12 Hardening: scale, keyboard, motion, freshness

**Why:** the canvas must meet the product's floor at the stated scale (Q4: under about 1,000 people and a few thousand connections).

- **Scale:** a synthetic fixture of 1,000 people and 3,000 connections (generated, never real). Measure the time for the first frame and the frame rate while zooming on desktop and on a mid-range phone; record the numbers here. Profile and fix the ownership walk and layout memoisation if they're slow.
- **Keyboard and screen readers:** Tab moves through the slots of the focused frame in reading order; Enter zooms into a slot; Escape zooms out to the parent frame; +/− and arrow keys zoom and pan. Each slot has an accessible name ("Ann Rivera, sister"). Focus is visible on every slot and chip.
- **Motion:** every animated move respects `prefers-reduced-motion`.
- **Freshness:** photo URLs never outlive their one-hour expiry (stale time, refetch on window focus); an expired photo falls back to initials.
- **Themes:** check AA contrast of dots, bands, bars and chips in both Kiln themes, and readability on a phone outdoors.

**Done when:** the measured numbers are recorded, the canvas can be used fully by keyboard, and a final review against the design doc finds no open gaps.

**Status: in progress.** Done in three parts: 12a scale, 12b keyboard and screen readers, 12c motion, freshness, themes and the final review (decisions BA–BF).

**12a scale, notes from building it:**
- **The fixture:** `seed_scale_tree --owner <user>` (backend) adds "Synthetic scale (1,000)": generations of couples and children (about 10% step or adoptive, 15% former partners, some second partners with half-siblings), then random friend, coworker, acquaintance and manager links up to 3,000. Every name is made up, it's the same on every run, and it skips the search embedding signals. `bigTree()` in `lib/map/testTree.ts` builds a tree of the same shape for tests.
- **The slow part:** every family-core and social-circle lookup scanned all 3,000 links, so the ownership walk did it about 1,000 times. `graphIndex(graph)` (`lib/map/graphIndex.ts`) now builds each person's links and a by-id map once per graph, cached in a WeakMap like `mapModel`. `scale.test.ts` pins ownership from five roots and everyone's family core and social circles on the 1,000-person tree; its snapshots were recorded on the old code and the new code matches them.
- **Measured in Node (vitest), 1,000 people and 3,000 links:**

  | | Before | After |
  |---|---|---|
  | Ownership walk | 381 ms | 15 ms (9.5 warm) |
  | Root frame's model and layout | 369 ms | 9.5 ms |
  | Laying out all 969 frames (the app does it lazily) | 447 ms | 88 ms |

- **Measured in Chrome, desktop (2560 px, a ~240 Hz display), Vite dev build:**
  - Making someone new the centre, to the first frame showing their family: 467–483 ms with one ~445 ms frozen frame before; 32–48 ms with no frame over 17 ms after. FG-10's first-open stutter (3 frames over 17 ms) is gone.
  - Zooming, one ctrl+wheel per frame for 3 s (in, then out) across card size and frame openings, after a warm-up: 215–229 fps, 95th percentile 4.3–8.3 ms, no frame over 17 ms.
- **Measured as a phone (decision BF):** Chrome DevTools at 4× CPU slowdown, the map panel 390 px wide, a production build (`vite build` and `vite preview` against a second local API). The GPU isn't slowed, so this is a CPU-only stand-in for a mid-range phone.
  - Zooming: 90–163 fps, 95th percentile 12.5–25 ms, the worst frame 29–67 ms. No long animation frame (50 ms or more) while zooming.
  - Making someone new the centre: 120–180 ms to the first frame, with three frames over 17 ms (the worst 46–58 ms) during the cross-fade.
  - The dev build's slow frames at level changes (60–120 ms) were mostly React's development build: about 42 ms of each was `react-dom` dev code.
- **Hiding text below name size: not done.** With all map text hidden, zooming at 4× slowdown went from 170 to 220 fps (95th percentile 12.5 to 4.3 ms). But only 9–46 text elements are drawn at any time, and only the names while zoomed far out are under 9 px. Hiding those would remove little, and no frame is slow because of them.
- **Phone-size card actions:** Open and Centre have an invisible hit area 54 × 48 units, which is at least 50 × 45 px at the smallest card (a 120 px slot). The visible button is unchanged.

**12b keyboard and screen readers, notes from building it:**
- **The Tab order:** the map itself is one stop, described for screen readers ("Tab moves through the people in view. Enter zooms into a person, Escape zooms out. Plus and minus zoom, and the arrow keys pan."). Then come the focused frame's people only, top row first and left to right, wherever the layout lists them: band people above the family come first. Every other frame's controls have `tabindex="-1"`, so the mouse still reaches them.
  - A frame opened inside the focused one keeps one stop, its centre, named by its place outside ("Alan Ash, parent"), and Enter on it zooms in.
- **People as buttons (BA):** someone with a frame of their own is a button that zooms into it: the whole slot below card size, the card's box at card size, with Open and Make centre still links on top. Anyone without a frame, and a frame's own centre, stays a link to their page. The mouse does the same as Enter.
- **Keys (BB), on the map or anything in it; Ctrl, ⌘ or Alt combinations are left to the browser:**
  - Enter or Space on a person zooms into their frame. Escape zooms out to the parent frame; at the root it isn't handled, so it reaches anything else listening.
  - + or = zooms in 1.5× about the middle, − or _ zooms out, and the arrows pan 15% of the view. Each moves for 150 ms, or at once with reduced motion. A key pressed during a move builds on where that move is heading, so two quick presses of + zoom 2.25× (measured in Chrome).
  - After Enter or Escape, keyboard focus moves to the new frame's centre (the slot itself, or the card's first stop), so Tab carries on there.
- **Keeping focus in view:** the focused frame only has to cover half the view, so Tab can land on someone off screen. The browser would then scroll the map's clipped panel; that scroll is undone and the camera pans instead (`panToShow`, 16 px margin). In Chrome, Otto's chip 542 px past the right edge came fully into view, and the panel's scroll stayed 0.
- **Focus rings:** slots, chips, card actions and "+N more" tiles already drew the `ring` colour as a stroke. The map itself had none (`outline: none`); it now has a 3 px outline just inside its edge, because the panel clips anything outside. At small sizes the 40%-opacity ring is faint; the 12c contrast check covers it.
