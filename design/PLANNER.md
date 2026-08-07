# Ask Juniper — the AI Financial Planner

**Status:** design for review · **Stage:** 11 (elevated from a post-launch fast-follow to a core surface)

---

## 1. The idea in one line

Juniper has two layers. The **dashboards are the financial-advisor layer** — an
amalgamation of every linked account and its balances, distilled into the Juniper
Score. The **chat is the financial-planner layer** — an AI planner that sees all of
that same data and turns it into tailored, plain-English advice, grounded plans, and
a polished PDF you can act on.

> Advisor tells you *where you stand*. Planner tells you *what to do next* — and hands
> you the steps on paper.

---

## 2. What the planner is (and isn't)

**It is:**

- A single AI planner that knows the user: their real linked accounts, balances,
  cash-flow, debts, investments, Juniper Score, and every plan they've built.
- Reachable two ways:
  - **Global "Ask Juniper"** — a persistent surface for anything: *"how do I open a
    HYSA or a brokerage?"*, *"best state to open a new LLC?"*, *"how do I plan for
    $500k of private school while saving to buy back the $1.8M family home?"*
  - **Plan-scoped "Ask about this plan"** — enters the same planner already primed
    with one plan's numbers: on the Baby fund, *"how do I plan for my child's
    education?"* → a grounded answer about 529s, contribution pace, and the user's
    own timeline.
- **Grounded** — it reads the user's actual figures server-side via tool use, not a
  string the browser hands it. It never invents a balance.
- **Backed by curated knowledge** — a retrieval layer of vetted personal-finance and
  family-office material so answers on 529s, HYSAs, entity selection, and estate
  basics are accurate and current, not model recall.
- **Able to produce a deliverable** — a clean, well-formatted **PDF plan** with the
  recommendation, the reasoning, and a numbered action list.

**It isn't:**

- A licensed advisor, CPA, or attorney. It gives **educational guidance**, frames
  decisions, and always points to a professional when a decision is legally or
  fiscally binding (entity formation, tax elections, estate documents). Disclaimers
  are built into the product, not bolted on.
- A trading or account-opening actuator. It explains and links; it does not move money.

---

## 3. Where it lives in the app

| Surface | Entry point | Primed with |
|---|---|---|
| **Global planner** | "Ask Juniper" in the app bar (personal *and* shared workspaces) | Full finance snapshot + all plans + Score |
| **Plan-scoped planner** | "Ask about this plan" button on any plan page | That plan's goal, KPIs, milestones, next actions + the same global snapshot |
| **PDF export** | "Save as plan (PDF)" inside any planner thread | The current conversation's synthesized plan |

Both entry points open the *same* planner with the *same* grounding — the plan-scoped
one just pre-loads a focus. This is the honeydue-style principle we used for the
partner work: one coherent surface, contextual entry points.

The existing `api/chat.ts` (global) and `api/plan-chat.ts` (plan-scoped) are the
**seams we grow from** — today they stream `claude-sonnet-4-6` with grounding passed
as a trusted client string. The planner replaces that with server-fetched grounding,
`claude-opus-5`, retrieval, and export.

---

## 4. Architecture

### 4.1 One streaming endpoint, tool-grounded

`POST /api/planner/chat` (Vercel Edge, SSE stream — same shape the current chats
already use, so the client streaming code carries over).

```
Browser (Ask Juniper)  ──JWT──▶  /api/planner/chat  (Edge)
                                     │
                                     ├─ verifySupabaseJwt → uid            (identity)
                                     ├─ Anthropic Messages API (stream)
                                     │     model: "claude-opus-5"
                                     │     thinking: { type: "adaptive" }
                                     │     tools: [ get_finances,
                                     │              get_plans,
                                     │              get_score,
                                     │              search_knowledge ]
                                     │
                                     └─ tool calls resolved SERVER-SIDE, scoped by uid:
                                          get_finances    → _finance-snapshot.fetchScoreInput(uid)
                                          get_plans       → plans table (uid)
                                          get_score       → score_history / _score (uid)
                                          search_knowledge → curated KB retrieval
```

**Why tool use instead of stuffing context?** Three reasons:

