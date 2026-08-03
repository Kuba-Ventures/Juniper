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
- **Thinking:** `thinking: { type: "adaptive" }` — the planner reasons about
  competing goals ($500k tuition vs. $1.8M home) and shows disciplined trade-off math.
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
- **P4 — PDF plan export.** Structured-output plan synthesis → branded HTML → PDF,
  downloadable and saved to plans. *Outcome: the family-office deliverable.*

Partner-chat (the shared workspace's human-to-human thread) and the AI planner
**coexist** — the planner is the AI layer, partner-chat is the couple's own
conversation. They don't merge.

---

## 8. Open questions for review

1. **KB scope for launch** — how broad should the v1 curated knowledge base be? (Lean
   list: HYSA, brokerage, Roth/traditional, 529, HSA, LLC basics, estate primer.)
2. **PDF persistence** — save every exported plan to the user's account by default, or
   download-only until they opt to save?
3. **Plan-scoped strictness** — should the plan-scoped planner refuse off-topic
   questions and redirect to global, or answer briefly then steer back (current
   `plan-chat` behavior)?
4. **Partner visibility** — in the shared workspace, is the planner household-aware
   (sees both partners' shared accounts) from day one, or personal-only in v1?
