# Decisions

### 2026-08-18 — Phase 13: presentation-layer pass — viewport-constrained layout, a real Inspector, content fields rendered, docs/CONSIDERATIONS.md
Context: this session's brief was explicitly scoped to presentation only — no state model, API
client, request shape, error handling, fail-open, action-guard, idempotency, or fixture-selection
changes. Layout target: the whole demo visible at 1440×900 with no page scroll. The Inspector
needed to go from "shows everything or nothing" to individually-collapsible sections. Several real
`content` fields (`extras`, `credibility_message`, `negative_cta_warning`, `disclaimer_html`,
`required_message`) were being fetched and discarded, undermining the "renders from the API"
claim. Plus a mapping document, `docs/CONSIDERATIONS.md`, checking the six partner considerations
against what's actually built.
**Layout** (`web/src/App.css`): `html`/`body` height 100%, `body { overflow: hidden }` — the page
itself can never scroll; `.checkout-column` and the Inspector's own `.inspector-list` each get
their own contained scroll instead, which is the only kind of scrolling this session's brief
allows. The single biggest fix wasn't a structural one — plain `<p>` tags carry a ~1em default
browser margin (`web/src/App.css`), and the several new content fields (Part 3) are all rendered
as `<p>` elements; before resetting that margin, the "selected plan" state alone needed ~55px more
than the viewport had, entirely from unstyled paragraph spacing. One explicit reset
(`.offer-card p, .product-card p { margin: 0.35rem 0; }`) reclaimed nearly all of it; the rest
came from trimming `section`/`fieldset`/`.plan-option` padding by a few px each. Verified by
reading `scrollHeight`/`clientHeight` off `document.documentElement` (not just eyeballing
screenshots) at every state this session drove — initial, offer fetched, plan selected (the
tallest state, since it adds the total-line and the policyholder fieldset), confirmed, cancelled,
declined, and the unreachable-host fail-open state — all `false` for both horizontal and vertical
overflow at 1440×900, across three markets and two quantities to make sure it holds under
different content lengths (GBP/EUR amounts render wider than USD, GB×qty3 was the specific check).
**Inspector** (`web/src/components/Inspector.tsx`, full rewrite): each capture entry's header now
shows a colored `mode-badge` (amber "MOCK", green "LIVE" — "unmistakable... not grey," per the
brief) instead of plain grey text. Expanding an entry reveals four independently-collapsible
`Block` components (URL, request headers, request body, response body/network error), each with
its own copy-to-clipboard button (`navigator.clipboard.writeText`, a "Copied" label for 1.5s,
verified actually lands the right content in the clipboard via
`page.evaluate(() => navigator.clipboard.readText())`, not just that the button exists). Request
body defaults open, everything else defaults closed, matching "legible rather than
exhaustive-by-default." Redaction itself (`redactHeaders` in `xcoverClient.ts`) was not touched —
out of scope by this session's own rule, and the brief explicitly called the visible
`signature="***redacted***"` a feature, not something to improve on.
**Content fields** (`web/src/App.tsx`, `web/src/lib/api.ts`): widened `OfferResponse.content`'s
type with the four new fields, all optional — deliberately not required, since a different offer
schema might not return them and every render site (`isUsableText`, `hasEntries` helpers) has to
degrade to nothing rather than assume presence. `extras` renders as a short list under the
heading (the actual coverage substance — Breakdowns/Accidental Damage/Cash Refund — previously
fetched into `capture.responseBody` for the Inspector but never shown in the checkout itself).
`credibility_message` sits near the CTAs. `disclaimer_html` replaces the plain-text `disclaimer`
when present, rendered via `dangerouslySetInnerHTML` after a small hand-rolled sanitizer
(`web/src/lib/sanitizeHtml.ts` — strips every tag outside a formatting allowlist and all
attributes unconditionally; no dependency added, matching the "no new dependencies" rule).
`content.title` ("CSE Interview Retail Offer") is never rendered — confirmed by grepping the
component for the string, not just by not adding the line. `sub_heading` ("N/A" on every captured
response, `fixtures/markets/*.json`, checked across three different markets to confirm it's not
market-specific) drove the general `isUsableText` guard, applied to every one of these fields, not
just the one the brief used as its example.
**`negative_cta_warning` — chose "inline note" over "confirmation prompt," the safer of the
brief's two offered options.** A blocking confirm dialog needs its own gating state around
`handleDecline` — arguably an action-guard change, which this session was told to stop and report
rather than make. An always-visible inline note next to the decline button needs no new control
flow at all — pure presentation. Recorded here as the specific reading chosen where the brief
offered a choice, not a unilateral scope expansion.
**Checkout details**: policyholder fieldset now conditional on `selectedProductId` — previously
shown unconditionally and dominating the card. Email input widened (`fieldset input.wide`) after
confirming visually it was actually truncating a real address, not just narrow-looking. Plan
options restructured into a comparable row (name left, price bold and right-aligned, selected
state highlighted) instead of one inline radio label. Disabled "Add protection" now shows
`content.required_message` ("Please make a selection") next to it rather than being disabled with
no explanation. A new `.total-line` spells out `product + protection = total` explicitly using the
selected plan's real price, addressing "make the relationship obvious" literally rather than
trusting proximity alone.
**Visual**: one accent color (`--accent: #1d4ed8`), used for primary buttons, the selected-plan
border/background, and Inspector copy-button hover — nowhere else. No shadows, no gradients, no
component library, no new npm dependency (`sanitizeHtml.ts` is a new *file*, not a new
*dependency*). Tension worth stating plainly: Part 5 asked for "generous whitespace," Part 1 asked
for everything to fit in 900px with several new content fields added — those two pull against
each other, and the viewport constraint won where they conflicted, since it's the harder
functional requirement. The result reads as tidy and dense rather than spacious, which the brief's
own framing ("RealCheap is a discount marketplace — dense and plain is on-brand") suggests is the
right tradeoff, not a compromise.
**`docs/CONSIDERATIONS.md`**: mapped all six partner considerations against real code/captures,
three-tier classification (Demonstrated live / Built but unverifiable / Designed, not built).
Two things checked empirically rather than assumed: (1) whether `cse-interview-retail` accepts
`sku`/`category` fields at all — probed live (`fixtures/probe/sku-category-test.json`), confirmed
`200` (not rejected as unknown) but no observable evidence they're consumed for eligibility,
which is the honest, complete answer to "why isn't this built," not a guess. (2) Settlement's
field citations in `docs/ARCHITECTURE.md` — checking them against real fixtures while writing
`CONSIDERATIONS.md` surfaced that `commission.partner_commission` and a nested
`partner.transaction_id` were never real field names (the actual paths are
`products[].details.finance.commission.total_amount` and a top-level `partner_transaction_id`,
which is `null` in every capture this repo has ever made) — corrected in `ARCHITECTURE.md`
directly, not left to propagate into the new document as a second copy of the same error.
Alternatives rejected: adding `@playwright/test` or any other testing/UI dependency to formally
test the sanitizer or the layout — this session's constraints (no new dependencies) and CLAUDE.md's
narrow testing bar (the signing vector) both argue against it; verified empirically via throwaway
Playwright instead, same pattern every prior UI-verification phase in this project has used.
AI note: the ARCHITECTURE.md field-name errors were an unplanned find — went looking for evidence
to cite in `CONSIDERATIONS.md`'s settlement section, tried to verify the fields ARCHITECTURE.md
already named, and they didn't exist under those names in any real fixture. A good example of why
"derive every claim from the code and the captures" (this session's own instruction for the new
doc) also ends up auditing the old ones, if taken literally instead of copied from a doc that
already claimed to have done that work.

### 2026-08-18 — Phase 12: full-history gitleaks scan, redacted 25 real security tokens in tracked fixtures
Context: last session's blind adversarial review (Finding 2, recorded in `docs/BLIND-REVIEW-2.md`,
untracked) found that Phase 9's gitleaks work only ever validated the pre-commit hook against a
synthetic test string — nobody had run `gitleaks detect` across the actual working tree and full
history to see what it would find in files already committed before the hook existed. It found
real material.
**Full scan, run and read this time**: `gitleaks detect --source . --log-opts="--all"` across
complete history returned 26 findings. One is the already-known, already-documented
`server/src/signing.test.ts` secret (Phase 5) — historical only, fixed in the current file, and
covered by `docs/SCRUB-PLAN.md`, not touched again here per this session's explicit "do not scrub
history" instruction. The other 25 were new: real `security_token` values — per-booking
Certificate-of-Insurance access tokens XCover issued during live capture sessions — embedded in
tracked fixture files, present since the commits that originally captured them (2026-08-13
through Phase 3). Never flagged in `WEAKEST-POINTS.md`, `OPEN-QUESTIONS.md`, or anywhere else
before the blind review found it — a genuine miss in this project's own stated discipline about
exactly this failure class, not a disclosed and accepted risk.
**Redacted, in two passes — the second catching what the tool missed.** First pass, matching
gitleaks' 25 findings: 8 files (`fixtures/confirm-offer.json` and 7 under `fixtures/probe/`), 4
distinct token values. Then ran a plain `grep -rl security_token fixtures/` independent of
gitleaks entirely, to check the tool's own coverage rather than trust it — and found **2 more
files** (`fixtures/probe/idempotency-key-first.json`, `idempotency-key-repeat.json`, 10 more
occurrences, 1 more distinct real token) that gitleaks' entropy-based `generic-api-key` rule
simply never flagged, despite being the exact same shape and source as the 25 it did catch —
gitleaks' entropy scoring isn't perfectly consistent across visually-identical strings, a real
limitation of the tool, not of this project's use of it. **Final count: 35 occurrences across 10
files, 5 distinct real tokens, all redacted.** Some tokens repeat across multiple files (the same
booking captured at different lifecycle stages shares one real token); the redacted versions
preserve that same grouping, so a reader diffing two fixtures for the same booking still sees one
consistent placeholder, not unrelated ones per file. Replacement values keep the real tokens'
shape (four dash-separated 5-character groups, e.g. `REDAC-TED00-00001-TOKEN`) but are
unambiguously synthetic — no attempt to look like plausible real data, unlike the price/tax/
currency fields Phase 2/4/5 populate from genuinely captured numbers. Confirmed no application
code reads or branches on `security_token` anywhere (`grep -rn security_token server/src web/src
scripts/` — zero results): it's inert passthrough data shown as-is in the Inspector's raw
response body, never parsed. Final verification used a plain `grep`, not another `gitleaks` pass,
specifically because the tool had already been shown to under-report on this exact class of
string. Also re-ran `gitleaks detect` on the working tree (`--redact`, this time, after an early
re-check without it printed the real `.env` values into this session's own tool output by
mistake — caught immediately, not repeated, `.env` itself excluded from the count since it's
gitignored and correctly supposed to have real values): zero findings outside `.env`. Verified
live (`npm run smoke`, `9/9`) and via a clean-clone MOCK_MODE Playwright pass after committing —
nothing depends on the real token values, nothing broke.
**Why this happened at capture time, not render time, and why the hook didn't catch it**: the
Inspector redacts headers (`X-Api-Key`, `Authorization`) at render time, in `xcoverClient.ts`,
because every live call passes through that one function — a single choke point. Fixture files
are raw captured XCover response bodies, saved by throwaway probe scripts
(`scripts/probe/probe.ts`, `server/scripts/probe-schema.ts`) that write whatever XCover actually
returned, unredacted by design (the whole point of a fixture is to be a faithful capture). Nothing
in that capture path ever redacts response *body* content — only request *headers*, which is a
different code path entirely. And the pre-commit hook (Phase 9) only gates *new* commits from the
moment `core.hooksPath` is set — it has no mechanism to retroactively scan a tree that was already
committed before the hook existed, which is exactly the gap this session's full scan closed by
actually running the tool that mechanism was missing, rather than assuming the hook's existence
meant the repo was already clean.
Alternatives rejected: scrubbing these 25 blobs out of git history alongside the API secret in
`docs/SCRUB-PLAN.md` — explicitly out of scope this session ("do not scrub git history"); the
redaction here only changes the *current* tree going forward, the same boundary every other fix
this session respected.
AI note: two real mistakes in this same phase, both caught and corrected before compounding. (1)
Deleted the blind-review subagent's transcript file per direct instruction — a file at
`~/.claude/projects/.../subagents/agent-....jsonl` that had captured the real secret's plaintext
as a side effect of the review process itself, not from anything the app does. (2) Ran
`gitleaks detect` against the working tree twice while re-verifying the redaction — the first
time without `--redact`, which printed the real, current `.env` values (`XCOVER_API_KEY`,
`XCOVER_API_SECRET`) directly into this session's own tool output, a direct instance of exactly
what this whole session has been careful to avoid. Not repeated: immediately re-ran with
`--redact` and filtered the JSON report programmatically instead of eyeballing verbose text
output. Recorded here rather than quietly fixed and left out of the record, per this file's own
purpose.

