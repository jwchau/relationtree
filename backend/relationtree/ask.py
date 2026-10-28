"""Graph Q&A: the local model answers a question by calling read-only tools over one tree's
people (graph.py), then writes a short answer.

Measured on a 15-person tree with 12 graph questions (tests/eval_ask.py, qwen3.8:27b):
thinking on got 11/12 (median 4.8 s), thinking off 8/12 with confident wrong answers
("your kids are Maya and Ava" for a spouse and a child), so thinking stays on.
With step, adoptive and former links (2026-10-27: an ex-wife, a stepson and an adopted
daughter added, 18 people, 16 questions): 14, 15 and 14/16 over three runs, median ~4.2 s,
against 12/16 before the tools named kinds, when "who am I married to?" got the ex too and
stepchildren and adoptions weren't found. The steady miss is an aunt by marriage ("Ella's aunt
and uncle" finds only her father's sibling), before and after.
"""

import json
from collections.abc import AsyncGenerator, Callable
from typing import Any
from uuid import UUID

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth.models import User

from relationtree.ai import ToolCall, get_chat_model
from relationtree.graph import find_people, get_person, path_between, people_with_relationship
from relationtree.models import Person, Tree, TreeMembership
from relationtree.prompts import build_ask_messages
from relationtree.search import search_people

MAX_ROUNDS = 6
GAVE_UP = "Sorry, I couldn't work that out. Try asking more specifically."

ROLES = (
    "Spouse, Former spouse, Child, Step-child, Adopted child, Parent, Step-parent, "
    "Adoptive parent, Sibling, Report, Manager, Friend, Coworker, Acquaintance"
)


def _tool(name: str, description: str, /, **params: str) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {p: {"type": "string", "description": d} for p, d in params.items()},
                "required": list(params),
            },
        },
    }


TOOLS = [
    _tool("find_people", "Find people by part of their name. Returns ids.", name="Name or part"),
    _tool(
        "get_person",
        "Everything recorded about one person, with their connections and each connected "
        "person's role relative to them.",
        id="Person id from find_people",
    ),
    _tool(
        "people_with_relationship",
        "Everyone who has someone in a given role, e.g. role 'Child' lists parents with their "
        "children, step and adopted ones too, named as such. 'Spouse' is a current spouse only. "
        f"Roles: {ROLES}.",
        role="The role the other person has",
    ),
    _tool(
        "path_between",
        "Shortest chain of connections between two people. Each step's role is who that "
        "person is to the previous one.",
        from_id="Person id",
        to_id="Person id",
    ),
    _tool(
        "semantic_search",
        "Find people by what's written about them (job, where you met, interests).",
        query="What to look for",
    ),
]


def _search(tree: Tree, query: str) -> list[dict[str, Any]]:
    return [
        {"id": str(p.id), "name": p.name, "about": p.context or None}
        for p, _ in search_people(tree, query)
    ]


def run_tool(tree: Tree, call: ToolCall) -> Any:
    """Runs one tool call. Mistakes go back to the model as an error it can correct."""
    args = call.arguments
    tools: dict[str, Callable[[], Any]] = {
        "find_people": lambda: find_people(tree, str(args["name"])),
        "get_person": lambda: get_person(tree, UUID(str(args["id"]))),
        "people_with_relationship": lambda: people_with_relationship(tree, str(args["role"])),
        "path_between": lambda: path_between(
            tree, UUID(str(args["from_id"])), UUID(str(args["to_id"]))
        ),
        "semantic_search": lambda: _search(tree, str(args["query"])),
    }
    if call.name not in tools:
        return {"error": f"There is no tool called {call.name!r}."}
    try:
        return tools[call.name]()
    except (KeyError, ValueError) as err:
        return {"error": f"Bad arguments for {call.name}: {err}"}


def progress(call: ToolCall) -> str:
    """What to show while a tool runs."""
    args = call.arguments
    match call.name:
        case "find_people":
            return f"Looking up {args.get('name', 'someone')}…"
        case "people_with_relationship":
            return f"Finding everyone with a {str(args.get('role', 'relation')).lower()}…"
        case "path_between":
            return "Tracing how they're connected…"
        case "semantic_search":
            return f"Searching for “{args.get('query', '')}”…"
        case _:
            return "Checking connections…"


def _collect_people(result: Any, seen: dict[str, str]) -> None:
    """Remember every {id, name} in a tool result, so the answer's names can become links."""
    if isinstance(result, dict):
        if isinstance(result.get("id"), str) and isinstance(result.get("name"), str):
            seen[result["id"]] = result["name"]
        for value in result.values():
            _collect_people(value, seen)
    elif isinstance(result, list):
        for item in result:
            _collect_people(item, seen)


def _me(user: User, tree: Tree) -> Person | None:
    membership = (
        TreeMembership.objects.filter(user=user, tree=tree, me__isnull=False)
        .select_related("me")
        .first()
    )
    return membership.me if membership else None


async def answer(user: User, tree: Tree, question: str) -> AsyncGenerator[dict[str, Any]]:
    """Events for the client: {"tool": progress}, {"text": delta}, then {"people": [...]}."""
    me = await sync_to_async(_me)(user, tree)
    messages: list[dict[str, Any]] = build_ask_messages(question, me)
    seen: dict[str, str] = {}
    text = ""
    for _ in range(MAX_ROUNDS):
        calls: list[ToolCall] = []
        turn_text = ""
        async for event in get_chat_model().stream_turn(
            messages,
            tools=TOOLS,
            model=settings.CHAT_MODEL,
            options={"num_ctx": settings.OLLAMA_NUM_CTX},
            think=True,
        ):
            if isinstance(event, ToolCall):
                calls.append(event)
            else:
                turn_text += event
                yield {"text": event}
        text += turn_text
        if not calls:
            break
        messages.append(
            {
                "role": "assistant",
                "content": turn_text,
                "tool_calls": [
                    {"function": {"name": c.name, "arguments": c.arguments}} for c in calls
                ],
            }
        )
        for call in calls:
            yield {"tool": progress(call)}
            result = await sync_to_async(run_tool)(tree, call)
            _collect_people(result, seen)
            messages.append({"role": "tool", "tool_name": call.name, "content": json.dumps(result)})
    else:
        text += GAVE_UP
        yield {"text": GAVE_UP}

    mentioned = [{"id": i, "name": n} for i, n in seen.items() if n in text]
    yield {"people": mentioned}
