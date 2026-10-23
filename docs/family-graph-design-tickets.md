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

Dependencies: FG-1 → FG-2 → FG-3 → FG-4. FG-5 to FG-7 and FG-11 need FG-3. FG-9 needs FG-8. FG-10 needs FG-6. FG-12 comes last.

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

---

## FG-12 Hardening: scale, keyboard, motion, freshness

**Why:** the canvas must meet the product's floor at the stated scale (Q4: under about 1,000 people and a few thousand connections).

- **Scale:** a synthetic fixture of 1,000 people and 3,000 connections (generated, never real). Measure the time for the first frame and the frame rate while zooming on desktop and on a mid-range phone; record the numbers here. Profile and fix the ownership walk and layout memoisation if they're slow.
- **Keyboard and screen readers:** Tab moves through the slots of the focused frame in reading order; Enter zooms into a slot; Escape zooms out to the parent frame; +/− and arrow keys zoom and pan. Each slot has an accessible name ("Ann Rivera, sister"). Focus is visible on every slot and chip.
- **Motion:** every animated move respects `prefers-reduced-motion`.
- **Freshness:** photo URLs never outlive their one-hour expiry (stale time, refetch on window focus); an expired photo falls back to initials.
- **Themes:** check AA contrast of dots, bands, bars and chips in both Kiln themes, and readability on a phone outdoors.

**Done when:** the measured numbers are recorded, the canvas can be used fully by keyboard, and a final review against the design doc finds no open gaps.