1. **Trust.** Grounding is fetched with the service-role key and scoped to the JWT's
   `uid` on the server — the browser can't spoof balances by editing a request body
   (today's `profileContext` / `plan` params are client-supplied and therefore
   advisory at best).
2. **Efficiency.** The model pulls only what a given question needs. A general LLC
   question never loads the user's transactions; a "can I afford this?" question does.
3. **Freshness.** Every answer reflects the live snapshot, not a cached string.

`get_finances` is already written — it's exactly `fetchScoreInput(uid)` in
`api/_finance-snapshot.ts`, returning `{ linked, input, signals }` (income, spending,
cash reserves, card vs. loan debt, investments, emergency-fund months, annual income).
We wrap it as a tool; no new data plumbing.

### 4.2 Model & generation settings

- **Model:** `claude-opus-5` — this is the planner's reasoning tier; the stakes
  (real money, multi-goal trade-offs) justify Opus.
- **Thinking:** adaptive thinking (`thinking: { type: "adaptive" }`) is the target so
  the planner reasons about competing goals ($500k tuition vs. $1.8M home) with
  disciplined trade-off math. Deferred until the Anthropic SDK is bumped and validated
  on Vercel Edge as its own change — the pinned `^0.37.0` predates adaptive-thinking
  streaming, and P1 ships on opus-5 without it rather than risk the deploy.
- **Streaming:** always. Use the SDK stream and `.finalMessage()` when we need the
  assembled turn (e.g. before a tool round or a PDF synthesis). Prevents Edge timeouts
  on long answers.
- **SDK:** `@anthropic-ai/sdk` (`new Anthropic({ apiKey })`), already a dependency.

### 4.3 Knowledge retrieval (`search_knowledge`)

A curated, versioned knowledge base — not the open web — so factual answers are vetted
and consistent:

- **Content:** short, sourced notes on account mechanics (HYSA, brokerage, Roth/
  traditional, 529, HSA, UTMA), entity basics (LLC/S-corp, state-of-formation trade-
  offs at a *general* level), estate and family-office primers, and contribution/limit
  reference values with an "as-of" year stamp.
- **v1 mechanism:** a small embedded KB (curated markdown → chunked) retrieved by
  keyword/embedding match, returned to the model as tool results with citations. Kept
  intentionally small and hand-reviewed for launch.
- **Compliance value:** every knowledge-grounded claim carries a source and an as-of
  date, so numbers (contribution limits, etc.) are auditable and can't silently drift.
- **Future:** swap the retrieval backend (managed vector store / web-fetch tool for
  time-sensitive facts) behind the same `search_knowledge` tool signature.

### 4.4 PDF plan export

When the user asks to "save this as a plan," or taps **Save as plan (PDF)**:

1. The planner synthesizes the thread into a **structured plan object** via a
   structured-output call (`output_config.format`) — headline, situation summary,
   recommendation, numbered steps (each with rationale + rough timeline/amount),
   assumptions, and the disclaimer block.
2. That object renders into a branded HTML template (Juniper `.jnpr` tokens, same
   type system as the app) → **HTML→PDF**.
3. Returned as a downloadable file and (optionally) saved to the user's plans so it's
   retrievable later.

Rendering from a structured object (not free-form model prose) keeps every PDF
consistently formatted and lets us guarantee the disclaimer is always present.

---

## 5. Grounding the hard questions

The three example questions map cleanly onto the tools:

| User asks | Tools the planner pulls | Shape of the answer |
|---|---|---|
| *"How do I open a HYSA or brokerage?"* | `search_knowledge` | Educational walk-through, vetted steps, "here's what to compare," no specific-product endorsement |
| *"Best state to open a new LLC?"* | `search_knowledge` | General trade-offs (home-state vs. Delaware/Wyoming, franchise tax, foreign-registration cost), then **"confirm with a CPA/attorney for your situation"** |
| *"$500k private school + buy back the $1.8M family home"* | `get_finances`, `get_plans`, `get_score`, `search_knowledge` | Grounded multi-goal plan off the user's real cash-flow and assets: fundable pace for each, the trade-off, sequencing, funding vehicles (529, taxable), and a **PDF** |

The last one is the flagship: it's exactly what a family-office planner does, and it's
only possible because the planner sees the real numbers.

---

## 6. Compliance guardrails (built in, non-negotiable)