### 2026-08-18 — Phase 11: documentation truth pass — two docs had gone stale describing pre-Phase-9 behavior
Context: this session's brief asked whether every tracked doc still describes the code as it now
is, specifically calling out whether `ARCHITECTURE.md` covers idempotency handling and whether
the docs this project treats as its technical reference (`API-NOTES.md`, `SANDBOX-CAPABILITIES.md`)
still separate confirmed-by-testing from assumed-from-docs correctly. Ran in parallel with a
blind adversarial review (Phase 12, this same date) that independently found the same two stale
claims — worth noting because it's a real cross-check, not a coincidence I'm asserting: two
separate processes, one with zero context from the other, converged on the same inaccuracy.
**Found and fixed**: `docs/API-NOTES.md` and `docs/SANDBOX-CAPABILITIES.md` both still described
`x-idempotency-key` as "not wired into the app this session... logged for a future pass" and "the
app doesn't send this header today" — true when written (Phase 3), false since Phase 9 actually
wired it in. Rewrote both sections to state current behavior (`App.tsx` generates one key per
offer, `409` is success, `423` retries once) rather than the Phase 3 snapshot. `SANDBOX-CAPABILITIES.md`
also still carried the overstated "existing booking ID surfaced in the error text, enough for the
frontend to recover" claim that the Phase 9 correction had already fixed in `DECISIONS.md` but
never backported here — fixed to match.
**Found and fixed, smaller**: `docs/ARCHITECTURE.md`'s credential-scope sentence ("used only
inside `xcoverClient.ts`") was never accurate even before this session — `server/scripts/probe-schema.ts`
and `scripts/probe/probe.ts` already read the credentials directly, and Phase 10 added a third,
`scripts/smoke-test.ts`. Broadened the sentence to name all of them rather than overclaim a
single choke point. Also added the two facts `ARCHITECTURE.md` was missing entirely: `MOCK_MODE`
being the zero-config default (Phase 8) and the `x-idempotency-key` mechanism (Phase 9) — both
material to "what's built," not decoration.
**Checked and left alone**: `docs/OPEN-QUESTIONS.md`'s six items are all still genuinely open —
none has been resolved by anything built since they were written. `docs/README.md`'s claims were
re-verified against an actual clean clone the same day they were written (Phase 8) and nothing
material to those claims has changed since.
**Interviewer-facing language re-grep**: this session's brief added "demo" to the words to check,
beyond the panel/interview/candidate/reviewer set from Phase 8's pass. Left "demo" alone almost
everywhere — it's accurate self-description (this genuinely is a demo checkout; the actual
rendered UI copy says "XCover protection demo checkout") rather than audience-specific framing,
unlike "panel"/"candidate" which name who's watching. The one pattern actually worth softening was
"demo narration" (three instances, `OPEN-QUESTIONS.md`, `SANDBOX-CAPABILITIES.md`) — it
specifically assumes a live spoken presentation is happening, not just that the app exists as a
demo — reworded to "disclosed wherever this is presented" / "any accompanying explanation," which
holds up whether or not anyone is narrating anything out loud.
Alternatives rejected: touching `docs/DECISIONS.md`'s own historical entries for the same
staleness — not applicable here, since the entries being checked against are the *reference* docs
(`API-NOTES.md`, `SANDBOX-CAPABILITIES.md`, `ARCHITECTURE.md`), whose job is to describe current
reality, not `DECISIONS.md`, whose established job (this file's own repeated rule) is the
opposite — a record of what was believed at each point.
AI note: caught the `ARCHITECTURE.md` credential-scope inaccuracy myself, independently, before
seeing the blind review's Finding 8 confirm the same section needed a fix — good corroboration
that the two processes weren't just echoing each other. The idempotency-doc staleness in
`API-NOTES.md`/`SANDBOX-CAPABILITIES.md` was caught the same way — found during this session's
own read-through before the blind review's report arrived, then independently confirmed by the
review's Finding 3 citing the exact same two files and the exact same stale sentences.

### 2026-08-18 — Phase 10: `scripts/smoke-test.ts`, a tracked live integration smoke test
Context: this session's brief asked for a runnable, tracked smoke test against live staging —
`npm run smoke`, nine steps, PASS/FAIL with timing, non-zero exit on failure — as a real
submission artifact ("a partner-facing engineer would ship exactly this"), not throwaway probe
tooling.
Choice: `scripts/smoke-test.ts` at the repo root, importing `signDate`/`buildAuthorizationHeader`/
`rfc822Date` directly from `server/src/signing.ts` rather than reimplementing them inline —
unlike `scripts/probe/probe.ts` (explicitly throwaway, zero dependency on the app's build graph by
design), this script is meant to stay correct as the app changes, so it should share the one
signing implementation rather than risk drifting from it. `tsx` resolves the cross-workspace
relative import fine (same mechanism `server/scripts/probe-schema.ts` already uses for its own
in-workspace import of `signing.ts`). Steps 1-8 call XCover directly, bypassing `MOCK_MODE`
entirely, matching the existing probe scripts' pattern. Step 9 is different in kind — it spawns
the actual server (`server/src/index.ts`) as a child process on a free port, with `MOCK_MODE=false`
and `XCOVER_API_DOMAIN` pointed at `https://this-host-does-not-exist.invalid` (an RFC 2606
reserved TLD, so DNS failure is guaranteed rather than racy), and asserts the proxy still answers
`200` with `capture.networkError` set and `/api/health` still reachable afterward — testing this
app's own fail-open handling (Phase 1), not XCover's behavior.
**Two things worth recording that surfaced only by actually running it, not by writing it:**
(1) The booking from step 5/6 is a real live booking; left uncancelled, nine years of repeated
`npm run smoke` runs before freeze would leave nine years of orphaned test bookings in the
sandbox. Added an unnumbered cleanup step (preview → `confirm_cancellation`, using the
`cancellation_id` step 8 already obtained) so every run cleans up after itself, matching the
discipline the Session 1.5 probe already established for this project ("all test bookings created
during probing were cancelled afterward"). (2) **Step 3's assertion is deliberately weaker than
what "localised content" implies.** Ran it live against Germany (`country: "DE", language: "de"`)
expecting to see German copy; the actual `content.heading` returned was "Back your buy with
XCover protection" — plain English, unchanged from the US response. The step only asserts
`currency === "EUR"` and that `content.heading` is non-empty, not that the text is actually
localized, because it isn't, at least not for this market on this sandbox account. This is a real
finding about the platform, not a smoke-test bug — flagged directly in Part 5 of this session's
report rather than quietly asserting something the API doesn't actually do.
Verified: ran twice against live, `9/9` steps passed both times, `exit 0`, both real bookings
cleaned up (confirmed `cleanup: booking ... cancelled for real (status 200)` in the output both
times). Credentials never printed — only the same first-4/last-4 redaction pattern used
throughout this project (`45Bc...a6b0`), verified by reading the actual printed output.
Alternatives rejected: testing step 9 by pointing the *live-calling* part of this script (steps
1-8's own `fetch`) at an unreachable host — rejected because that would only prove `fetch()`
throws on DNS failure, a fact about Node, not about this app; the actual thing worth testing is
whether *this app's* `xcoverClient.ts`/`asyncHandler`/error middleware chain degrades the way
Phase 1 built it to, which requires actually running the server.
AI note: typechecked the script ad hoc (`tsc --noEmit` with the same compiler flags as
`tsconfig.base.json`, since there's no project config covering `/scripts` — same as the existing
probe scripts) before running it against live, catching one real type error
(`cancellation_id: string | null` didn't fit a `string | undefined` local) before it could surface
as a live-run crash instead of a caught compile error.

### 2026-08-17 — Phase 9: pre-commit hook to prevent a credential-leak recurrence
Context: this session's brief asked for a `gitleaks protect --staged` pre-commit hook, with a
grep-based fallback if gitleaks isn't available, specifically to stop the Phase 5 credential-leak
class of mistake from happening again.
Choice: one hook (`.githooks/pre-commit`), not two separate tools — it checks for `gitleaks` on
`PATH` at commit time and runs `gitleaks protect --staged --redact` if present, falling back to a
grep over the staged diff for `XCOVER_API_(KEY|SECRET)` assigned a literal value and for
40+-character high-entropy-looking runs if not. A raw `.git/hooks/pre-commit` isn't
version-controlled, so it lives in a tracked `.githooks/` directory instead and is enabled via
`git config core.hooksPath .githooks` — one command, no new dependency (no husky), documented in
a new README "Developer setup" section.
**Verified empirically, not assumed — and the first assumption was wrong.** Installed gitleaks
(`brew install gitleaks`, not present in this environment beforehand) specifically to test the
real path rather than trust the documented `gitleaks protect --staged` invocation blind. First
test used a synthetic secret assigned to the XCover secret variable but shaped like readable
text, not a real generated credential — gitleaks did **not** flag it, and the test commit went
through. Not a broken hook: gitleaks' default `generic-api-key` rule gates on Shannon entropy, and
a readable string with sequential digits scores too low. Re-tested with a
`secrets.token_urlsafe(40)`-generated value (entropy 5.19) — correctly blocked (`exit 1`, commit
did not go through). Added `.gitleaks.toml` with one custom rule
(`xcover-credential-assignment`) matching the `XCOVER_API_KEY`/`XCOVER_API_SECRET` variable names
directly, regardless of entropy — defense-in-depth for a real credential that happens to be
shorter or less random-looking than gitleaks' generic heuristic expects, since the actual
incident this hook exists to prevent was a real credential, not a test string. Allowlisted
`.env.example` by path (its placeholder values would otherwise match the custom rule's shape) —
verified that edit alone doesn't trip either rule. Then tested the **fallback** path by removing
`gitleaks` from `PATH` (`PATH="/usr/bin:/bin"`) and running the hook directly: same synthetic
secret correctly blocked (`exit 1`) by the grep fallback, with a message pointing at installing
gitleaks for real coverage. Finally confirmed a legitimate commit (the hook files themselves)
passes cleanly through the real, non-bypassed hook. All test artifacts (a throwaway file assigning
a fake value to `XCOVER_API_SECRET`) were created outside of and removed before this session's
actual commits — never landed in history. **The hook then caught something of its own**: the
first draft of this very paragraph, describing the test in the literal `KEY=value` form, tripped
the custom rule on its own prose when staged — a real, correct catch (the rule doesn't know the
difference between documentation *about* the pattern and the pattern itself), fixed by rephrasing
rather than by weakening the rule or allowlisting `docs/DECISIONS.md`, which is the one file that
should never be exempted from this check.
Alternatives rejected: a single grep-only hook with no gitleaks integration — rejected because
this session's own first test proved a naive keyword/length grep alone is exactly the kind of
check that misses a real credential shaped differently than expected; gitleaks' entropy-based
detection is strictly better and worth the one-line `PATH` check to prefer it when available.
Committing gitleaks as a vendored binary or npm dependency — rejected as adding a real dependency
for tooling that's optional (the fallback exists precisely so the repo doesn't require it).
AI note: the "gitleaks didn't catch my first test string" result is exactly the kind of finding
this whole project's discipline exists to surface — an assumption ("gitleaks protect --staged
will obviously block a fake secret") that turned out to be conditionally true, caught only by
actually running it and reading the real exit code, not by trusting the documented command syntax
was sufficient on its own.

### 2026-08-17 — Phase 9: fixed the double-click gap, the right way — in-flight guard plus `x-idempotency-key`
Context: `docs/REACHABLE-STATES.md` #2 (previous session) ranked a rapid double-click on
Opt-in/Decline/Cancel as the single most likely thing to go wrong in a live demo, and left it
unfixed on freeze-discipline grounds — a reasonable reading of "don't restructure," but the wrong
call, since the instruction was about structural change, not about leaving a demo-risk bug
unpatched when a small, additive fix exists. This session's brief asked for both layers: a
frontend guard (catches the ordinary case, a genuine double-click) and `x-idempotency-key` on
Confirm Offer (catches the case a button guard structurally cannot — a request already in flight
when the network drops, where there's no button left to disable before the user's retry).
Live had gone unverified since the Phase 5 credential cleanup and Phase 8's zero-config pass, so
Part 1 of this session re-verified it first, blocking: a full create → confirm → cancel and a
separate create → opt-out, both through the real UI with Playwright against
`api.xcover-staging.com`, both clean (real booking `P94PU-XD93T-INS`, zero console errors, real
statuses 200/200/200 and 200/204). Also re-ran `git grep` for credential-shaped strings across
every tracked file and grepped `fixtures/` specifically for `Authorization`/`X-Api-Key` — nothing
found beyond the same partially-redacted (`45Bc...a6b0`) pattern already established as
intentional design, not a leak.
**Choice — in-flight guard**: one `actionPending` boolean (`App.tsx`), set for the duration of
`handleOptIn`/`handleDecline`/`handleCancel`, disabling all three buttons while any one is
outstanding. Shared rather than three separate flags, since Opt-in and Decline render
simultaneously on the same offer and firing one while the other is mid-flight is the same class of
ambiguity as firing the same one twice. Purely additive — no change to what states the flow can be
in, only to whether a button is clickable while a request for it is already outstanding. Verified
live: a rapid double-click on Confirm fired exactly **one** `/confirm` request (down from two,
confirmed via network-request counting in a Playwright pass), booking confirmed cleanly, zero
console errors.
**Choice — `x-idempotency-key` on Confirm Offer**: the app previously sent none (confirmed by
reading `api.ts`/`xcoverClient.ts` before changing anything — not assumed). Added: `App.tsx`
generates one key (`crypto.randomUUID()`) per fetched offer, reused for every confirm attempt on
that offer, threaded through `web/src/lib/api.ts` → `POST /api/offers/:id/confirm`'s
`x-idempotency-key` header → `server/src/routes/offers.ts` reads it → `xcoverClient.ts`'s
`confirmOffer`/`request()` forward it to XCover unchanged. `capture.status === 409` is now treated
as success (the documented "cached original result" response, not an error to route around);
`capture.status === 423` triggers one automatic retry with the same key after a 1.2s pause, then
falls through to normal error handling if it still fails. Verified live, both cases the brief
asked for: (1) replaying an **identical key + body** directly (bypassing the UI, which never
retries automatically today) returned `409` with the exact same `bookingId` as the first call —
confirmed via `page.evaluate(fetch(...))` against the real running server. (2) Went further than
asked and fired **two genuinely simultaneous** confirms (`Promise.all`, not sequential) with the
identical key — got `200` + `409`, both carrying the **same** booking id, no duplicate booking
created even under real concurrency. **423 still wasn't reproduced** even under genuine
parallelism — consistent with the original Session 1.5 probe's note that it needs a tighter race
than two ordinary concurrent requests achieve; the retry-on-423 code path is implemented per
`offers/api/idempotency-keys.md` and exercised by nothing observed live this session, same honest
gap the project has recorded before rather than claimed away.
Alternatives rejected: leaving the double-click gap unfixed a second time — rejected because this
session's brief specifically named it the wrong call last time, and the fix is additive (new state,
new header, two new branches), not a restructure of anything.
AI note: no credential value was ever read, echoed, or logged this session — `.env` was
permission-denied to the Read tool for this session, and every check ("is MOCK_MODE actually
false," "did live actually authenticate") was inferred from `/api/health` and real HTTP responses,
never from the file's contents, matching this session's explicit instruction. One operational
snag, not an app bug: repeated `npm run dev` restarts across this and the prior session left
several orphaned `tsx watch`/`vite` processes still bound to old state in the background,
eventually causing one restart to appear to hang; caught by checking `lsof`/`ps` directly rather
than assuming the app was broken, cleaned up with a full `pkill` sweep, unrelated to any of the
code changes above.

### 2026-08-17 — Phase 8: pre-freeze pass, part 2 — break-testing found and fixed a Confirm/Cancel booking-id mismatch in MOCK_MODE
Context: this session's brief asks for deliberate break-testing beyond the scripted demo path,
driving the real UI with Playwright, and to fix only what crosses into "crashes, corrupts state,
or would be visibly embarrassing in a live demo" — everything else gets reported, not patched.
Drove the real app (MOCK_MODE, the zero-config default after Part 1 of this phase) through order
deviations, market/quantity changes mid-flow, browser back/reload, two parallel tabs, rapid
double-clicks, live/mock mode switching, out-of-range inputs, and malformed policyholder data.
Full findings: `docs/REACHABLE-STATES.md` (untracked, per this session's brief — copied nowhere
since it's genuinely internal, not candidate-facing material moving to another repo).
**Found and fixed**: opting in then cancelling the same booking, in MOCK_MODE, showed two
*different* booking ids — Confirm Offer's response (`EWGGB-V2G64-INS`, from the one real captured
confirm fixture) versus Cancel Booking's response (`3MDFV-CWSUL-INS`, from the separate, unrelated
real captured cancel fixture) — visible side by side in the Inspector for literally the same
booking. This is the exact flow `docs/DEMO-SCRIPT.md` runs (steps 6 then 7) in the exact mode this
app now defaults to with no setup, and it directly undermines the Inspector's specific job
("first-class... how the panel validates that calls are real," CLAUDE.md) — the one feature this
project can least afford to visibly contradict itself in. Crosses this session's fix bar: it's
squarely "visibly embarrassing in a live demo," reachable on the scripted happy path itself, not
just an edge case.
**Fixed without fabricating anything**: `mockedCancelBooking` (`server/src/xcoverClient.ts`) now
takes the real `bookingId` the call was actually made for (already known — it's the URL path
parameter, not invented) and overrides the fixture's own static `id` with it, the same pattern
already used for currency/price/tax on the same object. Verified live: confirm then cancel now
show identical ids in the Inspector.
**Found, not fixed, deliberately**: Confirm Offer's own booking `id` is *itself* static across
every market/plan/session — every confirmation in MOCK_MODE shows the same `EWGGB-V2G64-INS`,
because there is only one real captured Confirm Offer response in this repo's fixture set (unlike
Create Offer, which has 35 real captures, one per market×quantity). Fixing this the same honest
way Phase 2/5 fixed the equivalent Create Offer gap would mean capturing real Confirm Offer
responses across markets live — not possible this session (no live credentials available in this
environment; verified by actually trying, see `docs/REACHABLE-STATES.md`). The alternative,
generating a synthetic-but-varying id, was rejected for the same reason Phase 2 rejected
interpolating prices: it would be inventing a value CLAUDE.md's hard constraint 2 says not to
invent, in the one file that's already been reviewed once for exactly this kind of thing (Phase 5).
Reported, not patched, per this session's own instruction to leave "merely surprising" behavior
alone and record it.
Alternatives rejected: re-delegating Part 2 a second time to another background agent after the
first attempt returned no deliverable — rejected in favor of driving the browser directly, since
the failure mode (an agent that got confused mid-task with no way to recover the specific state it
was in) is exactly the kind of thing that's cheaper to just redo carefully than to debug blind.
AI note: a background subagent was launched first for this phase's browser-driving work, to keep
the (expected to be large) Playwright transcript out of the main session's context. It returned
"completed" with no `docs/REACHABLE-STATES.md` file on disk and a final message about a tool
being "for /loop sessions specifically" — evidence it got sidetracked into an unrelated tool call
rather than finishing the assigned task, not evidence about the app itself. Verified this by
checking the filesystem directly (the file didn't exist) rather than trusting the "completed"
status label, then redid Part 2's work directly rather than re-delegating blind a second time.

### 2026-08-17 — Phase 8: pre-freeze pass, part 4 — why-only comments, and `App.tsx`'s state model
Context: this session's brief asks for comments at exactly five points — the HMAC signing
construction and the fact that the signed string covers only the date; why the backend proxy
exists at all; the fail-open principle where it's implemented; why mock fixture selection keys on
request parameters; every `ASSUMPTION` tag — and nowhere else, explaining *why*, never restating
what the code already says.
Choice: audited all five against what already existed in the code (four phases of prior work had
already left substantial why-commentary behind) before adding anything. Three were already
adequately covered and left untouched: the fail-open principle (`App.tsx`'s `Decision` type
comment, `fetchOffer`'s catch-block comments, `index.ts`'s last-resort-net comment,
`ARCHITECTURE.md`'s "Failure handling" section); why mock fixture selection keys on request
parameters (the comment block directly above `mockedCreateOffer` in `xcoverClient.ts`, added
Phase 2); the one `ASSUMPTION` tag that exists (`XCOVER_TIMEOUT_MS` in `xcoverClient.ts`, added
Phase 1, already explains the 10s value's origin and what's untested about it). Two were genuinely
missing and added here: `signing.ts`'s docblock now states explicitly that the signed string is
only the date — not method, path, or body — and what that implies (a stolen/replayed request is
bounded by clock-skew tolerance, not by the signature binding to what's actually being requested;
this is XCover's documented scheme, not a choice made in this codebase). `xcoverClient.ts` now
opens with why a backend proxy exists at all, rather than that fact only living in CLAUDE.md and
`ARCHITECTURE.md`'s prose — the module itself now states it inline: XCover's HMAC auth needs the
raw secret to sign every request, that secret must never reach the browser, and every function in
the file runs server-side only.
**`App.tsx` holding all flow state and every handler in one component** — the file this brief
specifically asks for a DECISIONS.md entry on. This is deliberate for a prototype, not an
oversight: one component with ~12 `useState` calls (market, quantity, offer, decision, booking,
cancellation, policyholder, two error strings, Inspector entries, `alreadyRefunded`,
`selectedProductId`) and four handlers (`fetchOffer`, `handleOptIn`, `handleDecline`,
`handleCancel`) that each follow the same try/catch → check `networkError` → check `status >= 400`
→ set state shape. CLAUDE.md caps architecture/styling effort at "what makes the checkout legible"
for what is, today, a single linear flow with no branching paths a router or global store would
help with — a decomposition would add indirection (action types, a reducer, prop-drilling or
context) that a reader has to hold in their head *in addition to* the flow itself, for a flow small
enough to read top-to-bottom as one file right now. This is the one architectural choice in the
whole project closest to a coin flip rather than clearly correct: the file has grown across five
build phases of additions without a structural pass, and a decomposition would probably read
better today than it would have on day one.
**What production decomposition would look like**, if this became a real, growing integration
rather than a scoped demo: (1) the four handlers' shared shape (try → branch on
`networkError`/`status`/`mockNote` → set state or error) is exactly what a `useReducer` with
action types (`OFFER_REQUESTED`, `OFFER_SUCCEEDED`, `OFFER_FAILED`, `CONFIRM_SUCCEEDED`, …) or a
small explicit state machine (the `Decision` type is already halfway to one) would collapse into
one reducer function instead of four near-duplicate branches; (2) each XCover action
(offer/confirm/decline/cancel) becomes its own hook (`useCreateOffer`, `useConfirmOffer`, …)
wrapping the reducer dispatch plus its own loading/error slice, so `App.tsx` stops being where
every network concern lives; (3) the product/market/quantity selector, the offer/decision card,
and the Inspector become genuinely independent components communicating through the reducer's
state and dispatch rather than through prop drilling from one parent; (4) the Inspector's
`entries` log is a cross-cutting concern (every hook needs to append to it) and would move to a
context or a dedicated capture-log store rather than living in the same `useState` array as
checkout-specific state. None of this was built — it would be premature structure for a flow this
size today, per CLAUDE.md's own "don't design for hypothetical future requirements" instruction —
but the shape of it is the honest answer to "how would you decompose this."
AI note: no code changed for the `App.tsx` entry — this restates and formalizes reasoning that
`docs/WHY.md` (removed from the tracked repo in the previous phase of this same session) already
worked out, since that file's job was exactly this question ("decisions a different engineer
would reasonably have made differently"). Re-derived the production-decomposition paragraph fresh
here rather than copy verbatim from the removed file's less detailed version, since this session's
brief specifically asks for "the decomposition you would do for production," which the removed
file didn't spell out to that level.

### 2026-08-17 — Phase 8: pre-freeze pass, part 3 — candidate-facing docs moved out, panel-language pass, limitations audit
Context: `docs/PANEL-QA.md`, `docs/WEAKEST-POINTS.md`, `docs/CODE-TOUR.md`, `docs/WHY.md`, and
`docs/DEMO-SCRIPT.md` were written for this specific panel event, not as project documentation a
future engineer would expect to find in the repo — this session's brief has them move to another
repo. `docs/REACHABLE-STATES.md` (Part 2 of this session, break-testing notes) is the same kind
of internal, point-in-time artifact.
Choice: copied all five to `/tmp/realcheap-panel-docs/` first, then `git rm --cached` (working
copies stay on disk, untracked) and added all five plus `docs/REACHABLE-STATES.md` to
`.gitignore`, so none of the six can be accidentally re-added later. Grepped every surviving doc
and all source comments for "panel"/"interview"/"candidate"/"reviewer": left "Inspector panel"
alone everywhere (a UI feature name, not commentary about an audience) and left every literal
`cse-interview-retail`/`E3CCM` occurrence alone (real API field values and this sandbox's actual
partner code — factual, not framing). Rewrote the handful that *were* audience framing rather
than fact: `docs/ARCHITECTURE.md`'s "the level a panel would need to evaluate the design" →
"the level needed to evaluate the design"; `docs/OPEN-QUESTIONS.md` and
`docs/SANDBOX-CAPABILITIES.md`'s "configured specifically for this interview exercise" →
"configured specifically for this sandbox account"; `docs/SANDBOX-CAPABILITIES.md`'s two
"a panelist asks..." → "someone asks...". Deliberately left `docs/DECISIONS.md`'s own historical
entries untouched — this file's established rule (see the 2026-08-15 "Server proxy" correction
entry) is that it's "the record of what was believed and decided at each point, not a live
reference"; scrubbing "panel" out of already-written history would misrepresent what actually
happened (this project genuinely was built for a panel review) in the one file whose entire job
is an honest record, and the session brief separately says not to scrub git history.
**Limitations audit** (Part 3, item 7): confirmed every item in the now-untracked
`WEAKEST-POINTS.md` still has a home in a tracked doc, so removing that file doesn't make the
repo look cleaner than it is. #1 (credential in git history) and #2 (MOCK_MODE data integrity
bugs, twice) are fully covered by this file's existing Phase 5 entry. #3 (duplicate-refund
avoidance unverifiable on this sandbox) is covered by `docs/OPEN-QUESTIONS.md` #3. #4 (only one
unit test in the whole project) and #5 (single-product/no-persistence shape doesn't obviously
generalize) were **not** previously stated as limitations anywhere tracked — restated explicitly
here rather than left to disappear along with `WEAKEST-POINTS.md`: this project has exactly one
automated test (the signing vector); everything else (~90 live calls, Playwright passes, the
Phase 5 adversarial review) was manual, one-time, and doesn't re-run on the next change, so a
regression in the class Phase 4/5 already found once could reappear silently. And the
market/quantity fixture-matching approach `fixtures.ts`/`xcoverClient.ts` use for MOCK_MODE is a
convenience specific to having exactly one hardcoded product; it has no equivalent shape once
there's a second product line, so "how would this extend to a real catalog" doesn't have a "this
scales as-is" answer.
Alternatives rejected: rewriting `docs/DECISIONS.md`'s historical entries to remove "panel"
language for consistency with the rest of this pass — rejected for the reasons above; a
newly-added *pointer* to a past decision isn't the same category of edit as rewriting the
decision's own contemporaneous record.
AI note: no code changed in this phase — five `git rm --cached` calls, six `.gitignore` lines,
and eight prose edits across three files (`ARCHITECTURE.md`, `OPEN-QUESTIONS.md`,
`SANDBOX-CAPABILITIES.md`), verified by re-grepping after editing rather than trusting the first
pass caught everything.

