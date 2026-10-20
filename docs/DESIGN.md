# Claude Trader v2 — Design

Status: **design locked 2026-10-12, not yet implemented.** v1 (daily LLM ETF
rebalance via Claude Code scheduled routines) is frozen at tag `v1-final`;
its design lives in [`archive/v1/DESIGN.md`](archive/v1/DESIGN.md).

---

## 1. Scope and intent

An always-on, single-user paper-trading app that runs in one Docker container.
While the market is open, a **local LLM (Ollama)** is asked every minute to
manage positions in a curated watchlist of up to 25 US stocks/ETFs by emitting
**individual orders**. Protective exits are **broker-side trailing stops** on
Alpaca. A React dashboard shows positions, orders, trades, the LLM's decisions,
and exposes settings, manual trade commands and the model's memory.

Goals:
- Observe whether a small local model, given good precomputed features and a
  self-maintained memory, can trade intraday with positive expectancy.
- Never leave a position unprotected; never let the model exceed hard limits.

### Non-goals (v2)
- Live money by default (possible only behind deliberate friction, §14).
- Short selling, options, margin/leverage, limit-order entries.
- Overnight holding — every session ends flat (§7).
- Fine-tuning the model. "Learning" = better prompt context (§10).
- Paid market data. Free Alpaca IEX feed only.
- Multi-user, remote access, auth. Dashboard binds to localhost only.

---

## 2. Principles (carried from v1)

- **Alpaca is the source of truth** for positions, orders and cash. Local state
  records what happened; it is reconciled against Alpaca, never trusted over it.
- **The LLM proposes, deterministic Python disposes.** Every action — LLM or
  manual — passes the same validator. The model cannot change risk settings.
- **Fail safe, not fail open.** Bad output, timeouts and crashes result in *no
  new action*; existing positions stay protected by broker-side stops.

---

## 3. Architecture

```
            ┌──────────────────────── Docker container ────────────────────────┐
            │                                                                  │
 Alpaca ◄──►│  broker/      ◄── orders, stops, account, clock, bar websocket   │
 (paper)    │     ▲                                                            │
            │     │                                                            │
            │  engine/  1-min loop: sync → features → LLM → validate → submit  │
            │     │          ▲                │                                │
            │     ▼          │                ▼                                │
            │  store/ (SQLite /data/trader.db)   llm/ ──► Ollama (host)        │
            │     ▲                                                            │
            │  api/ FastAPI (REST + WebSocket) ──► web/ React static build     │
            │                                                                  │
            └────────────── 127.0.0.1:8000 ──────────── /data volume ──────────┘
```

One Python process: FastAPI app with the trading engine as an asyncio
background task. The React app is built in a multi-stage Dockerfile and served
as static files by FastAPI.

---

## 4. The trading loop

Every minute, aligned to the bar close, while the loop is `running` and Alpaca's
clock says open:

1. **Sync** positions, open orders, account from Alpaca (REST) + latest 1-min
   bars (websocket buffer). Record fills since last pass.
2. **Protect:** any LLM- or manual-tagged position without a live trailing stop
   gets one immediately at `DEFAULT_TRAIL_PERCENT` (§7).
3. **Guards:** if `DAILY_LOSS_LIMIT` breached → entries blocked for the day
   (§6). If within `FLATTEN_LEAD_MIN` of close → flatten and stop (§7).
4. **Features:** compute per-symbol row + signal score (§8).
5. **Prompt** the LLM with features, account block, memory, last few passes'
   actions/outcomes (§9).
6. **Parse** response against the action schema (§5). Malformed → pass recorded
   as `parse_failed`, no actions, **no retry**.
7. **Validate** each action independently (§6). Rejected actions are logged with
   reason; valid ones proceed.
8. **Submit** valid actions to Alpaca. Entry fills trigger their trailing stop
   placement (§5).
9. **Record** the pass: prompt hash, latency, raw output, parsed actions,
   validation results, order ids.

