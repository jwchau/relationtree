"""Free-text extraction: a pasted note becomes proposed people and connections, which the user
reviews before anything is saved.

The model only proposes. Everything it says is checked here against the tree: ids must be
people in this tree, connection ends must be people in the proposal, types must exist. The
user's edited proposal is checked again on apply, which saves all of it or nothing.

Measured on an 8-person tree with 10 notes (tests/eval_extract.py, qwen3.8:27b), thinking on:
10/10 with the final prompt (median 13.6 s, max 21.1 s); earlier wordings scored 9-10/10 at a
median of ~8.5 s. One answer in one run came back empty after 73 s (a runaway think), which the
user sees as "couldn't read that note".
The prompt, the thinking and the answer share num_ctx (8192). Thinking is the big part: ~2k
tokens for a one-line note, ~3.5-5k for a full 2000-char one. Each known person costs ~8 tokens
(it was ~36 with UUIDs), so a full note still read perfectly in a 300-person tree, a short one
in 600; past that the user gets "too much to read" (413), not a wrong proposal.
Thinking off scored 8/10 (median 2.4 s) with invented links ("Maya and I went to Priya's dinner"
made Maya a sibling, from the shared surname), so thinking stays on. The usual miss: a college
roommate proposed as an acquaintance rather than a friend.
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import transaction
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from relationtree.ai import OutOfRoom, get_chat_model
from relationtree.models import Connection, Person, Tree
from relationtree.prompts import EXTRACT_FORMAT, build_extract_messages
from relationtree.relationships import SYMMETRIC, canonical_pair

# A low estimate of prompt characters per token, so the size check errs towards refusing. The
# known-people list is the densest part: ~2.0 chars per token with qwen3.8 ("k523: Xavier
# Ortega"), against ~4.4 for note text.
CHARS_PER_TOKEN = 2.0


class ExtractionFailed(Exception):
    """The model's answer wasn't the JSON we asked for."""


class ApplyError(Exception):
    """The proposal to apply doesn't fit the tree (shown to the user as a 422)."""


# --- What the model returns ---------------------------------------------------------------------


class _RawPerson(BaseModel):
    name: str
    existing_id: str | None = None
    category: str | None = None
    about: str | None = None

    @field_validator("category")
    @classmethod
    def known_category(cls, value: str | None) -> str | None:
        # A made-up category isn't worth failing the whole note over.
        return value if value in Person.RelationshipCategory.values else None


