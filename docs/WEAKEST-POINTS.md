# Weakest points

Five places this submission is most vulnerable, ranked by how likely a sceptical panel is to
find them. Blunt, on purpose.

## 1. The real sandbox secret is still in this repo's git history

`server/src/signing.test.ts` hardcoded the live `XCOVER_API_SECRET` as a test vector from the
first signing commit onward. It's fixed in the current file (a synthetic secret now), but
`git log -p` still recovers the real one from every commit before the Phase 5 fix. Anyone with
read access to this repo's history has had a live credential the entire time. This is the single
most likely thing to actually embarrass this submission, because it's not a design trade-off
that can be defended in conversation — it's a mistake, it's still sitting in the history, and the
only real fix (rotating the credential, and deciding whether to rewrite history before this goes
further) hasn't happened yet. See `docs/PANEL-QA.md` #1.

## 2. MOCK_MODE's data integrity has already been wrong twice

Confirm Offer showed a stale, unrelated price after the market-fixture work (Phase 4); then,
after that fix, still showed currency-mismatched tax/premium figures and a fabricated identity on
Cancel Booking (Phase 5). Both are fixed now and re-verified live, but the pattern — a mock
response silently wrong in a way the Inspector didn't flag — happened twice in the same session,
in the same feature area, each time found by a different verification method (a screenshot, then
a blind review) than the one that would've caught the previous instance. That's not proof a
third instance exists, but it's not proof one doesn't, either, and it's a fair basis for a
panelist to ask what else in the mock path hasn't been exercised.

## 3. The one scope item most explicitly named — duplicate-compensation avoidance — is unverifiable on this sandbox

CLAUDE.md names this by name: "demonstrating how duplicate compensation is avoided when RealCheap
issues its own refund." The `refund_required` field is set correctly and the call is real, but
this partner has no payout mechanism enabled at all (`xpay_refund_enabled: false`), so there's no
way to observe whether the flag actually does anything. The demo can show the *call*, not the
*effect* — and that gap is in the one place CLAUDE.md was most specific about wanting a
demonstration, not a generic corner of scope.

## 4. No automated test coverage beyond the signing vector

One unit test in the whole project. Every other piece of verification this session did —
~90 live API calls, Playwright browser passes, the adversarial review — was manual and
one-time. None of it re-runs on the next change. The two MOCK_MODE bugs above are exactly the
class of regression that a route-level integration test (fast, no live credentials, just
MOCK_MODE) would have caught automatically instead of needing a human to notice a wrong number
in a screenshot. This is defensible for a scoped prototype (CLAUDE.md's own testing bar is
narrow) but it's a real gap, not a stylistic choice, if this code changes again without someone
re-running the same manual passes.

## 5. This is a single-product, single-session, no-persistence demo shape that doesn't obviously generalize

One hardcoded laptop, one linear checkout flow with no login and no order history, 35 fixture
files keyed by exact market/quantity combinations. None of that is a criticism of what CLAUDE.md
actually asked for — it explicitly excludes a second product, persistence, and auth. But it means
the honest answer to "how would this extend to RealCheap's real catalog" is "most of the current
design would need to change," not "this scales as-is" — the market/quantity fixture-matching
approach in particular is a MOCK_MODE-only convenience that has no equivalent shape once there's
more than one product line. Worth having a clear, non-defensive answer ready for that question
rather than being caught implying more generality than what's actually here.