**No overlap:** if the previous pass is still running when the next minute
arrives, the new pass is skipped (`skipped:llm_busy`). LLM call timeout
`LLM_TIMEOUT_SEC` (default 45) → pass recorded as `timeout`, no actions.

Pass statuses: `ok | no_action | parse_failed | timeout | llm_error | error |
skipped:llm_busy | skipped:market_closed | skipped:paused | skipped:warming_up |
halted:daily_loss | flattening`.

**Pause stops the LLM only.** Protection, the daily-loss guard and the flatten
still run every minute while paused — otherwise a paused engine would carry
positions overnight. A flatten that leaves anything open is retried every pass.

**Ownership and daily counters are re-derived from today's Alpaca order history
every pass** (client_order_id prefixes; protective stops are always `sys-`, so
`llm-` orders = the LLM's order usage). The same code rebuilds state after a
restart, and a buy that is stopped out between two syncs still starts its
cooldown, stamped at the fill time. *(Implemented: `trader/engine/`.)*

---

## 5. Action schema

The LLM emits exactly this JSON (sent as `response_format` JSON schema to
Ollama; validated by Pydantic regardless):

```json
{
  "as_of": "2026-10-12T14:31:00-04:00",
  "actions": [
    {"type": "buy",          "symbol": "NVDA", "qty": 10, "trail_percent": 3.0, "reason": "..."},
    {"type": "stop_buy",     "symbol": "AMD",  "qty": 20, "stop_price": 172.50, "trail_percent": 2.5, "reason": "..."},
    {"type": "sell",         "symbol": "TSLA", "qty": 5, "reason": "..."},
    {"type": "adjust_trail", "symbol": "NVDA", "trail_percent": 1.5, "reason": "..."},
    {"type": "cancel",       "order_id": "...", "reason": "..."}
  ],
  "memo_update": "optional, short — stored in the pass log, not memory.md"
}
```

| Type | Alpaca call | Notes |
|---|---|---|
| `buy` | Market order, `DAY` | `trail_percent` required. On fill → `TrailingStopOrderRequest` (sell, qty filled, `DAY`) |
| `stop_buy` | `StopOrderRequest` (buy), `DAY` | `trail_percent` required; trailing stop placed when the stop-buy fills |
| `sell` | Cancel the symbol's trailing stop, then market sell | Partial sell → stop re-placed for remaining qty |
| `adjust_trail` | Replace order on the existing trailing stop | |
| `cancel` | Cancel order | Cannot target a protective trailing stop on a held position (use `sell`) |

- `qty` = whole shares (Alpaca stop orders don't accept fractional qty).
- `actions: []` is valid and expected most minutes.
- Market entries only; no limit orders, no shorts.

> **Verified 2026-10-13 (paper):** Alpaca rejects a trailing stop as an OTO leg
> (`oto orders require stop_loss.stop_price`), so entry → stop placement stays
> two-step.

---

## 6. Risk limits

Stored in SQLite `settings`, editable in the GUI, seeded from
`config/defaults.yaml` on first start. The LLM sees them but cannot change them.

| Setting | Default | Rule |
|---|---|---|
| `MAX_POSITION_PCT` | 0.10 | Post-trade position value ≤ 10% of equity |
| `SYMBOL_CAPS` | per-symbol | Optional tighter per-symbol max % (overrides above when lower) |
| `MAX_ORDER_NOTIONAL` | 10000 | Single order ≤ $10k |
| `MAX_OPEN_POSITIONS` | 10 | |
| `MAX_ORDERS_PER_DAY` | 100 | Counts LLM-originated orders only |
| `SYMBOL_COOLDOWN_MIN` | 15 | No LLM re-entry within 15 min of exiting a symbol |
| `TRAIL_PERCENT_MIN/MAX` | 1.0 / 10.0 | Bounds on any `trail_percent` |
| `DEFAULT_TRAIL_PERCENT` | 3.0 | Used for orphan-position protection |
| `TRAIL_TIGHTEN_MIN_GAIN` | 0.005 | LLM `adjust_trail` may tighten (lower) a trail only when the position is up ≥ 0.5% vs avg entry; widening always allowed; unknown current trail counts as tightening; 0 disables. Manual commands exempt. *(Added 2026-10-14 after the model tightened FAST at +0.16%.)* |
| `MIN_CASH_PCT` | 0.10 | Post-trade cash ≥ 10% of equity |
| `DAILY_LOSS_LIMIT` | −0.02 | Equity vs start-of-day equity. Breach → cancel pending entries, keep stops, block new entries for the rest of the session. Auto-resets next session |
| `FLATTEN_LEAD_MIN` | 10 | Minutes before Alpaca's reported close |

Also enforced: symbol ∈ watchlist; LLM may not act on `source=manual` positions
unless that position has `llm_managed=true`; no action while loop is halted;
**no entries while Alpaca's clock says the market is closed** (LLM or manual).
Alpaca accepts market and stop orders after hours and queues them for the next
open, where they would fill before any trailing stop exists. Exits stay allowed.
*(Added 2026-10-13.)*

Manual commands (§11) obey all limits **except** `MAX_ORDERS_PER_DAY` and
`SYMBOL_COOLDOWN_MIN`.

There is **no** v1-style ATR trailing drawdown halt and no manual-reset kill
switch; `DAILY_LOSS_LIMIT` replaces both.

---

## 7. Session lifecycle

- **Open:** loop starts passes once Alpaca's clock reports open. No pass runs
  before ~60 min of warm-up bars are loaded (fetched via historical API at
  startup, so normally immediate).
- **Flatten:** at `close − FLATTEN_LEAD_MIN` (15:50 normal days, 12:50 on early
  closes — always derived from Alpaca's clock, never hard-coded): stop LLM passes,
  cancel all orders, market-sell all positions (manual included), verify flat.
- **After close:** reflection pass (§10) ~15 min after flatten.
- All orders are `DAY`; nothing carries overnight.

---

## 8. Market data and features

- **Feed:** Alpaca free plan, IEX. Websocket subscription to 1-min bars for the
  watchlist; historical bars API for warm-up. IEX is a subset of consolidated
  volume — prices/volumes differ slightly from SIP. Accepted.
- **Per-symbol feature row** (computed in Python, sent as a compact table):
  `symbol | last | %chg 1m / 5m / 15m / day | vs VWAP % | vol vs 20-bar avg |
  day hi / lo | RSI(14) | ATR(14) % | EMA9 vs EMA20 | score | position qty |
  avg cost | unrealized P&L | active stop (trail %, stop price) | source |
  cooldown remaining`
- **Signal score (0–100):** `50 + 50 × weighted mean` of components, each
  clipped to [−1, 1] and scaled by the symbol's own ATR so quiet ETFs and
  volatile stocks compare:
  - *momentum* — 15-min change ÷ (ATR·√15), saturating at 2;
  - *trend* — (EMA9 − EMA20) ÷ ATR;
  - *rsi* — 30→70 maps to −1→+1, then fades (80 → 0, 90+ → −1): overbought
    is not rewarded;
  - *volume* — surges only, `(last ÷ 20-bar mean − 1) / 2`, signed by 5-min
    direction;
  - *vwap* — distance from session VWAP ÷ 2·ATR.
  Default weights 0.25 / 0.25 / 0.15 / 0.15 / 0.20 (`config/defaults.yaml`).
  Weights are user-set in settings; the reflection pass may *propose* new
  weights, applied only on user approval.
- Bars outside 09:30–16:00 ET are dropped (IEX includes extended hours).
  Indicators use a cross-session buffer (warm at the open); VWAP, day high/low
  use the current session; day change is vs the prior session's last close.
- **Account block:** equity, cash, day P&L, orders used / `MAX_ORDERS_PER_DAY`,
  distance to `DAILY_LOSS_LIMIT`, minutes to flatten, open positions count.

Target prompt size ≈ 2–3k tokens.

---

## 9. LLM integration

- OpenAI-compatible `/v1/chat/completions` (Ollama). Settings:
  - `LLM_BASE_URL` default `http://host.docker.internal:11434/v1`
    (inside the container `localhost` is the container itself)
  - `LLM_MODEL` — dropdown populated from `/v1/models`
  - `LLM_TEMPERATURE` default 0.2
  - `LLM_TIMEOUT_SEC` default 45
  - "Test connection" button (round-trips a tiny prompt, shows latency)
- Structured output via `response_format` JSON schema.
- Only local hosts allowed for `LLM_BASE_URL` (localhost, 127.0.0.1,
  host.docker.internal, *.local) — same rule as `verify_qwen.py`.
- **Latency is the binding constraint.** A 27B model (e.g. `qwen3.8:27b`) may
  not fit a 45 s budget every minute on consumer hardware; the dashboard shows
  p50/p95 latency and skip/timeout rates so model choice is data-driven.
  Thinking/reasoning modes should be disabled for the per-minute pass.

**Measured 2026-10-13** (qwen3.8:27b, Ollama 0.40.3, this host;
`python -m trader.llm.bench`, real prompts replayed from the 2026-10-12 fixture):

| Mode | Latency | Output |
|---|---|---|
| thinking on (default) | 51 s on a 100-token prompt | sensible — but over budget |
| `think: false` | — | HTTP 500 "token repeat limit reached" |
| `reasoning_effort: none` + static schema | 5.8 s | garbage: 10 cancels of invented order ids |
| `reasoning_effort: none` + per-pass schema | p50 2.5–3.1 s, p95 ≤ 4.6 s, ~1.2–1.6k prompt tokens | 0 parse failures in 190 calls; all action types used correctly |

So the default is thinking **off** with a **per-pass narrowed schema**
(`trader/llm/schema.py`): `symbol` is an enum of the watchlist; `cancel` exists
only when there are cancellable orders and takes aliases `o1, o2…` mapped back to
Alpaca ids; `type` is first in each action; a short `analysis` field precedes
`actions` as a cheap scratchpad. The static Pydantic schema is still what the
parser and validator enforce.

**Behavior:** with an empty memory the model held all 38 sampled minutes of a
choppy day (its reasoning cited score/VWAP/volume correctly). With an activity-
encouraging *Pinned (user)* memory it traded, tightened trails on winners and
exited by close. Aggressiveness is therefore steered by memory/prompt, not a
code limit. The watchlist table carries a `maxbuy` column (largest share count
that passes every sizing rule, mirroring the validator) which cut rejections
from 30% to 22% of actions; the remainder are left to the validator — the LLM
proposes, Python disposes, no silent resizing.

---

## 10. Memory and learning

1. **Trade journal** (SQLite): every round trip with entry/exit actions, the
   feature row at decision time, the model's stated reason, fills, P&L, holding
   time, exit cause (`trailing_stop | sell | flatten | manual`), source.
2. **`/data/memory.md`**, capped ~1,500 tokens, injected into every prompt.
   Sections: *Rules that worked · Patterns to avoid · Per-symbol notes ·
   Current biases · Pinned (user)*.
3. **Reflection pass** once per session after flatten (no tight time budget):
   input = day's journal stats (win rate, avg win/loss, P&L by symbol and by
   trail %, early stop-outs) + current memory. Output = rewritten memory within
   the cap, plus optional proposed scoring-weight changes.
4. Every memory version is stored (`memory_versions`), diffable and
   restorable in the GUI. The *Pinned (user)* section is never rewritten by the
   model; user edits always win.

Memory is never updated intra-day.

*Implemented (phase 5):* `trader/memory.py`, `trader/reflection.py`. Cap 6,000
chars (≈1,500 tokens): the model's sections are trimmed from the end of the
longest; a user save over the cap is refused. A direct edit of `memory.md` on disk
is detected and versioned as a user edit. Reflection runs with
`reasoning_effort: medium`, 15-min timeout, and is skipped when there were no
round trips. Close-out (journal → daily P&L → reflection → backup) runs once per
session, 15 min after the flatten; if the app is down then, run `reflect` by hand.

---

## 11. Commands

A single command layer (`trader/commands.py`) used by the API (GUI) and the CLI.

- **Trade:** `buy`, `stop_buy`, `sell`, `adjust_trail`, `cancel` — same shapes
  as §5, `source=manual`. Manual buys also require `trail_percent`.
- **Control:** `pause`, `resume`, `flatten` (GUI confirm), `cancel-all`,
  `reflect`. `pause` stops LLM passes only (§4). `flatten` sells everything and
  **pauses** the engine (resume to let the LLM trade again). `cancel-all` cancels
  every order **except protective stops** — cancelling those would leave
  positions naked.
- **CLI:** `docker exec trader python -m trader <command> ...`
  (e.g. `python -m trader buy NVDA 10 --trail 3`) — calls the local API.
- Positions carry `source = manual | llm` and `llm_managed` (manual default
  false). The GUI can toggle `llm_managed` per position.

---

## 12. Storage

SQLite at `/data/trader.db` (WAL mode). Tables (indicative):

`settings` · `watchlist` · `scoring_weights` · `passes` · `actions` (proposed,
validation result, reason) · `orders` (mirrors Alpaca, incl. stops) · `fills` ·
`positions_snapshots` · `round_trips` (journal) · `daily_pnl` ·
`memory_versions` · `weight_proposals` · `engine_state` (running/paused, last
pass) · `events` (halts, flattens, reconciliations, errors).

Exports: CSV/JSON of trades and orders from the GUI. Nightly copy of the DB to
`/data/backups/` (keep last 14).

*Implemented (phase 5):* `trader/store/` — `db.py` (schema v1 via
`PRAGMA user_version`), `journal.py` (round trip = one symbol's flat→flat
lifecycle; exit cause from the closing order: trailing stop / LLM sell / manual /
`sys-` market sell = flatten), `records.py`. `positions_snapshots` is replaced by
an `equity` column on `passes` (the dashboard equity curve). Minute passes while
the market is closed are not stored. The order mirror is refreshed after every
pass or command that touched the broker, so the journal never lags a fill.

Git is for code only — no more state commits.

---

## 13. GUI

React + TypeScript (Vite), built into the image, served by FastAPI. Live
updates over a WebSocket. Pages:

1. **Dashboard** — equity / day P&L curve, open positions with live stop levels,
   loop status (running / paused / halted / flat), LLM health (latency, skip
   and parse-fail rates), order ticket, control buttons.
2. **Orders** — open/pending (incl. trailing stops), full history, filters.
3. **Trades** — journal of round trips, entry/exit reasons, P&L, CSV export.
4. **Decisions** — every pass: features seen, raw output, actions, rejections.
5. **Settings** — watchlist (validated against Alpaca assets, cap 25), risk
   limits, per-symbol caps, scoring weights, LLM connection.
6. **Memory** — `memory.md` editor, version history/diff/restore, pending
   weight proposals to approve/reject.

Bound to `127.0.0.1` only. No auth in v2; remote access requires adding auth
or a private network (e.g. Tailscale) first.

---

## 14. Deployment

- `docker compose` single service `trader`:
  `restart: unless-stopped`, ports `127.0.0.1:8000:8000`, volume `./data:/data`,
  `env_file: .env`, `extra_hosts: host.docker.internal:host-gateway`,
  `HEALTHCHECK` on `/healthz`.
- `.env`: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_ENV=paper|live`,
  `I_UNDERSTAND_LIVE_TRADING` (default unset). Secrets never in the image or DB.
- **Live mode** requires `ALPACA_ENV=live` **and**
  `I_UNDERSTAND_LIVE_TRADING=true` + restart; no GUI toggle. The app refuses to
  start live with equity < $25k (pattern day trader rule) and shows a permanent
  red LIVE banner.
- Time: all market logic in `America/New_York` via Alpaca's clock; host TZ
  irrelevant.

### Startup / recovery

*Implemented (phase 5):* `trader/runtime.py` + `python -m trader serve`. The LLM
is warmed at startup and ~10 min before each open (a cold model load took 43 s,
which would time out the first pass).

1. Load settings, restore `engine_state` (resume if it was running, stay paused
   if paused).
2. Reconcile with Alpaca: import positions/orders, cancel stale entry orders,
   **place a trailing stop on any unprotected position**.
3. If started after the flatten time with open positions → flatten immediately.
4. Warm up bars, then start the loop.

---

## 15. Folder structure (target)

```
trader/                 Python package (python -m trader)
  broker/               Alpaca client (from lib/alpaca_client.py), stream
  engine/               loop, features, scoring, reconciliation, flatten
  llm/                  OpenAI-compatible client, prompt builder, schema
  risk/                 validator (from lib/validator.py pattern)
  store/                SQLite schema, repositories, migrations
  api/                  FastAPI routes + WebSocket
  actions.py            action schema + decision parser (LLM and manual)
  settings.py           typed risk settings
  commands.py           shared command layer
  __main__.py           CLI
web/                    React + Vite app
config/defaults.yaml    seed settings (from state/config.yaml)
tests/
archive/v1/             v1 design, routines, state
Dockerfile, docker-compose.yml, .env.example
```

---

## 16. Migration from v1

| v1 piece | Fate |
|---|---|
| `lib/alpaca_client.py` | Refactor into `trader/broker/` — keep retry/transient logic, clock, snapshot; add stop/trailing/replace/cancel, bars, stream; env-var creds |
| `lib/validator.py` | Rewrite to per-action rules; keep `ValidationResult` + collect-all-violations pattern |
| `lib/plan_schema.py` | Replaced by action schema |
| `lib/executor.py` | Retired (weights→deltas no longer applies); notional cap moves to validator |
| `lib/drawdown.py` | Retired (replaced by `DAILY_LOSS_LIMIT`) |
| `lib/state.py` | Retired (SQLite); keep atomic-write helper for `memory.md` |
| `lib/config.py` | Refactor to settings seeding |
| `cli.py` | Retired; `liquidate` → `flatten` command |
| `routines/`, `DESIGN.md` | Moved to `archive/v1/` |
| scheduled tasks `claude-trader-eod-trade`, `-post-close-summary` | Prompts replaced with no-op stubs 2026-10-12 (originals in `SKILL.md.v1-backup`); disable in the Claude Code Scheduled sidebar |
| `state/` | Move to `archive/v1/state/`; not imported. `universe.yaml` informs initial watchlist |
| `pandas-market-calendars` | Dropped |
| tests (148) | Keep/adapt client, validator-pattern and config tests; rewrite the rest |

---

## 17. Build phases

1. **Broker:** extend Alpaca client (orders, stops, replace, cancel, bars,
   stream) with tests against a fake.
2. **Schema + risk:** action schema, validator, settings — test-first.
3. **Engine:** loop, features/score, reconciliation, flatten — driven by a fake
   LLM and fake broker; replay a recorded day. *Done 2026-10-13:*
   `python -m trader.engine.replay run tests/fixtures/session_2026-10-12.json`.
4. **LLM:** Ollama client, prompt builder, structured output, latency metrics.
   *Done 2026-10-13:* `trader/llm/` (config, schema, prompt, client, decider,
   health, bench).
5. **Store + API:** SQLite, FastAPI routes, WebSocket, command layer, CLI.
   *Done 2026-10-13:* `trader/store/`, `memory.py`, `reflection.py`,
   `commands.py`, `runtime.py`, `api/app.py`, `__main__.py`; smoke-tested live
   against paper Alpaca + local Ollama.
6. **Web:** React pages. *Done 2026-10-13:* `web/` (Vite + React + TS) in the
   owner's Kiln visual system (`web/design.md`); product record in `PRODUCT.md`.
   Session page = day band + the session chart (equity over a 390-minute status
   strip; click a minute for the pass sheet: analysis, verdicts, prompt, raw
   reply); Decisions, Trades, Orders, Memory (diff/restore, weight proposals),
   Settings; Manage drawer for controls and the manual order ticket. Amber marks
   gains only; losses are plain text with a minus (no red/green). Served by
   FastAPI from `web/dist` with SPA fallback. `python -m trader.demo` serves a
   replayed, labelled demo session for UI work.
7. **Docker:** Dockerfile (multi-stage), compose, healthcheck, `.env.example`.
   *Done 2026-10-13:* node:24 builds `web/`, python:3.14-slim runs it as uid
   10001 (446 MB). Verified with compose against the paper account: healthy,
   published on 127.0.0.1 only, IEX stream connects, Ollama reachable at
   `host.docker.internal`, state persists in `./data`, SIGTERM shuts down
   cleanly and the pause flag survives a restart. Runtime deps only in the image
   (`requirements.txt`); tests and v1's pandas are in `requirements-dev.txt`.
8. **Paper soak:** run supervised; reflection + memory loop on. Live remains
   locked until 20+ sessions show positive expectancy after realistic slippage.
   *Started 2026-10-14 (first session):* watchlist = SCHD's top 25 holdings;
   *Pinned (user)* memory seeded with an activity bias (entries at score ≥ 60
   above VWAP with rising 15m momentum, ~5% of equity, 1.5% trail, tighten to 1%
   at +0.5%, sell under score 40) because an empty memory held all day in
   testing. Pre-run check on a real 25-symbol prompt: ~3k prompt tokens,
   ~3.7 s per warm call, valid and consistent decisions. Out-of-RTH order
   acceptance remains an open item, deferred; entries are now blocked while the
   market is closed (§6), so it only matters for exits placed after hours.

---

## 18. Open items

- ~~Verify Alpaca constraints~~ — paper-tested 2026-10-13 (1 SPY share):
  market buy/sell, trailing stop sell (hwm + stop_price populated at submit),
  stop buy accept/cancel all work. Trailing stop as OTO leg: rejected.
  `replace` returns a new order id; the old one goes to `replaced`. The
  replacement gets a bare-UUID client_order_id unless one is sent, so
  `replace_trail` now requires the owner prefix. Still open: acceptance windows
  outside RTH.
- ~~Pick the default model by measured latency~~ — qwen3.8:27b with thinking off
  fits easily (§9). Re-run the bench if the model or host changes.
- ~~Reflection pass~~ — phase 5.
- Initial watchlist seed (14 liquid names: AAPL AMD AMZN GOOGL IWM META MSFT NVDA
  QQQ SPY TSLA XLE XLF XLK) is a placeholder; curate before the paper soak. v1's
  bond/staples ETFs barely move intraday.
- Default prompt may be too passive to generate learning data; decide during the
  paper soak whether to seed *Pinned (user)* memory with an activity bias.
- ~~Exact scoring formula and default weights~~ — §8 (phase 3).
- ~~Partial-fill handling~~ — the protect step keeps stop coverage equal to
  held whole shares every pass: tops up as fills arrive, re-places if stops
  ever cover more than held (which could otherwise go short).
- Early-close days: bars 13:00–16:00 ET are not filtered as after-hours. Harmless
  (flatten is clock-derived) but features on those bars are wrong.
- Replay fills are idealized (market at last close, stops at stop price or the
  gap open); real slippage is worse. Treat replay P&L as an upper bound.
