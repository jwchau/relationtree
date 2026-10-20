"""Free-text extraction measurement against the real local model, through the same code as
/api/extract. Not part of the test suite (the file name doesn't match test_*.py); run explicitly
with Ollama up:

    uv run pytest tests/eval_extract.py -s

Seeds an 8-person tree with Jordan Lee marked as "me", extracts each note, and checks the
proposal: who is new, who matched which existing person, and which connections (with direction)
it found. A note passes only if all three are exactly right.
"""

import asyncio
import time
from typing import Any

import pytest
from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import connections

from relationtree import ai
from relationtree.access import default_tree_for
from relationtree.extract import propose
from relationtree.models import Person, Tree, TreeMembership

PEOPLE = [
    "Jordan Lee",
    "Maya Lee",
    "Alex Rivera",
    "Priya Shah",
    "Sam Ortiz",
    "Sam Becker",
    "Nina Park",
    "Omar Haddad",
]
ME = "Jordan Lee"

# (note, new people, matched people, connections as (from, to, TYPE)).
NOTES: list[tuple[str, set[str], set[str], set[tuple[str, str, str]]]] = [
    (
        "Met Chris Wong at Alex's wedding, he's Alex's college roommate.",
        {"Chris Wong"},
        {"Alex Rivera"},
        {("Chris Wong", "Alex Rivera", "FRIEND")},
    ),
    (
        "Priya hired a new engineer, Tom Becker, who reports to her.",
        {"Tom Becker"},
        {"Priya Shah"},
        {("Priya Shah", "Tom Becker", "MANAGER")},
    ),
    (
        "Nina's daughter Lily just started school.",
        {"Lily"},
        {"Nina Park"},
        {("Nina Park", "Lily", "PARENT")},
    ),
    (
        "Ran into Omar at the climbing gym with his brother Karim.",
        {"Karim"},
        {"Omar Haddad"},
        {("Omar Haddad", "Karim", "SIBLING")},
    ),
    (
        "Had lunch with Sam Ortiz, he's moving to Denver next month.",
        set(),
        {"Sam Ortiz"},
        set(),
    ),
    (
        "My sister Rachel is visiting next week with her husband Ben.",
        {"Rachel", "Ben"},
        {"Jordan Lee"},
        {("Jordan Lee", "Rachel", "SIBLING"), ("Rachel", "Ben", "SPOUSE")},
    ),
    (
        "Maya and I went to Priya's birthday dinner.",
        set(),
        {"Maya Lee", "Priya Shah"},
        set(),
    ),
    (
        "Alex and Nina are now coworkers at the same bank.",
        set(),
        {"Alex Rivera", "Nina Park"},
        {("Alex Rivera", "Nina Park", "COWORKER")},
    ),
    (
        "Dev Patel is my new manager at work.",
        {"Dev Patel"},
        {"Jordan Lee"},
        {("Dev Patel", "Jordan Lee", "MANAGER")},
    ),
    (
        "Grace Kim, a friend of Omar's from university, is a dentist.",
        {"Grace Kim"},
        {"Omar Haddad"},
        {("Grace Kim", "Omar Haddad", "FRIEND")},
    ),
]

SYMMETRIC = {"SPOUSE", "SIBLING", "FRIEND", "COWORKER", "ACQUAINTANCE"}


def _normalise(links: set[tuple[str, str, str]]) -> set[tuple[str, str, str]]:
    return {(*sorted((a, b)), t) if t in SYMMETRIC else (a, b, t) for a, b, t in links}  # type: ignore[misc]


def _summarise(proposal: dict[str, Any]) -> tuple[set[str], set[str], set[tuple[str, str, str]]]:
    new = {p["name"] for p in proposal["people"] if p["match_id"] is None}
    matched = {p["name"] for p in proposal["people"] if p["match_id"] is not None}
    names = {p["ref"]: p["name"] for p in proposal["people"]}
    links = {(names[c["a"]], names[c["b"]], c["type"]) for c in proposal["connections"]}
    return new, matched, _normalise(links)


@pytest.mark.django_db(transaction=True)
def test_eval() -> None:
    ai.set_chat_model(None)
    user = User.objects.create_user("eval", password="unused")
    tree = default_tree_for(user)
    people = {name: Person.objects.create(tree=tree, name=name) for name in PEOPLE}
    TreeMembership.objects.filter(user=user).update(me=people[ME])
    known = [(str(p.id), p.name) for p in people.values()]

    # One event loop for every note: the cached Ollama client is bound to the loop it ran on.
    asyncio.run(extract_all(tree, known, people[ME]))


async def extract_all(tree: Tree, known: list[tuple[str, str]], me: Person) -> None:
    passed, times = 0, []
    for note, new, matched, links in NOTES:
        start = time.monotonic()
        try:
            got = _summarise(await propose(tree, note, known, me))
        except Exception as err:  # report and carry on: this is a measurement, not a test
            got = (set(), set(), {("error", type(err).__name__, str(err)[:80])})
        elapsed = time.monotonic() - start
        times.append(elapsed)
        want = (new, matched, _normalise(links))
        ok = got == want
        passed += ok
        print(f"{'PASS' if ok else 'FAIL'} {elapsed:5.1f}s {note}")
        if not ok:
            for i, label in enumerate(("new", "matched", "links")):
                if got[i] != want[i]:
                    g, w = sorted(map(str, got[i])), sorted(map(str, want[i]))
                    print(f"      {label}: got {g}, want {w}")
    times.sort()
    print(
        f"{passed}/{len(NOTES)} passed, median {times[len(times) // 2]:.1f}s, max {times[-1]:.1f}s"
    )
    # propose() reads the DB from asgiref's worker thread; close it so the test DB can be dropped.
    await sync_to_async(connections.close_all)()
