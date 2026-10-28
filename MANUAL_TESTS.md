# Manual regression checklist

The automated tests cover the API (pytest), the frontend's logic and its components (Vitest,
Testing Library on jsdom). This list covers what only a real browser and the real services
show. Re-run it by hand before merging `dev` → `main`.

## Account and people

- [ ] Sign in and sign out; the login screen has no sign-up (accounts come only from invite links)
- [ ] Create a person (all fields, then a minimal one with just name + category)
- [ ] Edit a person and confirm changes persist after reload
- [ ] Upload a photo, confirm it renders on the detail page, the list card and the map; replace it and confirm the old one is gone
- [ ] Delete a person with connections — confirm the confirmation dialog shows the correct count, and the connections are gone afterward (check the other person's detail page too, for orphans)
- [ ] Delete a person with no connections — confirm no count language appears
- [ ] Search the list by name
- [ ] Filter the list by category
- [ ] Confirm list sort order: a never-contacted person appears before one with an old `lastContactedDate`, which appears before one with a recent date

## Connections

- [ ] Add a **symmetric** connection (e.g. Friend) between two people — confirm both sides show the same label
- [ ] Add a **directional** connection (e.g. Parent) — confirm the other person's page shows the correct inverse (Child)
- [ ] Add a Parent link as step or adoptive, and a Spouse link as former: the labels say so on both pages; change the kind from the connection list
- [ ] Remove a connection from the connection list

## Sharing and invites

- [ ] Tree switcher: create a tree, switch between trees, and confirm the list, Ask, the map and "Add person" follow the selected tree (and it's remembered after a reload)
- [ ] Tree settings as an owner: rename; add a member by username (an unknown name shows an error); change their role; remove them; "Leave" as the only owner is refused
- [ ] As a viewer of a shared tree: no Add person, Delete, photo, connection or edit controls, and no "Link to…" on the map; "This is me" still works; Leave works
- [ ] Invite links (owner, tree settings): create one, Copy puts it on the clipboard, it's listed as pending; Revoke removes it and the link then says it's invalid
- [ ] Open an invite link signed out in a private window: create an account, land in the invited tree with the invite's role; the same link afterwards says it's invalid
- [ ] Open an invite link signed in (as someone not in the tree): "Join as …" adds the tree and switches to it; "Sign in" from a signed-out invite page comes back to the invite

## AI (needs Ollama)

- [ ] "Catch me up on …" on a person's page streams a summary; Regenerate writes a new one
- [ ] Ask about your people: a search question ("who do I know in finance?") lists matching people; with "This is me" set, a graph question ("how am I connected to …?") answers from your links
- [ ] Add from a note: a note naming someone new and someone existing proposes one new and one matched person plus the connection; edit a name, untick a note line, save; check both people's pages, the dated note, and that the toast's Open button works

## Family map

- [ ] `/map` opens centred on your "This is me", else on a picker whose "Centre here" works; an unknown `?root=` says the person isn't in the tree
- [ ] Zoom with the wheel or a pinch: people go from dots to avatars, names, then cards, and a person's own frame opens inside their slot; the breadcrumb names the frames above and jumps back to one; Fit returns to the whole map
- [ ] Make centre cross-fades to a map around that person; Back returns to the previous centre and frame; reloading a `?focus=` link reopens the same frame
- [ ] A chip (dashed outline, "↗") flies the camera to where that person is drawn
- [ ] A band of more than 24 shows "+N more", which opens the rest sorted by name
- [ ] Former partners' bars are dotted; half-siblings sit under their own couple, with the other parent as a chip
- [ ] Someone with no links appears under "Not connected · N"; clicking them shows a preview and Make centre; as an editor, "Link to…" opens their page with Add connection, and after linking they're on the map and gone from the tray
- [ ] Keyboard: Tab reaches the map, then the focused frame's people in reading order, each with a visible orange ring; Enter zooms in, Escape zooms out, + and − zoom, the arrows pan, and Tab keeps an off-screen person in view
- [ ] A person's page shows the map centred on them: plain scrolling moves the page and Ctrl/⌘ + scroll zooms the map; "Open full map" opens `/map` on them
- [ ] On a phone: one finger pans and two fingers zoom on `/map`; on a person's page one finger scrolls the page; the Open and Centre buttons on the smallest cards are easy to tap
- [ ] With "reduce motion" turned on in the OS, camera moves, Make centre and double-click zoom happen at once
