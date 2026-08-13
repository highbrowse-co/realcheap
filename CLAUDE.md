# CLAUDE.md

## What this is

A prototype built for a Cover Genius Client Solutions Engineer interview panel. It demonstrates
embedding XCover protection into a mock e-commerce checkout for a fictional marketplace called
**RealCheap** — an online marketplace selling heavily discounted, largely unbranded,
direct-from-factory consumer goods, shipping across US, CA, GB, IT, FR, ES, DE.

The audience is a panel of solutions engineers and a global director of solutions engineering,
several of them ex-developers. They will read the code, watch a live demo, and ask why things
were built the way they were. Assume every file will be read by someone technical and sceptical.

**Functional integrity beats aesthetics.** A transparent, working integration against the live
sandbox is the goal. Do not spend effort on visual polish beyond what makes the checkout
legible as a checkout.

## Hard constraints

1. **The XCover API uses HMAC signature authentication and is server-to-server only.** The API
   key and secret must never reach the browser. All XCover calls go through the backend proxy.
   If you ever find yourself putting a credential in frontend code, stop.
2. **Never invent an endpoint, field name, policy type, or response shape.** Fetch the current
   documentation and verify. Cover Genius publishes partner docs at
   `partner-docs.covergenius.com` and `docs.covergenius.com`, with a documentation index at
   `llms.txt`. Public SDK examples on GitHub (`CoverGenius/xcover-python`, `CoverGenius/xcover-php`)
   are several years old — treat them as hints about shape, not as truth.
3. **If the docs are ambiguous, say so and stop.** Do not guess and proceed. Ambiguities go in
   `docs/OPEN-QUESTIONS.md` so they can be asked of Cover Genius directly. An unasked question
   is worse than an unbuilt feature.
4. **Everything must run without live credentials.** A `MOCK_MODE` env flag serves recorded or
   hand-written fixture responses. Switching to live must be an env change only, never a code
   change.
5. **Every commit updates `docs/DECISIONS.md`** — see below. This is not optional housekeeping;
   it is a graded deliverable.

## Architecture

```
/server        Express + TypeScript. Signs and proxies XCover calls.
               Captures the full outbound request and inbound response for
               each call and returns them alongside the domain payload.
/web           Vite + React. Mock RealCheap product page and checkout.
               Renders the protection offer and an inspector panel showing
               the captured request/response.
/fixtures      Recorded sandbox responses for MOCK_MODE and for tests.
/docs          DECISIONS.md, OPEN-QUESTIONS.md, ARCHITECTURE.md
```

The inspector panel is a first-class feature, not a debug tool. It is how the panel validates
that calls are real. Show method, URL, headers (with the HMAC signature and key redacted),
request body, status code, latency, and response body.

## Scope

**In scope — build these properly:**
- Retrieve and display a protection offer for a sample electronics product (a laptop) in a mock
  checkout, showing product details and what is covered
- Opt in and decline, with both paths correctly reflected to XCover
- Live request/response visible in the frontend inspector
- Market selector driving currency and customer country across the seven target markets
- Quantity-based rating on a multi-unit line item
- Cancellation, demonstrating how duplicate compensation is avoided when RealCheap issues its
  own refund

**Out of scope — these get an architecture diagram and a verbal answer, not code:**
- Real-time SKU and category eligibility rules engine
- Webhook receiver for claim status (document the design; do not build a listener)
- Settlement and reconciliation
- Authentication, persistence, or anything resembling a real order management system
- Any styling work beyond legibility

If a request would expand scope beyond this list, flag it rather than building it.

## docs/DECISIONS.md

Append an entry whenever a non-obvious choice is made. Entries are short:

```
### <date> — <decision>
Context: what prompted it
Choice: what was decided
Alternatives rejected: and why
AI note: what was generated vs. hand-written; anything the model got wrong and how it was caught
```

The AI note matters. The panel will ask specifically what the model produced, what was
inaccurate, where manual intervention was required, and how generated code was validated.
Record hallucinated endpoints, wrong field names, and incorrect auth assumptions **at the moment
they happen** — reconstructing them afterwards produces obviously vague answers.

## Working style

- Small, reviewable commits with meaningful messages. The commit history is part of the artifact.
- No dead code, no commented-out experiments, no unused dependencies in the final state.
- Prefer boring, explicit code over clever abstraction. This is read-once code for an audience
  evaluating clarity.
- The HMAC signing function gets a unit test against a known vector. If the signing is wrong,
  nothing works, and it is the one place a subtle bug is expensive.
- `README.md` must contain working run instructions from a clean clone. This is an explicit
  submission requirement and it will be tested.

## Commands

```
npm run dev        # server + web concurrently
npm run test       # unit tests
npm run lint
```
