# Family / Social Graph Viewer — Design Decisions (handoff)

Status: design interview in progress. Sections 1–8 are **decided**. Section 9 lists **open questions**. The receiving session should answer them by looking at the existing relationships app and its repo, and ask the user only about the ones the code can't answer.

Update (2026-10-22): every open question is now settled, either from the code ("Findings from the relationtree repo") or by the user ("Interview decisions"). Implementation hasn't started.

Inspiration: Prezi zoomable canvas (https://prezi.com/fugumlghvxoy/malmaison--hotel-du-vin-prezi-design).

## Concept

The diagram starts from one person, the **root**. Their frame shows their first-degree connections. Every other person drawn in that frame has a smaller frame of their own, nested in their slot, showing *their* first-degree connections. You zoom into a frame to explore it.

## Decided

1. **Navigation: nested zoom (Prezi-style).** A child frame is physically inside its parent frame at a smaller scale. The camera zooms or pans into it. Detail is drawn according to zoom level (level of detail): a frame only renders its contents once it's big enough on screen to read.

2. **No duplicates: each person appears exactly once.** A nested frame only shows connections that aren't already drawn further out. The canvas is a *tree of frames* that expands outward from the root, so the layout depends on which person is the root.
   - Example: AA's frame (AA is a child of A) shows AA's partner(s), AA's children and AA's social circles. It doesn't show A or AA's siblings again.
   - Example: B's frame (B is A's sibling) shows only B's partner and B's children.
   - Upward relatives work the same way. A's parent P1 has a slot in A's frame, and P1's frame shows A's grandparents, aunts and uncles.

3. **Relationship types that count as first-degree:**
   - Parent / child, typed as **biological, adoptive or step**, so half-siblings and blended families come out right.
   - Sibling, worked out from shared parents (full or half).
   - **Partner / spouse**, both current and **former**. Children belong to a specific couple.
   - **Social circles:** friend, coworker, acquaintance.

4. **Social contacts are full people.** They're real person records that can have their own frame (with their own family and social circles). Their frames are **computed and rendered on demand** when zoomed into, because the social graph can grow without limit.

5. **Frame sizing: a fixed slot, scaled to fit.** Every person in a frame gets a box of the same size. Their nested frame is laid out at its natural size and then shrunk to fit that box. A parent's layout never depends on what's inside a child frame, so each frame can be laid out on its own, cached and loaded lazily.

6. **Layout inside a frame**
   - The family core is in the middle:
     - top row: parents (joined by a couple bar);
     - middle row: the person, their partner(s) and siblings;
     - bottom row: children, grouped under the couple they belong to.
   - Social circles are **concentric rectangular bands** around the core. Closeness is distance: **Friends** (inner), **Coworkers**, **Acquaintances** (outer). Frames are roughly square.

   ```
   ┌───────────── Acq ─────────────┐
   │ ┌────────── Co ────────────┐  │
   │ │ ┌─────── F ──────────┐   │  │
   │ │ │   P1 ─┬─ P2        │   │  │
   │ │ │  B  [A]─A(S)  C    │   │  │
   │ │ │    ┌─┴──┬───┐     │   │  │
   │ │ │   AA  AA2  AA3    │   │  │
   │ │ └───────────────────┘   │  │
   │ └─────────────────────────┘  │
   └──────────────────────────────┘
   ```

7. **Ownership: which frame draws a person who could appear in more than one.** Walk outward from the root one level at a time, and the **nearest frame wins**. At equal distance, **family links beat social ones**. Any remaining tie goes by a fixed sort (birth date, then ID). The result is the same every time, so it can be cached.

8. **Relationships between people in different frames:** each one appears as a **chip** in the right place (for example `B(S) ↗` in AA's coworker band). Clicking the chip animates the camera to where that person is actually drawn. No lines cross frame boundaries. (Built in FG-7: chips also stand for people drawn in the surrounding frame, so every frame shows its person's whole family.)