### 2026-08-17 — Phase 8: pre-freeze pass, part 1 — zero-config MOCK_MODE, README rewrite, Node pinning
Context: a code freeze is under 36 hours out. After the freeze a reviewer reads the repo and may
run it, with no chance to ask what a refactor broke — this session's brief is explicit not to
restructure anything, only to make the repo runnable and honest. First gap found: `config.ts`
threw at import time if `XCOVER_API_DOMAIN`/`XCOVER_BASE_PATH`/`XCOVER_PARTNER_CODE` were unset,
*even in MOCK_MODE* — so a reviewer who deleted `.env` (or never had one) couldn't start the
server at all, despite MOCK_MODE needing no real credentials by design (hard constraint 4).
Choice: `config.xcover.{domain,basePath,partnerCode}` now fall back to placeholders
(`https://mock.invalid`, `/xcover/partners/`, `MOCK`) when `mockMode` is true, and stay behind
`required()` — fail fast at startup, not a confusing 403 later — only for live mode. Verified by
actually deleting `.env`, cloning the repo fresh into the scratchpad, `npm install && npm run
dev`, and driving the full opt-in → cancel flow with a throwaway Playwright script: zero console
errors, correct MOCK_MODE pricing rendered. Also renamed `signing.test.ts`'s test-only `keyId`
from `"E3CCM-key"` to `"test-key"` (partner code has no bearing on the signature, so this cost
nothing) and flagged `XCOVER_PARTNER_CODE` in `.env.example` as partner-specific and
reviewer-replaceable, since domain/base-path are the shared XCover staging pattern but the
partner code is this specific sandbox account's. Added `engines`/`.nvmrc` (Node 20+, matching the
README's stated minimum) so a reviewer's Node version isn't one more silent variable. Rewrote
`README.md` to open with the three run commands and what actually renders on screen, moving live
setup and the probe/Postman tooling to later sections — the old README opened with a paragraph of
doc pointers before showing how to run anything.
Alternatives rejected: leaving `XCOVER_PARTNER_CODE=E3CCM` unflagged in `.env.example` — rejected
because a reviewer using their own sandbox credentials, unaware the partner code is
account-specific, would get confusing live-mode auth failures despite having "correct" API
key/secret.
AI note: this phase's own process was a good example of the rule it was applying to the
code — the first four commits of this phase (config.ts, signing.test.ts, engines/.nvmrc, README)
went in *without* a DECISIONS.md update, violating CLAUDE.md's "every commit updates
docs/DECISIONS.md" rule directly. Caught on review before starting Part 3, corrected here in a
dedicated follow-up commit rather than amending the earlier ones — same discipline as the
2026-08-13 scaffold entry's own "caught after the fact... corrected in the very next commit"
note.

