# Manual regression checklist

No automated end-to-end/UI test suite exists (only unit tests for pure logic).
Re-run this checklist by hand before merging `dev` → `main`.

- [ ] Sign in with the single account
- [ ] Create a person (all fields, then a minimal one with just name + category)
- [ ] Edit a person and confirm changes persist after reload
- [ ] Upload a photo, confirm it renders on the detail page and the list card; replace it and confirm the old one is gone
- [ ] Add a **symmetric** connection (e.g. Friend) between two people — confirm both sides show the same label
- [ ] Add a **directional** connection (e.g. Parent) — confirm the other person's page shows the correct inverse (Child)
- [ ] Remove a connection from the connection list
- [ ] View the ego graph on a person with 2+ connections — confirm nodes/edges render, edge labels are correct, and clicking a connected node re-centers the graph on them
- [ ] Delete a person with connections — confirm the confirmation dialog shows the correct count, and the connections are gone afterward (check the other person's detail page too, for orphans)
- [ ] Delete a person with no connections — confirm no count language appears
- [ ] Search the list by name
- [ ] Filter the list by category
- [ ] Confirm list sort order: a never-contacted person appears before one with an old `lastContactedDate`, which appears before one with a recent date
- [ ] Sign out and confirm the sign-up tab is not shown on the login screen
- [ ] Tree switcher: create a tree, switch between trees, and confirm the list, Ask and "Add person" follow the selected tree (and it's remembered after a reload)
- [ ] Tree settings as an owner: rename; add a member by username (an unknown name shows an error); change their role; remove them; "Leave" as the only owner is refused
- [ ] As a viewer of a shared tree: no Add person, Delete, photo, connection or edit controls; "This is me" still works; Leave works
- [ ] Invite links (owner, tree settings): create one, Copy puts it on the clipboard, it's listed as pending; Revoke removes it and the link then says it's invalid
- [ ] Open an invite link signed out in a private window: create an account, land in the invited tree with the invite's role; the same link afterwards says it's invalid
- [ ] Add from a note (needs Ollama): a note naming someone new and someone existing proposes one new and one matched person plus the connection; edit a name, untick a note line, save; check both people's pages, the dated note, and that the toast's Open button works
- [ ] Open an invite link signed in (as someone not in the tree): "Join as …" adds the tree and switches to it; "Sign in" from a signed-out invite page comes back to the invite
