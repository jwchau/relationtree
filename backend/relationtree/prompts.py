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
    connections = [f"{v.other.name} ({v.label})" for v in connections_of(person)]
    if connections:
        lines.append("Connected to: " + ", ".join(connections))
    lines.append(f"Today's date: {today.isoformat()}")
    return "\n".join(lines)


def build_summary_messages(person: Person) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {"role": "user", "content": build_summary_context(person)},
    ]