### 2026-08-15 — Phase 7: comprehension on-ramp (CODE-TOUR, WHY, WEAKEST-POINTS)
Context: the user won't have watched this built and has a limited block to defend every line —
asked for a reading order (not a summary that makes reading the code optional), the arguable
design decisions a different engineer might have made differently, a ranked five-file priority
list, and a blunt ranking of where this submission is weakest.
Choice: `docs/CODE-TOUR.md` orders all 15 real source files server-first (signing → types →
client → routes → bootstrap) then web (api → App → Inspector → boundary → mount), each with
"responsible for / pay attention to / what breaks if wrong" rather than restating what the code
already says — deliberately did not paraphrase logic, per the request that reading it shouldn't
become optional. A "five files, in this order" section sits at the top rather than as a separate
file, since it's a distillation of the same list, not a different one. `docs/WHY.md` picked seven
decisions that are genuinely arguable — a different competent engineer really could have chosen
differently on each — rather than re-justifying the out-of-scope items already covered in
`docs/ARCHITECTURE.md`, which aren't arguable so much as bounded by CLAUDE.md directly. Rated the
`App.tsx`-as-one-component choice as close to a coin flip rather than defending it as clearly
right, since it's the one on the list that's grown past where it was originally a clean fit.
`docs/WEAKEST-POINTS.md` ranks the credential-in-git-history issue first, ahead of anything about
the code itself — asked to be blunt and ranked by likelihood of being found, and a real, still-
unresolved credential exposure outranks every design trade-off in this project by a wide margin.
Alternatives rejected: writing `WEAKEST-POINTS.md` to lead with something more comfortable (test
coverage, scope generality) and bury the credential issue lower in the list — rejected as the
kind of soft self-assessment this entire session has been working against; the whole point of a
"read this so I'm not surprised" doc is that it doesn't do that.
AI note: no code changed in this phase either — writing `docs/WHY.md` required re-reading each
decision's original DECISIONS.md entry to state the trade-off accurately rather than from memory
of having made it, which surfaced that the timeout-value and MOCK_MODE-nulling decisions were
already documented with their reasoning elsewhere; `WHY.md`'s job was framing the same facts as
"what would a different engineer have done," not rediscovering them.

