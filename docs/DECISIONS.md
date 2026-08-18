# Decisions

## Key decisions

The decisions below most affect how to read this codebase and this file — prioritised for
decisions a reviewer would question, decisions a competent engineer might have made differently,
and AI notes where generated output was wrong and how that was caught. Ordered newest to oldest,
matching the full log below. Each links to its full entry by title, not date.

**Chose to leave a known, real, live-reproducible bug unfixed, on principle.** A blind review
found Cancel Booking's mock response leaves a stale, currency-mismatched `total_price` next to a
correctly-overridden refund figure — easy to fix, and not fixed, because that session's explicit
criteria for what to patch (a fabricated field in a tracked doc, or a broken clean clone) didn't
include it. AI note: recording the choice not to fix a real bug, rather than
fixing it quietly, is presented as the actual point of "prefer reporting over fixing" — a direct
test of restraint right after the immediately preceding phase's own rushed fix had caused new
errors.

**A systematic field-name audit found the auditor's own prior fix was wrong.** After a
presentation-layer session found and "fixed" two fabricated field names in `ARCHITECTURE.md`,
this phase's ~140-citation sweep found that fix itself had replaced one real field with a
different, wrong one from a different endpoint — an uncomfortable finding about the project's own
self-correction process, not about the original code. AI note: the earlier phase had described
its fix as "verified" — that verification was a keyword match, not a check against the specific
endpoint the sentence was actually describing, exactly the gap a full path check catches and a
keyword search doesn't.

**A presentation-layer pass introduced the field-name errors the next audit found.** While writing
`CONSIDERATIONS.md`, checking cited fields against real captures surfaced that `ARCHITECTURE.md`'s
settlement section had two field names that didn't actually exist under those names — fixed at
the time, but, per the following phase, fixed incompletely. Separately, chose to render
`negative_cta_warning` as an always-visible inline note rather than a blocking confirmation
dialog specifically to avoid touching action-guard logic that was out of scope that session — the
safer of two options the brief offered, not a unilateral call.

**A previous session's freeze-discipline call was reversed as the wrong one.** An earlier pass had
ranked a double-click race as the single most likely demo failure and left it unfixed on the
reasoning that fixing it would mean "restructuring" — this phase judged that reasoning wrong (the
instruction was about structural change, not about leaving a known, additive-fixable bug in
place) and added both an in-flight button guard and `x-idempotency-key` support. Verified live,
including firing two genuinely simultaneous confirms with the same key and confirming no
duplicate booking was created even under real concurrency.

**`App.tsx` holding all flow state in one component is called out as close to a coin flip.**
Explicitly the one architectural choice in the project judged closest to a genuine toss-up rather
than clearly correct — the file has grown across many phases without a structural pass, and a
`useReducer`-based decomposition would probably read better today than it would have on day one.
The entry spells out exactly what that production decomposition would look like, without building
any of it.

**A compliance pass violated the exact rule it was enforcing.** While making `MOCK_MODE` genuinely
zero-config, the first four commits of the phase went in without updating this file — directly
breaking CLAUDE.md's "every commit updates DECISIONS.md" rule in the act of doing a
freeze-readiness pass. Caught on review and corrected in a dedicated follow-up commit rather than
amended in place.

**A MOCK_MODE price bug only existed at the seam between two otherwise-correct pieces.**
Confirming any plan in mock mode showed one static fixture's price regardless of what was
actually offered — neither the market-aware Create Offer work nor the untouched static Confirm
Offer fixture was wrong in isolation; only actually clicking through the full flow in a browser
surfaced the contradiction. A clear example of why reading the code, even carefully, wasn't
sufficient verification for this class of bug.

**A description of a mechanism overstated what the code does, corrected two sessions later.**
This entry originally called the 422-based double-confirm response a "guard" — but the frontend
never actually parses or uses the booking ID in that error, it just shows a generic rejection
message; the inline correction was added six phases later. Also recorded here: a deliberate
decision not to rewire the app onto the more "correct" documented idempotency/cancellation
mechanisms once they were confirmed working live, since the existing ones weren't broken and the
brief said not to restructure working code.
*Full entry: "Phase 3: resolved x-idempotency-key and the two-step cancellation flow, live; ported
both to Postman; app not rewired."*

**The fail-open architecture was built only after reproducing the crash it fixes.** Rather than
take "a network failure kills the process" on faith, the crash was reproduced first (an
unresolvable host really did take the whole server down), then fixed in three layers, then broken
four different real ways afterward to confirm the fix held. AI note: the first failure message
(`"fetch failed"`) was technically correct but useless for real debugging, since Node wraps the
actual reason in `err.cause`, not `err.message` — caught by reading the Inspector's own output,
not by reading the fetch docs first.

**A "verified, not invented" claim about real field names didn't hold up months later.** This
entry's own AI note cites `partner.transaction_id` and `commission.partner_commission` as
confirmed-real fields from captured fixtures, not invented ones — and the field-name audit later
found both citations were wrong in exactly the way this note says they weren't. Left as-written
rather than corrected here, since the point of this file is what was believed and verified at the
time, not a live reference.

**A 204-response bug only a browser could catch.** Opt-out's route mirrored XCover's real `204`
status onto the proxy's own response — HTTP spec requires a 204 to have no body, and Node
silently strips one even when `.json()` is called on it, so the frontend crashed trying to parse
an empty response. TypeScript, ESLint, and server-side curl tests all passed with this bug
present; only actually driving the checkout in a real browser surfaced it.

**A design-intent sentence went stale for two work sessions before being corrected.** The
original entry states routes mirror XCover's HTTP status onto the proxy's own response; the
actual, later-changed behavior (always 200, real status inside `capture.status`) was decided in
the very next entry down and never backported as a correction to this one until a later
adversarial review caught the inconsistency. Left in place, with an inline correction added
rather than the original sentence rewritten — establishing the pattern this file uses throughout.

**The offer schema was reverse-engineered from real errors, not guessed.** Iterated from an
empty request body through successive validation errors against the live sandbox to discover the
real `context` shape, rather than inventing a plausible one from an unrelated example vertical.
AI note: the `refund_required` field's actual effect on payout came back genuinely inconclusive
(identical response whether the flag was true, false, or omitted) — recorded as inconclusive
rather than papered over with a confident-sounding claim the test didn't actually support.
