# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily one person (the owner) keeping track of the people in their life: just before getting in touch with someone, right after meeting someone new, or when asking a question like "who is Alex's sister?". A few family members and friends join shared trees through invite links, as editors or viewers. Used on a desktop at a desk and on a phone, sometimes outdoors.

## Product Purpose

RelationTree is a private relationship tree: people, how you know them, notes, photos, birthdays, when you last talked, and the connections between them (family, friends, coworkers, managers). It helps you remember and keep up with people. Success is opening it before a call or after a party and finding, or adding, what you need in seconds.

## Positioning

A personal, private people-and-connections tree whose AI runs entirely on the owner's own GPU: catch-up summaries, meaning-based search, questions answered from the graph ("who is my manager's spouse?"), and turning a pasted note into people and connections. Nothing goes to a hosted model.

## Operating Context

- Trees: each user has one or more trees and a current tree; trees can be shared with roles owner, editor and viewer. One person per tree can be marked "This is me".
- Core screens: sign-in, the People list (search, category filter, sort by least recently contacted, Ask box, Add from a note), person detail (form, photo, connections, ego graph, catch-up summary), Add person, tree settings (members, roles, invite links), and the public invite page.
- AI calls are slow (about 10 to 20 seconds for reading a note) and depend on the home server being on; the app must show that state honestly.
- Hosted on Cloudflare Pages, with the API served from a home server through a tunnel. The server is sometimes off.

## Capabilities and Constraints

- AI is local only (Ollama). Never suggest or depend on hosted LLMs.
- Contact details (phone, email, address) are never sent to a model.
- Viewers see a read-only interface: no add, edit, delete, photo or connection controls.
- Single questions only in Ask (no follow-up conversation).
- Stack: React, Vite, Tailwind v4, shadcn/ui (Radix), TanStack Query, React Flow for the graph, sonner for toasts.

## Brand Commitments

- The visual system is Kiln, as recorded in DESIGN.md (pinned by the owner on 2026-10-20). Dark by default, with Kiln's light grounds when the device is in light mode.
- In the app, Kiln is applied at working scale: no marketing-sized display type, no loss of information density in lists, and orange reserved for the primary action rather than spread across badges and links.

## Evidence on Hand

Real data lives only in the owner's private trees and must never appear in screenshots, demos or docs. Demonstration data must be clearly synthetic.

## Product Principles

1. Private by default: nothing leaves the owner's machine except to the people they share a tree with.
2. Fast to scan, fast to add: the list and the add flows beat decoration.
3. The AI proposes and the person decides; nothing is saved without review.
4. Be honest about slow or unavailable AI and server states.

## Accessibility & Inclusion

WCAG AA contrast in both themes, readable on a phone in sunlight, full keyboard use, and visible focus.
