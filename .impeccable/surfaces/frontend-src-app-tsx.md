---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/routes"]
---

# Surface brief: RelationTree app (all authenticated screens, sign-in, invite)

Scope: every screen of the web app (app shell, People list with Ask, person detail with catch-up, connections and graph, Add person, tree settings, sign-in, invite page, dialogs, toasts). Mode: Operate.

Audience and job: the owner (and a few invited family and friends) finding someone before getting in touch, adding people after meeting them, asking questions about connections. Phone and desk, dark and light rooms.

Constraints: features, copy and behavior unchanged; Kiln (DESIGN.md, pinned by the owner 2026-10-20) applied at working scale; no marketing-sized type; list density must not drop; orange only for the one primary action per view. Dark default, Kiln light grounds under prefers-color-scheme: light.

Unresolved: none.

## Direction contract

THESIS: RelationTree as a warm kiln-lit workbench: an ink band names the page, and one dense roster of people sits below it. It refuses the stock shadcn grid of same-size cards and neutral grey chrome.

OWN-WORLD: Kiln at app scale, after the Tournament Tracker precedent. Ink app bar and page bands; charcoal surface gradient; panel-gradient cards with a 16px radius and the elevation-3 hairline ring; square fields with a 1px heavy edge and an ember focus ring; ghost buttons 48px tall with a 12px radius in DM Sans; one ember gradient button per view with a dark-brown Manrope label. Unbounded for names and section heads; Inter as the working face. Amber marks "you" and nothing else. The brand is an ember tile holding a three-node mark.

STORY: open the app, see the tree and the people you have been out of touch with longest, ask a question or add someone, open a person and get caught up before you call.

FIRST VIEWPORT: on the People page, the sticky ink app bar (brand, tree switcher, account) sits above an ink band with the ember glow, holding "People" in Unbounded 28/32 (32/36 from 768px), "{tree} · N people" in band-muted, Add from a note (ghost) and Add person (the ember primary) at its right. Under it come the Ask field as a full-width 56px bar, a row of category chips plus the name filter, and then the roster: one panel list of 56px rows (monogram or photo, name, how you know them, category chip, last talked).

FORM: pinned world (owner-supplied DESIGN.md, "Kiln"), so no concept roll was run; the composition follows Kiln's as-shipped app grammar. Seed key: none (pinned).

Signature interaction: the roster row. Its hover fill and the ember focus ring move together; "last talked" reads in words ("4 months ago", "never"), with stale contacts tinted toward the accent.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