9. **Root selection:** the canvas opens on a default root (the user, or the dataset's owner). The root is kept in the URL (`?root=<id>`) so views can be shared. Every person has a **"Make centre"** action that rebuilds the canvas around them with a cross-fade (the old canvas is inert while it fades out, FG-5). Ordinary browsing is still just zooming.

## Open questions (resolve against the existing app and repo)

1. **Data source.** The user already has another app that tracks these relationships. How does it expose them: an API, a direct database read, or an export? What does the schema look like (person fields, relationship table, IDs)? How do its relationship types map onto those in decision 3, and are any missing (parent subtype, former partner, the three social tiers)?
2. **Integration.** Should the viewer be a feature inside the existing app, using its stack, routing and auth, or a standalone app that reads its data?
3. **Rendering technology.** Choose between SVG (simplest, accessible, fine for roughly a few thousand visible nodes thanks to level-of-detail rendering), Canvas, or WebGL. Choose zoom and pan tooling (for example d3-zoom, or a custom camera). Prefer whatever the existing app's frontend stack makes natural.
4. **Scale.** Typical and worst-case counts of people and relationships. This sets the level-of-detail zoom thresholds, how many frames can be laid out ahead of time, and the caching strategy.
5. **Node content.** What a person bubble shows at each zoom level: initials, then name, then photo and dates.
6. **Editing.** Read-only viewer, or can you edit and add relationships from the canvas (writing back to the existing app)?
7. **Privacy.** Social-circle data is sensitive. Who can see which parts of the graph? Does the existing app already have a permission model to reuse?
8. **Layout details still undecided:**
   - several current and former partners on the middle row;
   - placing half-siblings relative to the parent couples they share;
   - what to do when a band has too many people for its slot (paging, a "+N more" chip, or scaling).
9. **Platform.** Is mobile or touch (pinch-zoom) required? Should the URL keep the exact camera position as well as the root?

## Findings from the relationtree repo

The "existing app" is this repo, RelationTree. What the code settles:

### Q1 Data source: answered

- **How it's exposed:** a REST API (Django + Django Ninja, mounted at `/api/`) with cookie session auth (`django_auth`) on Postgres ([api.py](../backend/relationtree/api.py)). There is no export endpoint; the backups are database dumps, not an API.
  - `GET /api/people?tree=<id>` returns every person in one tree, unpaginated ([people_api.py:101](../backend/relationtree/people_api.py)).
  - `GET /api/people/{id}/connections` returns one person's connections, labelled from that person's side ([connections_api.py:73](../backend/relationtree/connections_api.py)).
  - Nothing returns a whole tree's connections in one call. `graph.py` already loads them in one query for the Ask agent (`_neighbours`, [graph.py:16](../backend/relationtree/graph.py)), so a read endpoint for the viewer is cheap to add.
- **Everything is scoped to a tree.** A person belongs to one tree, and a connection can only join two people in the same tree ([connections_api.py:53](../backend/relationtree/connections_api.py)). So the viewer shows one tree at a time.
- **Person** ([models.py:73](../backend/relationtree/models.py)): UUID `id`, `tree`, `name`, `relationship_category` (FAMILY, FRIEND, COWORKER, ACQUAINTANCE, OTHER, or null), `context`, `phone`, `email`, `address`, `birthday` (nullable date), `photo_key` (served as a presigned R2 `photo_url` valid for 1 hour, [photos.py:22](../backend/relationtree/photos.py)), `notes`, `last_contacted_date`, timestamps. `relationship_category` is how the tree's owner knows that person. It is not a link between two people.
- **"This is me"** is stored per tree member (`TreeMembership.me`, [models.py:34](../backend/relationtree/models.py)), so each member of a shared tree can have their own default root.
- **Connection** ([models.py:149](../backend/relationtree/models.py)): UUID `id`, `tree`, `person_a`, `person_b`, `type`. It reads "person_a is `type` of person_b". Symmetric types are stored with the lower UUID first, and `(a, b, type)` is unique ([relationships.py:13](../backend/relationtree/relationships.py)). A connection has **no other attributes**: no subtype, status or dates.
- **Mapping onto decision 3:**

  | Decision 3 | RelationTree today | Gap |
  |---|---|---|
  | Parent / child (biological, adoptive, step) | `PARENT` (directional) | **No subtype.** Every parent link is untyped. |
  | Sibling, derived from shared parents (full / half) | `SIBLING`, stored explicitly | Siblings are recorded directly, often without parents. Full/half can only be derived when both children's parents are recorded. |
  | Partner / spouse, current and former | `SPOUSE` (symmetric) | **No "former" and no unmarried partner.** |
  | Children belong to a couple | Derivable: a child's two `PARENT` links name the couple | None, as long as both parents are recorded. |
  | Friend / coworker / acquaintance | `FRIEND`, `COWORKER`, `ACQUAINTANCE` | None. |
  | (not in decision 3) | `MANAGER` (directional: manager / report) | Belongs in the coworker band. The existing ego graph already groups Manager, Coworker and Report as "Work" ([graphLayout.ts:42](../frontend/src/components/graph/graphLayout.ts)). |

### Q3 Rendering technology: partly answered

The frontend is React 19, Vite, TypeScript, Tailwind v4, shadcn/ui (Radix) and TanStack Query, with React Flow (`@xyflow/react` 12) for the existing per-person ego graph ([package.json](../frontend/package.json); `EgoGraph.tsx`, since removed in FG-13). React Flow has one flat viewport transform with a zoom range, absolute node positions, and sub-flows that don't scale their children. Nested frames compound in scale (about 1/6 per level gives 1/7,776 after five levels), which doesn't fit that model. The decision is in the interview below.

### Q4 Scale: not in the code

There's no seed data or fixtures. Tests build graphs of a handful of people, and the Ask eval uses 15 synthetic people ([docs/backend-migration-plan.md](./backend-migration-plan.md), M14). Real data is only in the owner's private trees.

### Q5 Node content: fields available

`name`, `photo_url` (the app's `PersonAvatar` falls back to initials, [PersonAvatar.tsx](../frontend/src/components/person/PersonAvatar.tsx)), `birthday`, `relationship_category`, `last_contacted_date`, `is_me`. Contact details (phone, email, address) are kept out of AI prompts ([graph.py](../backend/relationtree/graph.py), [PRODUCT.md](../PRODUCT.md)).

### Q6 Editing: the permission split exists

Roles are owner, editor and viewer. Only owners and editors can write ([access.py:17](../backend/relationtree/access.py)), and viewers get a read-only UI ([PRODUCT.md](../PRODUCT.md)). The create and delete endpoints for people and connections already exist. Whether the canvas edits is decided below.

### Q7 Privacy: there is a model to reuse

`TreeMembership` is the single source of truth for permissions ([models.py:18](../backend/relationtree/models.py), [access.py](../backend/relationtree/access.py)). The **tree is the privacy boundary**: any member sees every person and connection in the tree, and records outside your trees return 404 so their IDs don't leak (`people_visible_to`, [access.py:59](../backend/relationtree/access.py)). There's no visibility rule per person, per connection or per field.

### Q9 Platform: touch is required

The app is "used on a desktop at a desk and on a phone, sometimes outdoors" ([PRODUCT.md](../PRODUCT.md)), so pinch-zoom and touch panning are required. Whether the URL keeps the camera position is decided below.

## Interview decisions

Questions the code couldn't settle, recorded as the user decides them.

- **Q2 Integration: a route inside RelationTree.** For example `/map?root=<id>`. It reuses session auth, the current tree and tree switcher, the TanStack Query hooks, Kiln styling and the person pages. No second deploy and no CORS.
- **Q1 Schema gaps: add optional fields to `Connection`.** `parent_kind` on `PARENT` links (biological, adoptive or step; default biological) and `ended` on `SPOUSE` links (current or former), both set in the existing Add connection dialog. Existing rows stay valid. Ask and "Add from a note" can ignore the fields at first.
- **Siblings: the union of explicit links and shared parents.** Anyone with a `SIBLING` link or a shared parent is a sibling. Full or half comes from shared parents when both children's parents are recorded. An explicit link with no parent data shows as a plain sibling.
- **Default root: the member's "This is me" person, else a picker.** With no `?root=`, the canvas opens on the current member's `TreeMembership.me` in this tree. If they haven't marked anyone, it shows a person picker with a one-click "This is me" option, so the default is set once and reused.
- **`relationship_category` places people only around an owner's "me".** When the root is the "This is me" person of one of the tree's owners, people whose category is FRIEND, COWORKER or ACQUAINTANCE and who have no `Connection` to that person count as first-degree in the matching band. For any other root, only `Connection`s count. FAMILY and OTHER categories without a link place nobody. (The category records how the owner knows someone, so it means nothing from anyone else's point of view.)
- **Unreachable people go in a "Not connected" tray.** People with no path to the root sit in a strip outside the root frame, with a count. Clicking one opens their frame and offers "Make centre". For owners and editors there's also a quick "link to…" action.
- **Q4 Scale: hundreds of people per tree.** Under about 1,000 people and a few thousand connections per tree, now and for the foreseeable future.
- **Loading: fetch the whole tree once and lay it out in the browser.** A new read endpoint, `GET /api/trees/{id}/graph`, returns the tree's people (id, name, photo_url, birthday, relationship_category, is_me; no contact details or notes) and all its connections, one query each, behind the same membership check (`tree_for`). The ownership walk (decision 7) and frame layouts run client-side and are memoised per root and frame, so decision 4's "on demand" means laying out lazily, not fetching lazily. Photo URLs expire after an hour, so the query's stale time must stay under that.
- **Q3 Rendering: SVG rendered by React, with our own camera.** Frames are nested `<g transform>` groups. The camera is stored relative to the focused frame and re-anchored as you zoom in, so the numbers stay near 1 at any depth. d3-zoom (one new dependency) handles wheel, pinch and drag. It stays accessible and can be styled with Kiln CSS. React Flow first stayed on the person page's ego graph; FG-13 replaced that graph with an embedded map and removed React Flow.
- **Q5 Node content, by the slot's size on screen:** under 12 px, a coloured dot; 12–40 px, the avatar (photo or initials); 40–120 px, avatar and name; over 120 px, also birth year or age and last contacted, with Open and Make centre actions. Past that, the slot opens into the person's own frame. Contact details and notes never appear on the canvas.
- **Q6 Editing: v1 is read-only and links out.** A card's Open action goes to the person page, where editing already works, and the canvas refetches when you come back. Editing on the canvas can come later and would use the same endpoints. Until then, the "Not connected" tray's "link to…" action is the person page's Add connection, not an editor on the canvas.
- **Q7 Privacy: reuse tree membership.** The viewer shows a member exactly what the People list and person pages already show them, so the tree is the boundary. Anything private belongs in a separate tree. There's no new permission model.
- **Q8a Several partners: current partners closest, former partners further out.** Current partners sit right next to the person. Former partners sit further out on alternating sides, with the earliest relationship furthest away, and their couple bars are dashed. Each couple's children sit under that couple's bar, and siblings go beyond the partners. `ended` has no dates, so "earliest" means the eldest shared child's birthday, then name.
- **Q8b Half-siblings: grouped under the couple they come from.** The top row shows a parent's other partner whenever that couple has children (for example a P1–P2 bar and a P2–P3 bar). Full siblings sit under P1–P2 next to the person, and half-siblings sit under their own couple's bar, on that side. At card size they're labelled "half". To keep decisions 2 and 7 intact, an other partner like P3 who isn't first-degree to the person is drawn as a **chip** at the end of the bar (decision 8), not as a full slot. Their real slot stays in P2's frame.
- **Q8c Crowded bands: wrap, then "+N more".** A band (or the children row) wraps into extra rows so the frame stays roughly square. Slots keep their one fixed size (decision 5), and the whole frame just scales down a little in its parent. Past a cap of about 24 per band, the last slot becomes a "+N more" chip that zooms into an overflow sub-frame holding the rest, sorted by name.
- **Q9 URL: the root and the focused frame.** `?root=<id>&focus=<personId>`. A shared link opens zoomed to fit that person's frame, which works across screen sizes and survives edits to the data. The URL updates with `replaceState` while you zoom, so history isn't flooded, and Back returns to the previous root. Touch and pinch-zoom are required (see the findings above).
