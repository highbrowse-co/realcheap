# Why

Decisions where a competent engineer would reasonably have chosen differently — not the obvious
scope calls already justified in `docs/ARCHITECTURE.md`'s "Out of scope" section, the arguable
ones. Each states the alternative and the actual reason, not just the choice.

## The proxy always returns HTTP 200, real status lives inside `capture`

**A different engineer would**: mirror XCover's HTTP status onto the proxy's own response — it's
the more RESTful, more conventional choice, and it's what this project's own `docs/DECISIONS.md`
originally described doing.

**Why not**: a `204` (Opt Out) has no body by HTTP spec, and Node strips a `204` response's body
even when you explicitly call `.json()` on it — so mirroring the status silently dropped the
`capture` envelope the Inspector needs, for exactly that one endpoint. Decoupling "did our own
server handle the request" from "what did XCover actually say" fixed it without adding a special
case for one status code. The cost: a REST-literate reviewer's first instinct on seeing `200`
everywhere is that error handling was skipped, when the real status is one field away in the body.

## Per-endpoint functions in `xcoverClient.ts` instead of one generic dispatcher

**A different engineer would**: write `callXCover(method, path, body, mockFixture?)` once and
parameterize it — less code, one place to fix a cross-cutting bug.

**Why not**: CLAUDE.md states a preference for boring, explicit code over abstraction for
exactly this size of surface (four operations). Four short, top-to-bottom-readable functions
were judged easier for an unfamiliar reader to verify than one generic function plus a
path-matching table. This traded a small amount of duplication (the `mockRequestHeaders()` /
`urlFor()` helpers exist specifically to keep that duplication from spreading) for not needing to
mentally execute a dispatcher to know what a given call does.

## MOCK_MODE fixture matching is exact-key-or-nothing, not interpolated

**A different engineer would**: build a small approximation — linear-interpolate between the
recorded quantities, or apply the nearest market's price as a rough stand-in for an unrecorded
combination — so MOCK_MODE never shows an empty state.

**Why not**: any interpolation is inventing a number XCover never actually returned, which is
exactly what CLAUDE.md's hard constraint against inventing data is warning about, applied to
prices instead of field names. The chosen trade was covering all 35 real combinations the UI can
reach (Phase 5) rather than approximating the rest — more live API calls up front, zero
fabricated numbers ever shown as if real.

## Confirmed-working "more correct" mechanisms (idempotency key, two-step cancel) weren't adopted into the app

**A different engineer would**: once you've proven `x-idempotency-key` and `confirm_cancellation`
are the documented-correct mechanisms and confirmed they work live, swap the app over to them —
leaving known-inferior mechanisms in place after finding better ones can look like not following
through.

**Why not**: Session 2's brief was explicit — "do not rebuild anything that works, do not
restructure the codebase." The existing mechanisms (a 422-based double-confirm guard, a
single-call cancel) are demonstrated working against live and aren't broken. This is a real
trade-off, not a free choice: the app is provably *not* using the mechanism Cover Genius's own
docs present as intended, and that's a fair thing for a panelist to push on (`docs/PANEL-QA.md`
#9 answers it directly rather than avoiding it).

## Fields that can't be honestly derived in MOCK_MODE are nulled, not omitted or estimated

**A different engineer would**: either leave the static fixture's original value in place (looks
more complete) or drop the field from the mock response shape entirely (avoids the question).

**Why not**: leaving the static value is exactly the bug Phase 5 found and fixed (a fabricated
number presented as real); dropping the field changes the response shape between live and mock
mode, which the Inspector's whole design tries to avoid — mock and live should look structurally
identical, differing only in a `mock: true` flag and, now, an explicit `mockNote`/`null` where
something genuinely isn't known. `null` was chosen as the one value that's honestly "we don't
know this" without changing the shape.

## `App.tsx` holds all state in one component, not split further or moved to a reducer

**A different engineer would**: with four independent action handlers each following a
try/catch/branch-on-networkError/branch-on-status shape, and 12+ pieces of `useState`, this is a
reasonable candidate for `useReducer` or splitting into sub-components with their own state.

**Why not**: CLAUDE.md caps styling/architecture effort at "what's needed for legibility" for a
single linear checkout flow — a reducer adds a layer of indirection (action types, a reducer
function) for a flow that's genuinely linear and small enough to read top-to-bottom as-is. This
is the one on this list that's closest to a coin flip; the file has grown across five phases of
additions without a structural pass, and a reducer would probably read better today than it
would have on day one.

## The 10-second outbound timeout is a stated assumption, not derived from anything Cover Genius published

**A different engineer would**: pick a more conservative default (30s, matching common HTTP
client defaults) rather than a value derived from ~30 observed calls on one sandbox.

**Why not**: no published SLA exists to anchor to (checked directly, not assumed absent), and
30s would mean a demo audience watches a "loading" state for half a minute before the fail-open
path kicks in — 10s (>3x the worst observed latency) was chosen to bound *demo* wait time, which
is a reasonable priority for this specific artifact but a debatable one for a production
integration, where false "unreachable" classifications under real load would matter more than
demo pacing. Marked `// ASSUMPTION:` in code and logged in `docs/OPEN-QUESTIONS.md` #6
specifically because it's a judgment call, not a fact.

## Playwright verification is throwaway (scratchpad), not a committed test suite

**A different engineer would**: given Playwright caught two real, otherwise-undiscovered bugs
this session, commit it as `@playwright/test` and keep the scripts as a regression suite.

**Why not**: CLAUDE.md's one stated testing requirement is the signing unit test; committing a
browser-automation dependency and suite is a real, useful addition but is scope beyond what was
asked, and "no unused dependencies in the final state" argues against adding tooling the project
brief didn't call for. This is flagged as a real gap, not defended as clearly correct —
`docs/PANEL-QA.md` #13 and `docs/WEAKEST-POINTS.md` both say so directly rather than treating the
throwaway choice as free of cost.