1. **Framing:** the planner is an *educational guide and thinking partner*, not a
   fiduciary. The system prompt states this; the UI states this; every PDF states this.
2. **Escalation triggers:** entity formation, tax elections, estate/legal documents,
   and any state-specific legal question always append *"this is general information —
   confirm with a licensed CPA/attorney before you act."*
3. **No fabricated figures:** the model is instructed to source any limit/threshold
   from `search_knowledge` (with its as-of year) or ask the user, never to recall from
   memory.
4. **No product pushing:** educational comparisons, not "open account X." Keeps the
   planner's advice clean of the marketplace's affiliate layer — trust boundary intact.
5. **Auditable:** knowledge answers carry citations; the PDF records assumptions and
   the disclaimer.
6. **Scoping:** all grounding tools resolve server-side against the JWT `uid`. The
   planner can never read another user's data; partner data only appears through the
   already-built partnership scoping.

---

## 7. Phased build sequence

Each phase ships independently and leaves the app working.

- **P1 — Grounded chat.** Stand up `POST /api/planner/chat` on `claude-opus-5` +
  adaptive thinking with the `get_finances` tool (wrapping existing
  `fetchScoreInput`). Migrate the global "Ask Juniper" surface onto it. *Outcome: the
  planner answers off the user's real numbers, server-verified.*
- **P2 — Plan-scoped entry + `get_plans`/`get_score`.** Add the plan and score tools;
  wire "Ask about this plan" to open the planner pre-focused. Retire the trusting
  client-passed `plan`/`profileContext` params. *Outcome: one grounded planner, two
  entry points.*
- **P3 — Knowledge retrieval.** Ship the curated KB + `search_knowledge`, with
  citations and as-of stamps. *Outcome: accurate HYSA/529/LLC/estate answers.*
- **P4 — PDF plan export. ✅ Shipped.** `POST /api/planner/report` synthesizes the
  conversation into a structured plan via forced tool-use, rendered into a branded
  sheet and saved to PDF via the browser's print-to-PDF (no dependency; print CSS
  isolates the sheet). The report is saved to the thread by default and re-openable.
  *Outcome: the family-office deliverable.* (Built on opus-5; when the SDK bump lands,
  it inherits adaptive thinking with the rest of the planner.)

Partner-chat (the shared workspace's human-to-human thread) and the AI planner
**coexist** — the planner is the AI layer, partner-chat is the couple's own
conversation. They don't merge.

---

## 8. Decisions (defaults chosen — open to change)

1. **KB scope for launch** → the lean list: HYSA, brokerage, Roth/traditional, 529,
   HSA, LLC basics, estate primer. Each note carries an "as-of" year. We widen after
   launch based on what people actually ask.
2. **PDF persistence** → **save by default.** Every exported plan is saved to the
   user's account (retrievable later) *and* downloaded. A plan you can't find again
   isn't a plan.
3. **Plan-scoped strictness** → **answer briefly, then steer back** (keep the current
   `plan-chat` behavior). Hard refusals feel broken; a gentle redirect keeps one
   coherent planner.
4. **Partner visibility** → **personal-only in v1.** The planner reasons over the
   signed-in user's own accounts. Household-aware planning (both partners' shared
   accounts) is a fast-follow once the personal planner is solid.

## 9. Chat surfaces & threads (added scope)

The planner is reachable as its own destination, not only from a plan:

- **Standalone "Ask Juniper"** — a top-level nav item and page (`/app/ask`),
  separate from Plans. This is the home of general questions.
- **Multiple chats** — a left rail lists your chat threads with a **New chat**
  button; each thread keeps its own history. v1 stores threads in the browser
  (localStorage); server-synced threads are a fast-follow.
- **Plan FAQs** — every plan surfaces a short set of the questions people actually
  ask about that goal (Baby → *"How can I plan for my child's education?"*; Home →
  *"How much home can I afford?"*). Tapping one opens the planner in a new,
  plan-scoped thread with the question pre-asked. There's also a plain **"Ask
  Juniper about this plan"** entry for anything else.

So: plan-scoped chats are seeded *from* a plan but live *in* the same Ask Juniper
surface, alongside your general chats — one planner, many threads, two ways in.