class _RawLink(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    type: str


class _RawProposal(BaseModel):
    people: list[_RawPerson]
    connections: list[_RawLink]


def parse(text: str) -> _RawProposal:
    try:
        return _RawProposal.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as err:
        raise ExtractionFailed(str(err)) from err


# --- Cleaning it into a proposal ----------------------------------------------------------------


@dataclass
class _Entry:
    ref: str
    name: str
    match: Person | None
    category: str | None = None
    about: str | None = None

    def out(self) -> dict[str, Any]:
        new = self.match is None
        return {
            "ref": self.ref,
            "name": self.name,
            "match_id": None if new else self.match.id,  # type: ignore[union-attr]
            "category": self.category if new else None,
            "context": self.about if new else None,
            "note": None if new else self.about,
        }


@dataclass
class _Builder:
    known: dict[str, Person]
    entries: dict[str, _Entry] = field(default_factory=dict)
    by_name: dict[str, str] = field(default_factory=dict)

    def _known_by_name(self, name: str) -> Person | None:
        found = [p for p in self.known.values() if p.name.casefold() == name.casefold()]
        return found[0] if len(found) == 1 else None

    def _key(self, match: Person | None, name: str) -> str:
        return f"id:{match.id}" if match else f"name:{name.casefold()}"

    def add(self, name: str, existing_id: str | None) -> _Entry:
        name = " ".join(name.split())
        # Trust the model's id only if it's someone in this tree; else try the exact name.
        match = self.known.get(existing_id or "") or self._known_by_name(name)
        key = self._key(match, name)
        if key not in self.entries:
            ref = f"p{len(self.entries) + 1}"
            self.entries[key] = _Entry(ref=ref, name=match.name if match else name, match=match)
        self.by_name[name.casefold()] = key
        return self.entries[key]

    def find(self, name: str) -> _Entry | None:
        """A connection end: someone in the proposal, or else someone in the tree by name."""
        key = self.by_name.get(" ".join(name.split()).casefold())
        if key is not None:
            return self.entries[key]
        match = self._known_by_name(name)
        return self.add(match.name, str(match.id)) if match else None


def clean(raw: _RawProposal, tree: Tree) -> dict[str, Any]:
    builder = _Builder(known={str(p.id): p for p in tree.people.all()})
    for person in raw.people:
        if not person.name.strip():
            continue
        entry = builder.add(person.name, person.existing_id)
        entry.category = entry.category or person.category
        entry.about = entry.about or (person.about or "").strip() or None

    links: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for link in raw.connections:
        if link.type not in Connection.RelationshipType.values:
            continue
        a, b = builder.find(link.from_), builder.find(link.to)
        if a is None or b is None or a is b:
            continue
        pair = sorted([a.ref, b.ref]) if link.type in SYMMETRIC else [a.ref, b.ref]
        if (pair[0], pair[1], link.type) in seen:
            continue
        seen.add((pair[0], pair[1], link.type))
        links.append({"a": a.ref, "b": b.ref, "type": link.type})

    return {"people": [e.out() for e in builder.entries.values()], "connections": links}


async def propose(
    tree: Tree, note: str, known: list[tuple[str, str]], me: Person | None
) -> dict[str, Any]:
    """Asks the model about the note and cleans its answer. Raises AIUnavailable (or
    TimeoutError) if the model doesn't answer, OutOfRoom if the note and the tree don't fit
    in its context, ExtractionFailed if the answer isn't usable."""
    # The model sees short refs, not ids; they're mapped back before cleaning.
    ids = {f"k{i}": person_id for i, (person_id, _) in enumerate(known, 1)}
    refs = {person_id: ref for ref, person_id in ids.items()}
    named = [(refs[person_id], name) for person_id, name in known]
    you = (refs[str(me.id)], me.name) if me is not None and str(me.id) in refs else None
    messages = build_extract_messages(note, named, you)
    # Ollama silently cuts a prompt longer than num_ctx, instructions first, and the model then
    # answers confidently from what's left. Refuse before that can happen.
    if sum(len(m["content"]) for m in messages) / CHARS_PER_TOKEN > settings.OLLAMA_NUM_CTX:
        raise OutOfRoom("prompt alone is over num_ctx")
    answer = await asyncio.wait_for(
        get_chat_model().complete(
            messages,
            format=EXTRACT_FORMAT,
            model=settings.CHAT_MODEL,
            options={"num_ctx": settings.OLLAMA_NUM_CTX},
            think=True,
        ),
        settings.AI_FIRST_TOKEN_TIMEOUT,
    )
    raw = parse(answer)
    for person in raw.people:
        person.existing_id = ids.get(person.existing_id or "")
    return await sync_to_async(clean)(raw, tree)


# --- Applying the reviewed proposal ---------------------------------------------------------------


@dataclass
class Applied:
    created: list[Person]
    updated: list[Person]
    connections_added: int
    connections_skipped: int


def _note_line(note: str) -> str:
    return f"{date.today().isoformat()}: {note.strip()}"


def apply(tree: Tree, people: list[dict[str, Any]], links: list[dict[str, Any]]) -> Applied:
    """Saves a reviewed proposal: all of it, or (on ApplyError) none of it."""
    refs = [p["ref"] for p in people]
    if len(set(refs)) != len(refs):
        raise ApplyError("Each person in the proposal needs a different ref")
    match_ids = {p["match_id"] for p in people if p["match_id"] is not None}
    existing = {p.id: p for p in tree.people.filter(id__in=match_ids)}
    if len(existing) != len(match_ids):
        raise ApplyError("Someone in the proposal isn't in this tree")

    with transaction.atomic():
        created: list[Person] = []
        updated: list[Person] = []
        resolved: dict[str, Person] = {}
        for p in people:
            if p["match_id"] is None:
                person = Person.objects.create(
                    tree=tree,
                    name=p["name"],
                    relationship_category=p.get("category"),
                    context=(p.get("context") or "").strip(),
                )
                created.append(person)
            else:
                person = existing[p["match_id"]]
                if (p.get("note") or "").strip() and person not in updated:
                    line = _note_line(p["note"])
                    person.notes = f"{person.notes}\n{line}" if person.notes else line
                    person.save()
                    updated.append(person)
            resolved[p["ref"]] = person

        added = skipped = 0
        for link in links:
            a, b = resolved.get(link["a"]), resolved.get(link["b"])
            if a is None or b is None:
                raise ApplyError("A connection refers to someone who isn't in the proposal")
            if a.id == b.id:
                raise ApplyError(f"{a.name} can't be connected to themselves")
            kind = Connection.RelationshipType(link["type"])
            first, second = canonical_pair(kind, a.id, b.id)
            _, made = Connection.objects.get_or_create(
                tree=tree, person_a_id=first, person_b_id=second, type=kind
            )
            added += made
            skipped += not made
    return Applied(created, updated, added, skipped)
