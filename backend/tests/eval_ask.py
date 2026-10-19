"""Graph Q&A measurement against the real local model, through the same agent as /api/ask.
Not part of the test suite (the file name doesn't match test_*.py); run explicitly with Ollama up:

    uv run pytest tests/eval_ask.py -s

Seeds a 15-person tree, marks Jordan as "me", asks each question and prints accuracy and timing.
An answer passes if it mentions every expected name or word (case-insensitive).
"""

import asyncio
import time

import pytest
from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import connections

from relationtree import ai
from relationtree.access import default_tree_for
from relationtree.ask import answer
from relationtree.models import Connection, Person, TreeMembership
from relationtree.relationships import canonical_pair
from relationtree.search import embed_pending

PEOPLE = {
    "Jordan Lee": "",
    "Maya Lee": "",
    "Leo Lee": "",
    "Ava Lee": "",
    "Robert Lee": "",
    "Linda Lee": "",
    "Chris Lee": "",
    "Dana Lee": "",
    "Ella Lee": "",
    "Priya Shah": "Director of engineering at work",
    "Sam Ortiz": "Backend engineer on my team",
    "Tom Becker": "Frontend engineer on my team",
    "Raj Shah": "",
    "Nina Park": "Bond trader at a bank in Chicago",
    "Omar Haddad": "Met at the climbing gym",
}
# (a, type, b): a is b's <type>.
LINKS = [
    ("Jordan Lee", "SPOUSE", "Maya Lee"),
    ("Jordan Lee", "PARENT", "Leo Lee"),
    ("Jordan Lee", "PARENT", "Ava Lee"),
    ("Maya Lee", "PARENT", "Leo Lee"),
    ("Maya Lee", "PARENT", "Ava Lee"),
    ("Robert Lee", "PARENT", "Jordan Lee"),
    ("Linda Lee", "PARENT", "Jordan Lee"),
    ("Robert Lee", "PARENT", "Chris Lee"),
    ("Linda Lee", "PARENT", "Chris Lee"),
    ("Robert Lee", "SPOUSE", "Linda Lee"),
    ("Jordan Lee", "SIBLING", "Chris Lee"),
    ("Chris Lee", "SPOUSE", "Dana Lee"),
    ("Chris Lee", "PARENT", "Ella Lee"),
    ("Dana Lee", "PARENT", "Ella Lee"),
    ("Priya Shah", "MANAGER", "Jordan Lee"),
    ("Jordan Lee", "MANAGER", "Sam Ortiz"),
    ("Jordan Lee", "MANAGER", "Tom Becker"),
    ("Sam Ortiz", "COWORKER", "Tom Becker"),
    ("Priya Shah", "SPOUSE", "Raj Shah"),
    ("Raj Shah", "FRIEND", "Dana Lee"),
    ("Nina Park", "FRIEND", "Maya Lee"),
    ("Omar Haddad", "ACQUAINTANCE", "Sam Ortiz"),
]
ME = "Jordan Lee"
# (question, words the answer must all contain)
QUESTIONS = [
    ("Who are my kids?", ["Leo", "Ava"]),
    ("Who has kids?", ["Jordan", "Maya", "Robert", "Linda", "Chris", "Dana"]),
    ("How am I connected to Raj?", ["Priya"]),
    ("Who do I manage?", ["Sam", "Tom"]),
    ("Who are Ella's aunt and uncle?", ["Maya", "Jordan"]),
    ("Who are Robert's grandchildren?", ["Leo", "Ava", "Ella"]),
    ("Who knows someone who works in finance?", ["Maya"]),
    ("How is Omar connected to Tom?", ["Sam"]),
    ("Who is my sister-in-law?", ["Dana"]),
    ("Who is my manager married to?", ["Raj"]),
    ("How are Leo and Ella related?", ["cousin"]),
    ("Who are Linda's children?", ["Jordan", "Chris"]),
]


async def ask(user: User, question: str) -> tuple[str, int]:
    text, tools_used = "", 0
    async for event in answer(user, question):
        text += event.get("text", "")
        tools_used += "tool" in event
    return text, tools_used


# transaction=True: the agent reads the DB from asgiref's worker thread, a separate connection.
@pytest.mark.django_db(transaction=True)
def test_eval() -> None:
    ai.set_chat_model(None)
    ai.set_embedder(None)
    user = User.objects.create_user("eval", password="unused")
    tree = default_tree_for(user)
    people = {
        name: Person.objects.create(tree=tree, name=name, context=context)
        for name, context in PEOPLE.items()
    }
    for a, type_, b in LINKS:
        kind = Connection.RelationshipType(type_)
        first, second = canonical_pair(kind, people[a].id, people[b].id)
        by_id = {people[a].id: people[a], people[b].id: people[b]}
        Connection.objects.create(
            tree=tree, person_a=by_id[first], person_b=by_id[second], type=kind
        )
    while embed_pending():
        pass

    TreeMembership.objects.filter(user=user).update(me=people[ME])

    # One event loop for every question: the cached Ollama client is bound to the loop it ran on.
    asyncio.run(ask_all(user))


async def ask_all(user: User) -> None:
    passed, times = 0, []
    for question, expected in QUESTIONS:
        start = time.monotonic()
        text, tools_used = await ask(user, question)
        elapsed = time.monotonic() - start
        times.append(elapsed)
        ok = all(word.lower() in text.lower() for word in expected)
        passed += ok
        print(f"{'PASS' if ok else 'FAIL'} {elapsed:5.1f}s t{tools_used} {question} -> {text}")
    times.sort()
    print(
        f"{passed}/{len(QUESTIONS)} passed, median {times[len(times) // 2]:.1f}s, "
        f"max {times[-1]:.1f}s"
    )
    # The agent reads the DB from asgiref's worker thread; close it so the test DB can be dropped.
    await sync_to_async(connections.close_all)()