### 2026-08-15 — Phase 6: submission package (ARCHITECTURE rewrite, DEMO-SCRIPT, PANEL-QA)
Context: this session's brief asks for a submission package distinct from the working
prototype — a presentable architecture diagram, a rehearsable demo script with a stated fallback,
and honest answers to the hardest questions the submission invites, then a final clean-clone
re-verification.
Choice: consolidated `docs/ARCHITECTURE.md`'s two diagrams (a flowchart and a separate sequence
diagram) into one flowchart, per the brief's framing that it's "the single diagram permitted in
the presentation" — solid lines for what's actually built, dashed lines for the four out-of-scope
items at the exact point each would attach (an eligibility gate before the offer call, a webhook
receiver and settlement job hanging off XCover's side, an order store neither currently writes
to), plus the fail-open branch. Folded the webhook section's separate sequence diagram into prose
so the doc has exactly one diagram total, matching the instruction literally rather than just in
spirit. `docs/DEMO-SCRIPT.md`: a numbered click path with the point being made at each step
stated explicitly (not just "click X"), real observed latencies from `docs/API-NOTES.md` for
timing expectations, and a fallback section that doesn't require stopping the demo — `MOCK_MODE`
now covers all 35 market×quantity combinations (Phase 5), so the fallback path shows real
recorded numbers, not placeholder ones, and says so explicitly rather than relying on the
Inspector's own label to disclose it. `docs/PANEL-QA.md`: fifteen questions, weighted toward the
ones with an uncomfortable honest answer (the credential exposure is #1, ahead of the four topics
Session 2's brief named by name) rather than softballs — a "hardest questions" doc that avoids the
actual hardest question isn't useful to whoever reads it before the panel does.
Re-verified README from a fresh clone one more time after all of the above (`npm install` → `npm
run test` → `npm run lint` → `npm run dev` → health checks → a spot-check MOCK_MODE call against
a fixture added in Phase 5, `IT` × quantity 4, confirming the expanded fixture set survived the
clone) — not assumed still-correct just because it passed earlier in the session.
Alternatives rejected: writing `PANEL-QA.md`'s answers to sound reassuring rather than accurate —
rejected throughout this project on the same grounds CLAUDE.md states directly: an unbuilt
feature or an unresolved ambiguity, honestly labeled, is a better answer than a confident-sounding
one that doesn't hold up to a follow-up question from a former developer.
AI note: no new code changed in this phase — pure documentation, verified by re-running the exact
commands the docs describe (the clean clone, the lint/test suite) rather than trusting that
describing them correctly meant they'd still pass.

### 2026-08-15 — Phase 5: adversarial review (blind subagent), one critical finding and three high-severity fixes
Context: per this session's brief, spawned a fresh subagent with only the review brief and the
repo path — no context from this session's own work, so it evaluated what exists, not what was
intended. It was told to act as a sceptical panel of senior solutions engineers (two ex-developers),
find what would embarrass the candidate live, check seven specific angles (undocumented API use,
hardcoded-value fragility, credential exposure including git history, a fresh README clone, unhandled
error paths, unsupported doc claims, and the three hardest questions), verify everything against
actual commands/output rather than trusting the repo's own docs, and report by severity without
fixing anything. Full findings were cross-checked against direct evidence before acting on any of
them (re-ran the exact commands myself; did not act on the subagent's word alone).

**Critical — confirmed, fixed the exposure going forward, cannot fully remediate alone.** The real
live XCover sandbox secret (`.env`'s `XCOVER_API_SECRET`) was hardcoded as the HMAC test vector's
`SECRET` in `server/src/signing.test.ts`, committed at `e072e9a` and present unchanged in every
commit since — verified directly with `git show e072e9a:server/src/signing.test.ts` and `grep`
against the current `.env`, byte-identical. The "independently-computed via OpenSSL" framing was
true of the *signature*, but obscured that the *secret* itself was the real credential, not a
synthetic one. Fixed going forward: replaced with a synthetic secret and a freshly, independently
OpenSSL-computed vector for it (cross-checked against the implementation before committing to it,
same discipline as the original). **Not fixed, and outside what I'll do unilaterally**: the real
secret is still recoverable from this repo's git history (`git log -p`), and rewriting shared
history (filter-branch/BFG, or force-pushing a squashed history) is exactly the kind of
destructive, hard-to-reverse operation this environment's own guidance says requires explicit
authorization, not something to do automatically because a review flagged it. Flagged directly to
the user, not just logged here: **the credential should be treated as compromised and rotated with
Cover Genius regardless of what happens to this repo's history**, since it's been in a
world-readable state (to anyone who cloned or was given repo access) since the second work session.

**High, confirmed and fixed — MOCK_MODE Confirm Offer showed currency-mismatched figures with no
disclaimer.** The Phase 4 fix only patched top-level `total_price`; everything else (tax, premium,
the nested `quotes[0].tax`, `policyholder`) stayed from the one static `confirm-offer.json`
fixture. Verified live: confirming a GBP offer returned `total_price_formatted: "£454.43"` sitting
next to `total_tax_formatted: "US$38.50"` — a currency-mismatched, arithmetically-nonsensical
response (the "without tax" figure exceeded the total) that `mockNote` reported as `null`
(i.e., "this is a clean match"), the opposite of true. Fixed: `findMarketProductById`
(`server/src/fixtures.ts`) now returns the matched product's tax/premium figures alongside price;
`mockedConfirmOffer` (`server/src/xcoverClient.ts`) overrides every currency-shaped field from that
match, echoes the real requested quote id (rather than the static fixture's unrelated one — this
also makes the id traceable into Cancel, next), and echoes the customer's actual submitted
`policyholder` instead of the fixture's hardcoded "Jamie Rivera." `commission` is nulled rather
than left mismatched — no market fixture has real commission data without `extra_fields=commission`
(Phase 3), so null is the honest value, not a guess. Extended `ConfirmOfferResponse`
(`server/src/xcoverTypes.ts`) to type these fields properly rather than relying on structural
looseness. Re-verified live (GBP confirm now shows `£13.23` tax, `£441.20` premium, real submitted
policyholder) and via the same Phase 4 Playwright regression script (still 0 console errors).

**High, confirmed and fixed — MOCK_MODE Cancel Booking was fully static, unrelated to the booking
being cancelled.** Every cancellation, regardless of what was booked, returned
`fixtures/cancel-booking.json` verbatim: customer "Alex Chen," refund $477.05. This is the fixture
meant to demonstrate CLAUDE.md scope item 6 (avoiding duplicate compensation on cancellation) — an
unrelated customer's refund figure undermines the one thing this demo path exists to show. Fixed:
`mockedCancelBooking` (new, `server/src/xcoverClient.ts`) applies the same `findMarketProductById`
match (now reachable because Confirm echoes back the real quote id) to override currency/refund
figures, and **nulls the policyholder entirely** rather than show a name — Cancel Booking's request
never includes policyholder details at all, so there is no honest value to show, only the static
fixture's leftover one. `adjustment_fee` is also nulled (can't be derived without reimplementing
the cancellation/proration math, which is out of scope the same way rating is). Extended
`CancelBookingResponse` to type the new fields. Re-verified live: cancelling the GBP booking above
now returns `currency: "GBP"`, `total_refund_formatted: "£454.43"`, and an all-null policyholder.

**High, confirmed and fixed — a stale claim in this file's own record contradicted the shipped
code.** The 2026-08-13 "Server proxy" entry states routes mirror XCover's HTTP status; the actual,
current behavior (routes always return 200, real status inside `capture.status`) was decided in
the *next* entry down and never backported as a correction to the first. Added an inline
correction rather than rewriting the original sentence — this file's value is the record of what
was believed and decided at each point, not a live reference.

**High, addressed (not a code bug, a coverage gap) — MOCK_MODE only had offers for 8 of 35
market×quantity combinations the UI exposes** (7 markets × qty 1, plus US × qty 3); every other
combination hit the honest-but-empty `mockNote` path built in Phase 2. Disclosed, not silent, but
the review's point stands: a panelist touching both the market and quantity selectors — the two
most prominent controls — had roughly a 3-in-4 chance of landing on "no offer" in the mode this
app runs in by default. Closed by capturing the remaining 27 combinations live (all 7 markets ×
quantities 1-5, `fixtures/markets/create-offer-{CC}[-qty{N}].json`, 35 files total) — same pattern
as Phase 2, still just recorded captured traffic, no rating logic added. No rate limiting hit
across the 27 calls.

**Medium, confirmed and corrected — the `npm audit` note in this file understated current severity.**
See the 2026-08-13 scaffold entry's own correction, added here rather than duplicated: same root
advisory, now reported at higher severity across more of the dependency tree (3 moderate, 1 high,
1 critical, not just "moderate"). Still a dev-server-only issue with no production exposure in
this project; not force-upgraded (breaking change, out of scope for this session), but the
documentation is now accurate about what `npm audit` actually reports today.

**Low, fixed — `handleMarketChange` (`web/src/App.tsx`) was declared `async` with no `await`
inside it.** Cosmetic; fixed for consistency with the project's own "boring, explicit code"
standard, given the panel is told to read every file.

**Not acted on — the review's other observations were re-confirmations of things already disclosed
in this project's own docs, not new findings**: the `context`-schema and SHA-512-vs-SHA-256
ambiguities (already in `docs/OPEN-QUESTIONS.md`, already empirically resolved); the README clean-clone
claim (re-verified independently by the review, passed); no credential reachable from `/web` code
or fixtures (confirmed — only the git-history exposure above is real).
AI note: the credential-in-git finding is the clearest example in this whole project of exactly
what CLAUDE.md's hard constraint 1 is worried about, just arriving via the "obviously test-only,
so it must be fine" blind spot rather than a browser-facing one — a synthetic value would have
served the test equally well from the start, and nothing about copying the real secret into the
test file was ever flagged as suspicious by any check that ran (lint, typecheck, the tests
themselves all passed, every session) until a reviewer looked at *why* that specific string was
chosen rather than just whether the test passed.

### 2026-08-15 — Phase 4: browser verification with Playwright, caught and fixed a real MOCK_MODE price mismatch
Context: the Inspector's on-screen rendering hadn't been verified since the original build session
(a throwaway Playwright pass, not part of the repo). Needed to actually drive the UI, not re-read
the code — Phase 1's own AI note already flagged that reading the code wasn't enough to catch the
204-body bug in the original build.
Choice: throwaway Playwright scripts (`npm install --no-save playwright` in the scratchpad only —
not added to the project's `package.json`, consistent with CLAUDE.md's "no unused dependencies in
the final state"), driving the real dev server via Chromium. Covered: US market opt-in end to end
including the cancellation flow, CA market decline, a market/quantity combination with no
recorded MOCK_MODE fixture (GB × qty 3), a market/quantity combination that *does* have one (US ×
qty 3), and — separately, with `.env` temporarily pointed at a broken host (backed up first,
restored and `diff`-verified after, same discipline as Phase 1) — the unreachable-host and
timeout failure paths from Phase 1. Checked `console --errors` after every run: none, across all
of it.
**Found a real bug this way, not by re-reading Phase 2's code**: confirming any plan in
MOCK_MODE showed the one static `confirm-offer.json` fixture's price ($1321.95) regardless of
which plan/market was actually offered and selected — visible in a screenshot as "Protection
confirmed... US$1321.95" immediately under an offer that had shown $585.85. This is the exact
market/quantity contradiction Phase 2 fixed for Create Offer, one step later in the flow, that
Phase 2 didn't catch because it never drove the actual confirm step against a Phase-2-selected
offer. Fixed: `findMarketProductById` (`server/src/fixtures.ts`) searches every recorded market
fixture for the product id being confirmed and `mockedConfirmOffer`
(`server/src/xcoverClient.ts`) overrides just the price/currency fields on the static booking
template with the matched product's real recorded price — re-verified via the same Playwright
script afterward, screenshot now shows the correct $585.85. Left the nested `tax`/`total_premium`/
`commission` breakdown fields as the static fixture's original (now slightly inconsistent)
figures rather than recomputing them proportionally — recalculating a tax breakdown from a price
would cross into "reimplementing rating logic," which Phase 2's own brief explicitly ruled out;
noted here as a stated, deliberate residual limitation rather than left silent.
Did not browser-test the malformed-body/500 failure paths from Phase 1 specifically — those were
verified server-side with curl in Phase 1, and the frontend's rendering code doesn't branch by
failure *cause*, only by `networkError` vs `status >= 400` (already exercised by every 4xx
captured throughout this project) vs a thrown exception (exercised by the unreachable-host
browser test) — a third browser round-trip through the identical rendering branch wouldn't add
information, so time went to the DNS-failure and timeout paths instead, which are genuinely
distinct UX (the 10s wait, the loading-state-stays-disabled behavior) and hadn't been visually
confirmed before.
Alternatives rejected: adding `@playwright/test` as a real devDependency — rejected, this is
verification tooling for this session, not a test suite CLAUDE.md asked for (the one required
unit test, the HMAC vector, already exists); a committed E2E suite would be a legitimate future
addition but is scope beyond what was asked here.
AI note: the confirm-offer price bug is a good example of a defect that only exists at the
*integration* of two otherwise-correct pieces (Phase 2's market-aware Create Offer, the
untouched static Confirm Offer) — neither Phase 2's own testing (curl against Create Offer in
isolation) nor a code read of either file in isolation would surface it, only actually clicking
through Create Offer -> select a plan -> confirm and looking at the resulting screen.

### 2026-08-15 — Phase 3: resolved x-idempotency-key and the two-step cancellation flow, live; ported both to Postman; app not rewired
Context: two carried-over questions from the brief. (1) The double-confirm 422 finding (Session
1.5) was observed *without* an idempotency key — docs describe different behavior with one
(`offers/api/idempotency-keys.md`: 409 returning a cached original result, 423 while still
processing, 48h retention) that was never tested. (2) The Postman collection's Cancel (Confirm)
posts to `/cancel` again rather than the documented two-step
`bookings/{id}/confirm_cancellation/{cancellation_id}/`.
Choice: tested both live before writing anything. `x-idempotency-key`: confirmed a repeat
confirm with the identical key+body returns `409` with the *same* booking in the body (not a new
one), matching the docs exactly (`fixtures/probe/idempotency-key-first.json`,
`idempotency-key-repeat.json`); `423` (the documented concurrent-race case) wasn't reproduced —
the two calls were sequential, not concurrent, and reproducing a genuine race deliberately felt
like more engineering than the question warranted, so it's logged as documented-not-tested in
`docs/API-NOTES.md` rather than asserted. `confirm_cancellation`: confirmed the documented
two-step flow works end-to-end on this account — `preview:true` has *always* returned a real
`cancellation_id` in every capture this project has made (including the original Session 1.5
probe, not previously followed up on), and calling `confirm_cancellation` with it actually
finalizes the cancellation with real refund figures (`fixtures/probe/cancel-twostep-preview.json`,
`cancel-twostep-confirm.json`). Also verified `include_content`/`extra_fields` (documented query
params, not body fields) live — `extra_fields=tax,commission,benefits,surcharge` is the only way
`commission.total_amount` comes back non-null in any capture in this repo
(`fixtures/probe/extra-fields-test.json`), relevant to the settlement out-of-scope item in
`docs/ARCHITECTURE.md`. Ported all four (idempotency key, two-step cancel, extra_fields,
include_content) into `postman/xcover-realcheap.postman_collection.json` as new folders, plus a
Runner-drivable market-matrix request (`postman/market-matrix.postman_data.json`, 7 markets + 1
quantity variant) — verified every new request via Newman against live, not just written and
assumed correct (folder 4: 2/2 pass; folder 5: 2/2 pass, one live 429 hit and retried
successfully as part of verification, not a flake worked around; folder 6: 16/16 pass across 8
Runner iterations).
**Deliberately did not rewire the app** to use either mechanism, even though both are the "more
correct" documented behavior. The top-level brief for this session is explicit: "Do not rebuild
anything that works. Do not restructure the codebase." Both of `App.tsx`'s current mechanisms
(the 422-with-booking-ID double-confirm guard, the single-call `preview:false` cancel) are
demonstrated working against live and already covered by Phase 1's error-surfacing work — neither
is broken, so touching them would be scope creep against an explicit instruction, not hardening.
Recorded here per the brief's own instruction to record deliberate non-fixes with reasoning
rather than just doing them silently.
**Correction (2026-08-17, Phase 9, caught by `docs/REACHABLE-STATES.md` #8 in the prior
session):** calling the 422 path a "guard" overstates what `App.tsx` actually does with it. The
422's body does contain the existing booking id in its message text, but `handleOptIn` never
parses or uses it — on any `capture.status >= 400` it sets one generic string ("XCover rejected
the confirmation (…) — see Inspector for details.") and stops. There is no recovery logic; a
double-confirm just shows a rejection, exactly like any other 4xx. "Demonstrated working against
live" was accurate (the call does go out and does get a real, non-crashing 422 back); "guard" was
not — nothing in the code branches on or extracts the booking id from that response. Phase 9 made
this moot for the common case anyway: `x-idempotency-key` now means a same-offer retry (double
click or network-timeout retry) gets `409` with the real cached booking and is treated as success,
not a 422 the user has to read a message about at all. Left the original sentence in place rather
than rewritten, per this file's own rule.
Alternatives rejected: reproducing the `423` race condition with concurrent requests — would
need real parallelism (e.g. `Promise.all` with two truly simultaneous calls) for a documented
edge case that doesn't affect this build either way; not worth the added live-API load for a
fact that's already stated plainly enough in the docs to trust without independent verification,
unlike the SHA-512/SHA-256 and `context`-schema ambiguities which *did* warrant empirical
resolution because guessing wrong there would have silently broken the whole integration.
AI note: capturing the `extra_fields` test surfaced that `commission.total_amount` had been
`null` in literally every prior capture in this repo (all of Session 1.5's fixtures, the
original build fixtures) — not a bug, just a query param nobody had passed, caught by trying it
rather than by re-reading old fixtures and wondering why the field was always null.

### 2026-08-15 — Phase 2: MOCK_MODE fixture selection by market/quantity, replacing the single static fixture
Context: the original `fixtures/create-offer.json` was one static capture, always returned
regardless of request — a known, previously-documented limitation (2026-08-13 web-checkout
entry). In a fallback demo (sandbox down, forced into MOCK_MODE live) that becomes a visible
contradiction: switching markets in the UI would change the *request* shown in the Inspector but
never the *response*, always showing identical USD pricing.
Choice: promoted the Session 1.5 probe's 7 real market captures
(`fixtures/probe/market-{CC}.json`) into `fixtures/markets/create-offer-{CC}.json`, trimmed to
just the response body, plus one fresh live quantity variant
(`create-offer-US-qty3.json`) captured for this phase specifically rather than reusing the
2-day-old Session 1.5 numbers — pricing had already been observed to drift over time for
identical inputs (`docs/SANDBOX-CAPABILITIES.md` Probe 3), so a fresh capture is a more honest
"this is what MOCK_MODE shows" than a stale one. `xcoverClient.ts`'s new `mockedCreateOffer`
selects by `${country}` or `${country}-qty${quantity}`, reading the fixture directory live via
`listFixtureKeys` rather than hardcoding the list (can't drift from what's actually on disk).
Deleted the now-dead `fixtures/create-offer.json` and its one call site — CLAUDE.md's "no dead
code" applies to fixtures the same as source.
This is still "recording captured traffic," not a rating engine, per the brief's explicit
instruction — 8 fixed files, no interpolation or estimation between them. A request for any
other market/quantity combination gets an honest `capture.mockNote` explaining exactly what's
missing and what *is* recorded, and `offer: null` rather than a fabricated price — the frontend
routes this through the same fail-open path Phase 1 built (`decision: "unprotected"` /
"Continue without protection"), which already existed for a very similar situation (offer
unavailable), so no new UI branch was needed, just a new reason to reach the existing one.
Alternatives rejected: interpolating between recorded quantities/markets to approximate a
missing combination — explicitly what the brief warns against ("do not build a rating engine"),
and CLAUDE.md hard constraint 2 (never invent) applies just as much to a fabricated price as an
invented field name. Silently falling back to the nearest recorded fixture — rejected because
that's exactly the "serve a wrong one" the brief says not to do; a demoer who doesn't notice the
mockNote could present a fabricated price as real.
AI note: capturing the fresh qty=3 fixture surfaced a new, unprompted finding: at quantity 1,
every market except Italy prices its 2-year plan above its 3-year plan (Probe 3); at quantity 3
in the US specifically, that ordering flips too (2yr $1139.94 < 3yr $1244.48, vs 2yr $585.85 >
3yr $532.29 at quantity 1). Not investigated further — same reasoning as the Italy anomaly, and
explicitly out of scope to reverse-engineer XCover's rating curve — but logged in
`docs/OPEN-QUESTIONS.md` #5 rather than left as a number nobody would notice.

### 2026-08-15 — Phase 1 hardening: fail-open error handling, after confirming the process actually crashed
Context: Session 2's brief opened by asserting "a network failure to XCover currently kills the
Node process" — rather than take that on faith, reproduced it first: `MOCK_MODE=false` with
`XCOVER_API_DOMAIN` pointed at an unresolvable host, hit `/api/offers`. Server log showed an
uncaught `TypeError: fetch failed` and the process died; the client got a connection reset, not
an HTTP error. Confirmed the premise before writing any fix.
Choice: three-layer fix, one per failure class (`docs/ARCHITECTURE.md` "Failure handling" has the
full breakdown). (1) `xcoverClient.ts`'s `request()` now catches fetch failures and timeouts
itself and returns `capture.status: 0, capture.networkError: <reason>` instead of throwing —
this is the failure class that used to crash the process, so it gets handled at the source
rather than caught further up. (2) A 10s `AbortController` timeout — no published SLA exists (checked
`offers/api/reference.md` directly), so this is `// ASSUMPTION:` marked in code and logged in
OPEN-QUESTIONS.md, justified by ~230ms-2.8s observed live latency giving >3x headroom. (3)
`JSON.parse(text)` guarded — a non-JSON body (e.g. an HTML error page from an intermediate
gateway) now degrades to a raw-text capture instead of throwing. (4) `asyncHandler` wraps every
route as defense-in-depth for anything not already caught by (1)-(3), feeding a terminal Express
error middleware instead of an uncaught exception; `process.on("unhandledRejection", ...)` is the
last-resort net beneath that. (5) Frontend: `handleOptIn`/`handleDecline`/`handleCancel` gained
try/catch and a visible `actionError` — previously a failed call did nothing observable at all,
which is arguably worse than a crash for a demo (a silent no-op looks like the click didn't
register). (6) `decision: "unprotected"` + "Continue checkout without protection" button: the
actual fail-open behavior CLAUDE.md's principle requires — Create Offer failing for any reason no
longer blocks the purchase. (7) `ErrorBoundary` class component wraps `<App />` in `main.tsx` for
render-time crashes, a different failure class from anything XCover-related.
Alternatives rejected: reaching for `express-async-errors` (a one-line fix, but an added
dependency for something four short route handlers don't need — CLAUDE.md's "no unused
dependencies" and "boring explicit code" both point at writing the ~8-line `asyncHandler.ts`
instead). Retrying failed XCover calls automatically — rejected for this prototype: a demo
benefits from a failure being visible and immediate (the fail-open button), not silently retried
and delayed; a real integration might retry, but that's product behavior beyond this scope.
Verification: broke it four ways for real, not just read the fix and assumed it worked —
unresolvable host (`ENOTFOUND`, via `.cause` unwrapping added after the first attempt returned
the unhelpful generic "fetch failed"), a non-routable `192.0.2.1` address (confirmed the 10s
timeout fires at ~10.0s exactly), a real HTTPS host returning HTML instead of JSON
(`example.com`), and a real `500` from a local throwaway HTTP server. All four returned a clean
`200` proxy response with the failure captured, and `/api/health` stayed reachable after each —
the process never went down again. `.env` was backed up before any of this and restored
byte-for-byte afterward (`diff` confirmed), and all throwaway processes were killed.
AI note: the first attempt at the unresolvable-host test produced `networkError: "fetch failed"`
— technically correct but useless for actually debugging a real outage, since Node's `fetch`
puts the real reason (`ENOTFOUND`, etc.) in `err.cause`, not `err.message`. Caught by reading the
Inspector-facing output of my own test, not by reading MDN's fetch docs first — fixed by
unwrapping `err.cause` when present. This is exactly the kind of gap that only running the
failure surfaces; the code would have "worked" (not crashed) with the unhelpful message too.

### 2026-08-15 — Session 1.5 sandbox capability probe, run retroactively against an already-built app
Context: the Session 1.5 probe prompt is written to run *before* any application code exists —
it explicitly says "do not build any application code this session." By the time it was run,
`/server`, `/web`, fixtures, and all four docs already existed (2026-08-13 commits). Rather than
silently ignore the mismatch, it's recorded here: most of Probes 1/2/4/5(partial) were already
answered empirically during the build and are cited from `docs/OPEN-QUESTIONS.md` /
`docs/DECISIONS.md` rather than re-run from scratch. This session's actual new work closed the
real gaps: the other 6 markets (only US had been tested), quote TTL/expiry, idempotent
re-confirm, cancellation reversibility, and real captured failure shapes — plus the two
deliverables that didn't exist yet: the Postman collection and `docs/SANDBOX-CAPABILITIES.md`.
No application code (`/server`, `/web`) was touched.
Choice: throwaway probe script at `scripts/probe/probe.ts` (root level, separate from the
committed `server/scripts/probe-schema.ts` dev tool — this one reimplements signing inline with
zero dependency on the app's build graph, matching the brief's "throwaway" framing), dumping
every captured request/response to `fixtures/probe/`. ~30 live calls made against
`api.xcover-staging.com`; all test bookings created during probing were cancelled afterward to
leave the sandbox clean.
Two real findings surfaced that weren't expected going in: (1) confirming the same offer twice
returns a 422 referencing the existing booking ID rather than silently succeeding or creating a
duplicate — confirms the build's existing double-click handling assumption was right without
ever having tested it; (2) Opt Out Offer returns 204 even when called on an offer that was
already Confirmed in the same run — not expected, reproduced twice (manually and via Newman),
now flagged in `docs/OPEN-QUESTIONS.md` #4 as a question for Cover Genius rather than a build
change, since the built checkout's linear flow can't trigger this sequence today.
Alternatives rejected: re-running Probes 1/2/4 from a blank slate to match the letter of the
"before the build" framing — rejected as wasted live-API calls against findings that were
already correct and already cited with evidence; the honest move was to flag the sequencing
mismatch (done above and to the user directly) and spend the session on the actual gaps.
AI note: the Postman collection's first draft asserted (in a request description) that "an
already-confirmed offer cannot be opted out" — a plausible-sounding assumption written before
testing it. Running the collection end-to-end via Newman falsified that assumption immediately
(the Opt Out request returned 204 against an already-confirmed offer_id in the same run) — caught
by actually executing the artifact being built, not by re-reading it, which is exactly the kind
of thing CLAUDE.md's hard constraint 2 (never invent behavior, verify) is warning against. The
description was corrected and the finding promoted into `docs/OPEN-QUESTIONS.md` #4. Also caught:
`probe.ts`'s save-to-file path did `JSON.parse(body)` on the raw request body for the saved
record, which crashed (uncaught) on the deliberately-malformed-JSON error probe — the response
itself printed fine to stdout, but the file never got written. Worked around by hand-writing that
one capture (`fixtures/probe/err-malformed.json`) rather than fixing the throwaway script, since
it's not reused elsewhere and fixing it wasn't worth the scope.

### 2026-08-13 — Excluded the assignment brief PDF from version control
Context: the original case-study brief (`CSE Interview Candidate Case Study - Retail China.pdf`)
was sitting in the repo root, predating this session's work.
Choice: gitignored rather than committed — it's Cover Genius's own document about the interview
process, not project source, and doesn't belong in an artifact the panel will read as code.
Confirmed against the actual brief text that the built prototype's scope matches what's asked
for: retrieve/visualize a laptop's coverage, opt-in/decline, and expose live request/response
data on the frontend are exactly the three bulleted "should" requirements: everything else in
the brief's "Technical Considerations" (eligibility engine, webhook claims, full settlement)
is context, not a requirement, and CLAUDE.md's decision to diagram-rather-than-build those
matches the 12-hour scope note in the brief.
AI note: reading the actual brief (rather than working only from CLAUDE.md's paraphrase of it)
surfaced two dead hyperlinks lost in the PDF export — the presentation slide template and the
"developer hub" docs link both render as plain text with no URL. Flagged to the user rather
than guessing at a URL, consistent with hard constraint 2.

### 2026-08-13 — README.md, verified against an actual clean clone
Context: CLAUDE.md calls out README run instructions as "an explicit submission requirement and
it will be tested" — so it needs to actually work, not just read plausibly.
Choice: `git clone` → `npm install` → `cp .env.example .env` → `npm run dev`, with MOCK_MODE
explained as the reason it works with zero real credentials out of the box. Also documented
`server/scripts/probe-schema.ts` as a reusable tool (not just a one-off), since a panelist
asking "how did you find the schema" deserves a runnable answer, not just a description.
Verification: actually ran `git clone` of the local repo into `/tmp` and walked through the
README's exact commands against that clean checkout — not just re-reading the steps. First
attempt failed instructively: cloned before committing README.md itself, so the clone didn't
have it — a reminder that "I wrote a file" and "the file is verifiable from a clean clone" are
different claims, and only the second one satisfies this constraint.

### 2026-08-13 — docs/ARCHITECTURE.md for the explicitly out-of-scope items
Context: CLAUDE.md lists four things to give "an architecture diagram and a verbal answer, not
code" — the eligibility rules engine, the claims webhook receiver, settlement/reconciliation,
and auth/persistence/order management.
Choice: one doc with a Mermaid flowchart of what's actually built (browser → proxy → XCover,
with the MOCK_MODE fixture branch shown explicitly) and a sequence diagram of the real request
flow, then a section per out-of-scope item explaining what it would do, why it's out of scope
for *this* prototype specifically (not scope in general), and where it would plug into the
existing pieces. The webhook section also gets a small sequence diagram since "where does
verification/idempotency/the booking-ID mapping happen" is exactly the kind of question a
technical panel would ask and a diagram answers faster than prose.
Alternatives rejected: a generic "this is out of scope" one-liner per item — CLAUDE.md asks for
enough to answer panel questions verbally, which means the reasoning has to actually be present,
not just the conclusion.
AI note: Mermaid diagrams are plain text in the markdown file, so nothing to verify by running
code here — verified by re-reading each diagram against the actual route/field names already
confirmed live (e.g. `partner.transaction_id`, `commission.partner_commission` are real fields
from the captured fixtures, not invented ones, since the settlement section references them as
where reconciliation would hook in).

### 2026-08-13 — Web checkout UI, and a real bug caught by driving it in a browser
Context: needed the checkout flow CLAUDE.md describes — product + market/quantity selection,
protection offer, opt-in/decline, Inspector, cancellation demo — as a single-page app talking
only to the `/api` proxy (never XCover directly, never touching credentials).
Choice: one `App.tsx` holding flow state (`offer`, `decision`, `booking`, `cancellation`, an
ordered list of Inspector `entries`) rather than a router or state library — it's a single
linear checkout flow, and CLAUDE.md explicitly excludes styling/architecture beyond what's
needed for legibility. Offer fetching is button-triggered, not an automatic effect on
market/quantity change, so every XCover call is a deliberate, visible user action reflected in
the Inspector — matches the "Inspector is a first-class feature" requirement better than a
debounced auto-fetch would. Policyholder fields are pre-filled but editable, since the panel
scope doesn't include auth/persistence and a blank form add friction without adding anything to
demo.
Verification: no browser available directly, so used a throwaway Playwright script (not part of
the repo — scratchpad only) to actually launch Chromium, click through both the opt-in and
decline paths across two markets, and check `console --errors`. This caught a real bug that
reading the code would not have: **Opt-out Offer's route mirrored XCover's `204` status onto our
own proxy response** (`res.status(capture.status).json(...)`). A 204 response must have no body
per HTTP spec, and Node strips it even when you call `.json()` on it — so the frontend's
`postJson` got an empty body where it expected `{result, capture}` and crashed with
`SyntaxError: Unexpected end of JSON input`. Fixed by decoupling the two: the proxy's own HTTP
status now always reflects "did the proxy call succeed" (stays 200), while the real upstream
status lives in `capture.status`, which the Inspector reads directly. Re-verified live (not just
mocked) that a real XCover 204 now correctly reaches the frontend inside a 200-wrapped envelope.
Also noted, not fixed: in MOCK_MODE, the Create Offer response is a single static fixture, so
switching markets changes the *request* correctly (visible in Inspector) but the mocked
*response* still shows USD regardless of the market selected. This is an inherent limitation of
a hand-recorded fixture, not a bug — building a fixture that dynamically reflects arbitrary
market input would mean re-implementing XCover's rating logic client-side, which is exactly the
"real-time rules engine" CLAUDE.md puts out of scope. Live mode (`MOCK_MODE=false`) doesn't have
this limitation.
Alternatives rejected: mirroring upstream status by only special-casing 204 (e.g. `res.sendStatus(204)`
when capture.status===204, res.status(capture.status).json(...) otherwise) — rejected because it
would have made the Inspector unable to show the opt-out call's capture data at all (no body =
no way to send the `capture` object to the frontend for that one endpoint), which defeats the
entire point of the Inspector being able to show every call.
AI note: The bug above is a good example of why "read the code" isn't enough verification for
UI work — the TypeScript compiler, ESLint, and even the server's own MOCK_MODE curl tests
(task 5/6) all passed with this bug present, because none of them exercised the actual
browser-side fetch/JSON-parse path against a real 204. Only driving the real checkout flow in a
browser surfaced it.

### 2026-08-13 — Server proxy: per-endpoint client functions, MOCK_MODE folded in rather than layered on top
Context: needed the Express routes (create/confirm/opt-out offers, cancel bookings) plus the
MOCK_MODE fixture switch (hard constraint 4) and the Inspector's request/response capture
(architecture requirement) all at once, now that the real schema was known.
Choice: `xcoverClient.ts` exports one function per XCover operation (`createOffer`,
`confirmOffer`, `optOutOffer`, `cancelBooking`), each a 3-line `mockMode ? mocked(...) :
request(...)` branch, rather than a generic path-matching dispatcher. Considered a table-driven
approach (map of regex → fixture name) first but rejected it — CLAUDE.md prefers boring
explicit code over clever abstraction, and four short functions are easier to read than one
regex table. Both `request` (live) and `mocked` (fixture) return the same `{data, capture}`
shape so routes don't care which path was taken. Headers are redacted in the capture object
for *both* modes (mock mode fabricates a plausible-looking redacted header set) so the
Inspector panel looks and behaves identically regardless of MOCK_MODE — the panel shouldn't be
the tell that you're in mock mode. Routes mirror the upstream HTTP status (`res.status(capture.status)`)
rather than always returning 200, so a 422 from XCover surfaces as a 422 from our own API too.
**Correction (2026-08-15, caught in the Phase 5 adversarial review):** this sentence describes
design intent, not what shipped — the *next* entry below ("Web checkout UI... a real bug caught
by driving it in a browser") explains why that approach was reverted for the 204 case and never
reinstated for the others: the proxy's own HTTP status always stays 200, and the real upstream
status lives only inside `capture.status`. Left uncorrected for two work sessions after the
actual behavior changed — a stale claim in this file's own graded decision record is exactly the
kind of inconsistency CLAUDE.md tells the panel to read for. Not editing the original sentence
out, since the point of this file is the record of what was believed and decided at each point,
not a live API reference — see `server/src/routes/offers.ts`'s own comment for the current,
accurate behavior.
Alternatives rejected: a single generic `callXCover(method, path, body)` with fixture lookup
by regex-matched path — more DRY but more indirect; explicit per-operation functions read
top-to-bottom without needing to mentally execute a matcher.
AI note: Model wrote the client, types, and routes from the real captured schema (previous
decision entry) — no field names invented. Caught one real mismatch while wiring `package.json`:
generated `@types/express@^5.0.0` against `express@^4.21.2` (a version-mismatched types
package, which would have produced confusing incorrect-overload errors down the line rather
than an obvious failure) — corrected to `@types/express@^4.17.21` before it caused problems.
Verified the whole thing by actually running the server in both `MOCK_MODE=true` and
`MOCK_MODE=false` and curling all four routes, not just by reading the code: mock mode returns
the captured fixtures with a correctly-empty-body 204 for opt-out; live mode created a real
offer against the sandbox and the capture object showed the API key/signature genuinely
redacted (`45Bc...a6b0`, not the full key).

### 2026-08-13 — Discovered E3CCM's offer schema and confirmed auth against the live sandbox
Context: `context`'s schema for Create Offer is undocumented publicly (docs/OPEN-QUESTIONS.md
#2), and the HMAC algorithm was ambiguous across doc pages (#1). Needed real answers before
building the server routes and fixtures.
Choice: probed the live sandbox directly (`server/scripts/probe-schema.ts`, kept as an `npm
run probe -w server` dev tool rather than deleted, since it's a legitimate way to re-verify
against a live partner config later). Iterated from an empty body through successive 422s to
discover `context: { purchase_date, product: { retail_value, quantity } }`. This confirmed
`E3CCM`'s sandbox runs a custom `cse-interview-retail` offer schema — a two-year/three-year
extended-warranty product built specifically for this interview, not a generic public offer
type (`policy_code: "CSEINTPR"`, underwriter "Acasta European Insurance Company Limited").
Also confirmed SHA-512 is correct (request accepted, no 403) and that `quantity` measurably
changes the rated price ($663.68 at qty 1 vs $1321.95 at qty 3, for the same $1200 retail
value — not linear, some server-side rating curve, which is fine to leave as an API black box).
Ran the full lifecycle live: create → confirm (opt-in) → booking `EWGGB-V2G64-INS`; a second
create → opt-out (204, no body, as documented); cancellation both via preview→confirm and via
immediate cancel with `refund_required:false`. Real, captured responses are now
`fixtures/*.json` for MOCK_MODE, not invented shapes.
Alternatives rejected: inventing a plausible `context` shape from the parcel-shipping vertical
example — explicitly prohibited by hard constraint 2, and would have been wrong anyway (that
vertical has no product/quantity/retail_value fields, since it's a different vertical).
AI note: The `refund_required:false` test (scope item 6, duplicate-refund avoidance) came back
inconclusive rather than confirming the field does what the docs implied — `refund_amount` in
the cancel response was identical whether the flag was `false`, `true`, or omitted, because
`E3CCM` has `xpay_refund_enabled:false` and `automatic_refund_by_xcore:false` (no payout
mechanism wired up regardless of the flag). This is exactly the kind of finding that's tempting
to paper over with a confident-sounding claim; recorded as inconclusive in OPEN-QUESTIONS.md
#3 instead, since asserting the mechanism works based on identical-either-way output would have
been the same mistake as guessing a field name outright.

### 2026-08-13 — HMAC-SHA512 signing implemented with an independently-computed test vector
Context: CLAUDE.md requires the signing function to have a unit test against a known vector,
since a subtle bug here breaks every call. Cover Genius's docs provide worked examples but no
official test vector to assert against.
Choice: implemented `signDate`/`buildAuthorizationHeader` per `authentication.md` exactly —
sign the literal string `"date: {date}"` with HMAC-SHA512, base64 (strict RFC 4648), then
URL-encode. For the test vector, computed the HMAC independently via `openssl dgst -sha512
-hmac` on the command line (not via Node, so the test isn't just asserting the codebase agrees
with itself), then hand-verified the URL-encoding step separately.
Alternatives rejected: asserting only "signature is a non-empty string" (would not catch a
wrong algorithm, wrong signed-string format, or a URL-safe-base64 bug — exactly the failure
mode the docs warn about: "some languages will URL safe base64 encode... this will cause a
'Signature string does not match!' error").
AI note: Model wrote `signing.ts` and the test from the authentication.md excerpt. First draft
of `rfc822Date` included a no-op `.replace("GMT", "GMT")` that did nothing — caught on re-read
before commit and removed rather than left as dead code. The OpenSSL vector was generated and
cross-checked by hand before being pasted into the test, specifically so the test has an
authority independent of the implementation it's checking.

### 2026-08-13 — Logged two doc ambiguities before writing any integration code
Context: CLAUDE.md hard constraint 3 requires stopping and recording ambiguities in
`docs/OPEN-QUESTIONS.md` rather than guessing. Two were found while reading the partner docs:
the HMAC algorithm (`authentication.md` says SHA-512; the offer reference pages say SHA-256 in
passing) and the `context` object schema for Create Offer (documented only as "schema-defined
fields," with no example body anywhere public — the parcel/shipping vertical page, the closest
analogue to shipped goods, explicitly defers to a Customer Success Engineer for examples).
Choice: wrote both up in `docs/OPEN-QUESTIONS.md` before touching `signing.ts` or the offer
routes, then proceeded with a provisional resolution for each (SHA-512; discover `context`
fields by probing the live sandbox and reading 422 errors) so the build isn't blocked, while
flagging both as things to confirm with Cover Genius directly.
Alternatives rejected: guessing silently and moving on — explicitly what CLAUDE.md says not to
do; skipping the sandbox probe and inventing plausible `context` field names — also explicitly
prohibited (hard constraint 2, never invent field names).
AI note: Both ambiguities were caught by actually reading the fetched doc pages side by side,
not assumed. The SHA-512 vs SHA-256 conflict in particular is exactly the kind of thing that's
easy to miss if you stop reading after the first page that mentions an algorithm.

### 2026-08-13 — Repo scaffold: npm workspaces, Express/TS server, Vite/React/TS web
Context: Starting from an empty repo (just `CLAUDE.md`, `.env`, `.env.example`, `.gitignore`).
CLAUDE.md mandates the `/server` (Express+TS) and `/web` (Vite+React) split and a single
`npm run dev` / `npm run test` / `npm run lint` at the root.
Choice: npm workspaces (`server`, `web`) under one root `package.json`, so `npm install` at
the root wires up both without a separate package manager. `tsx watch` for the server dev
loop (fast, no separate build step needed for dev). `vitest` for server unit tests — pairs
naturally with Vite/TS, single test runner. Flat-config ESLint (`eslint.config.js`) with
`typescript-eslint`, since flat config is now the ESLint default and avoids the legacy
`.eslintrc` cascade. `concurrently` to run both dev servers under one `npm run dev`, matching
the command CLAUDE.md specifies verbatim.
Alternatives rejected: pnpm/yarn workspaces (no reason to add a second package manager for a
two-package prototype); Jest for tests (extra config to bridge ESM/TS that vitest gives for
free); a single unified server+web package (would blur the "server never exposes the API
secret" boundary CLAUDE.md calls out as a hard constraint — keeping them as separate packages
makes that boundary a directory boundary, not just a convention).
AI note: Fully generated scaffold (package.json files, tsconfig, eslint config, placeholder
`index.ts`/`App.tsx`/`main.tsx`). Verified by actually running `npm install` and booting both
dev servers (`curl localhost:3001/api/health` → `{"ok":true}`, `curl localhost:5173/` → 200)
rather than assuming the config was correct. `npm audit` flagged esbuild advisories via the
vite/vitest dev-dependency chain (GHSA-67mh-4wv8-2f99) — read the advisory: it's a dev-server
request-handling issue, not a runtime/production risk, so left as-is rather than force-upgrading
into breaking changes.
**Update (2026-08-15, Phase 5 adversarial review):** re-ran `npm audit` on a fresh clone — it now
reports the same single advisory as **5 findings (3 moderate, 1 high, 1 critical)**, not the
"moderate" this entry originally implied. Confirmed it's still one root cause, not new
vulnerabilities: every finding traces back to the same `esbuild <=0.24.2` advisory, just
propagated through more of the `vite`/`vitest`/`vite-node`/`@vitest/mocker` dependency tree than
when this was first checked — npm's severity rollup, not a new issue. The fix
(`npm audit fix --force`) upgrades to `vitest@4.1.10`, a breaking major-version change; not taken
in this session per its own instruction not to restructure working parts of the codebase. Still a
dev-server-only issue (the advisory is about the Vite dev server accepting arbitrary requests from
other websites) with no production exposure in this project's actual usage, but "critical"
appearing in a fresh `npm install` deserves an accurate label in this file, not the original
undersold one — a panelist who runs `npm audit` themselves and finds "1 critical" after reading
"moderate" here would reasonably read that as the candidate not having rechecked their own claim.
Caught after the fact: the first commit omitted this file, violating
CLAUDE.md's "every commit updates DECISIONS.md" rule — corrected in the very next commit rather
than amending, per the project's own git-safety guidance against amending.
