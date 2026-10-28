"""What the LLM gets to see. Everything sent to a model goes through this module.

Contact details (phone, email, address) are deliberately never included: summaries don't
need them, and keeping them out means a future shared tree or hosted model can't leak them.
"""

from datetime import date

from relationtree.models import Person
from relationtree.relationships import connections_of

SUMMARY_SYSTEM_PROMPT = (
    "You help someone keep up with the people in their life. Given what they've recorded "
    "about one person, write them a short, warm catch-up to read just before getting in "
    "touch: who this person is to them, what's been going on, how long it's been, and "
    "anything worth bringing up (such as an upcoming birthday). Speak to them directly as "
    '"you". Use only the facts provided; if there is little to go on, say so briefly instead '
    "of inventing details. Write plain prose in one or two short paragraphs: no markdown, "
    "headings, bullet points, or bold. Keep it under 120 words."
)


def build_summary_context(person: Person, today: date | None = None) -> str:
    today = today or date.today()
    lines = [f"Name: {person.name}"]
    if person.relationship_category:
        lines.append(f"Category: {person.get_relationship_category_display()}")
    if person.context:
        lines.append(f"How they know each other: {person.context}")
    if person.birthday:
        lines.append(f"Birthday: {person.birthday.isoformat()}")
    if person.last_contacted_date:
        days = (today - person.last_contacted_date).days
        lines.append(f"Last contacted: {person.last_contacted_date.isoformat()} ({days} days ago)")
    else:
        lines.append("Last contacted: never recorded")
    if person.notes:
        lines.append(f"Notes:\n{person.notes}")
    connections = [f"{v.other.name} ({v.role})" for v in connections_of(person)]
    if connections:
        lines.append("Connected to: " + ", ".join(connections))
    lines.append(f"Today's date: {today.isoformat()}")
    return "\n".join(lines)


ASK_SYSTEM_PROMPT = (
    "You answer questions about the people in someone's life, using only the tools to look "
    "things up. Never guess at relationships: look them up. Roles are always the other "
    "person's role relative to the one you looked up (in get_person, a connection with role "
    "'Child' is that person's child). A 'Former spouse' is an ex, never a current partner, and "
    "step and adoptive relations are named so ('Step-child', 'Adoptive parent'): say so when "
    "you mention them. Answer in one or two short sentences of plain text (no "
    "markdown, bold or lists), naming people by their full name. If the tools don't give an "
    "answer, say you don't know."
)


def build_ask_messages(question: str, me: Person | None) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": ASK_SYSTEM_PROMPT}]
    if me is not None:
        messages.append(
            {
                "role": "system",
                "content": f'The user is {me.name} (id {me.id}). "I", "me" and "my" mean them.',
            }
        )
    messages.append({"role": "user", "content": question})
    return messages


def build_summary_messages(person: Person) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {"role": "user", "content": build_summary_context(person)},
    ]


EXTRACT_SYSTEM_PROMPT = (
    "You turn a short note someone wrote about people in their life into structured data. "
    "List every person the note mentions by name, except the user who wrote it. For each, set "
    "existing_id to the id of the person in the known list when it is clearly the same person "
    "(a first name alone matches if only one known person has it), otherwise null. Set "
    "category (FAMILY, FRIEND, COWORKER, ACQUAINTANCE, OTHER) only when the note makes clear "
    "how that person relates to the user, not to someone else: a friend's sister isn't the "
    "user's FAMILY. Set about to one short sentence of what the note says about that person, "
    'written for the user (call them "you", never "the writer"), or null.\n'
    "List connections the note states or clearly implies, naming people exactly as in your "
    "people list (or the known list). Types: SPOUSE, SIBLING, FRIEND, COWORKER, ACQUAINTANCE "
    "have no direction. PARENT means from is to's parent; MANAGER means from is to's manager. "
    "On PARENT, set parent_kind to STEP for a step-parent or step-child, ADOPTIVE for an "
    "adoptive parent or adopted child, otherwise BIOLOGICAL. On SPOUSE, set ended to true "
    "for an ex, a divorce or a former partner. On every other type, parent_kind is null and "
    "ended is false. "
    "Only add a connection when the note states how two people are related (family, "
    "friends, work together, manages): being at the same event, meeting someone, or doing "
    "something together is not a connection. Never invent people or connections the note "
    "doesn't support. If the user is in the known list, connections to them use their name; "
    "otherwise leave the user out."
)

# What the model must return (Ollama structured output); extract.py checks it again.
EXTRACT_FORMAT: dict[str, object] = {
    "type": "object",
    "properties": {
        "people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "existing_id": {"type": ["string", "null"]},
                    "category": {
                        "type": ["string", "null"],
                        "enum": ["FAMILY", "FRIEND", "COWORKER", "ACQUAINTANCE", "OTHER", None],
                    },
                    "about": {"type": ["string", "null"]},
                },
                "required": ["name", "existing_id", "category", "about"],
            },
        },
        "connections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "string"},
                    "to": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": [
                            "SPOUSE",
                            "SIBLING",
                            "FRIEND",
                            "COWORKER",
                            "ACQUAINTANCE",
                            "PARENT",
                            "MANAGER",
                        ],
                    },
                    "parent_kind": {
                        "type": ["string", "null"],
                        "enum": ["BIOLOGICAL", "ADOPTIVE", "STEP", None],
                    },
                    "ended": {"type": "boolean"},
                },
                "required": ["from", "to", "type", "parent_kind", "ended"],
            },
        },
    },
    "required": ["people", "connections"],
}


def build_extract_messages(
    note: str, known: list[tuple[str, str]], me: tuple[str, str] | None
) -> list[dict[str, str]]:
    """`known` is the tree's people as (ref, name), and `me` the user's (ref, name): names
    only, never contact details. Refs are short ("k12"), not UUIDs: every person in the tree
    goes into the prompt, and a UUID costs ~30 tokens of the model's context."""
    lines = [f"{ref}: {name}" for ref, name in known]
    context = "Known people (id: name):\n" + ("\n".join(lines) if lines else "(none yet)")
    if me is not None:
        context += f'\n\nThe user is {me[1]} (id {me[0]}). "I", "me" and "my" mean them.'
    return [
        {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
        {"role": "system", "content": context},
        {"role": "user", "content": note},
    ]
