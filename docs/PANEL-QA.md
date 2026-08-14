# Panel Q&A

Fifteen questions this submission invites, answered honestly — including the ones where the
honest answer is a limitation, not a save. Each cites where the evidence actually lives.

## 1. You committed the real XCover sandbox secret to git. What happened, and what's the fix?

It happened in `server/src/signing.test.ts`: the HMAC test vector's `SECRET` constant was the
literal, live `XCOVER_API_SECRET` from `.env`, not a synthetic value — committed at `e072e9a`
and present in every commit through the original build. Caught in the Phase 5 adversarial
review (a subagent deliberately given no context from the rest of this session, told to review
like a sceptical panel), not by any check that ran along the way — lint, typecheck, and the test
itself all passed the whole time, because none of them ask *why* a value was chosen, only whether
the code works. Fixed going forward: replaced with a synthetic secret and a freshly,
independently OpenSSL-computed vector for it (`docs/DECISIONS.md`, Phase 5 entry). **Not fixed**:
the real secret is still recoverable from this repo's git history. Rewriting shared history is a
destructive operation outside what an unattended session does on its own judgment — that's the
honest limit, not a gap in effort. The actual fix, which only Cover Genius and the credential
owner can do, is rotating that sandbox secret, and that should happen regardless of what happens
to this repo's history.

## 2. Does `refund_required: false` on Cancel Booking actually prevent a duplicate payout?

Unverified, and said so directly rather than papered over. The field is set correctly and the
call is real, but this sandbox partner (`E3CCM`) has `xpay_refund_enabled: false` and
`automatic_refund_by_xcore: false` — there's no payout mechanism wired up for this partner at
all, so `refund_amount` in the response is a calculated entitlement figure, not proof that a
payment was suppressed. Tested directly: cancelled two otherwise-identical bookings, one with
`refund_required: true` and one `false` — identical `refund_amount` either way
(`docs/OPEN-QUESTIONS.md` #3). The honest reading is that this prototype demonstrates *calling*
the documented mechanism correctly, not that the mechanism's effect has been proven. Asked Cover
Genius directly for a sandbox partner with automatic refund enabled to actually test against.

## 3. Your Inspector shows opt-out returning 204 even on an offer that's already been confirmed. Is that a bug?

Not a bug in this code — a real, empirically confirmed XCover behavior, reproduced twice (once
manually, once via the Postman collection under Newman). Calling `POST offers/{id}/opt_out/` on
an offer that already has a `CONFIRMED` booking still returns `204`, not a rejection. What that
does to the booking server-side isn't observable from an empty response body. This app's own
linear checkout flow can't trigger the sequence (you can't reach the decline button after
confirming), so it doesn't affect what's built — but it means the API itself isn't a safety net
against a *different* client calling both. Flagged to Cover Genius directly
(`docs/OPEN-QUESTIONS.md` #4): what does this actually do server-side?

## 4. The docs disagree on the signing algorithm — SHA-512 or SHA-256. How was that resolved?

`authentication.md` documents SHA-512 in every worked example; the Create/Confirm Offer
reference pages instead describe "HMAC-SHA256 signature of canonical request components" in
passing. Resolved empirically, not by picking the page that looked more authoritative: signed a
real request SHA-512 and sent it to the live sandbox — accepted, no `403`. SHA-256 was never
tried live, since SHA-512 worked on the first attempt and there was no reason to spend a second
live call disproving the alternative once the first one worked. Still an open question for Cover
Genius (`docs/OPEN-QUESTIONS.md` #1): is the SHA-256 wording stale, or does it vary by
partner/product line?

## 5. Italy prices its 3-year plan above its 2-year plan; every other market is the reverse. What does that mean?

Don't know, and said so rather than guess. Same `retail_value`/`quantity` quoted across all 7
markets: everywhere except Italy, the 3-year plan is cheaper (more time to spread the premium,
as expected); in Italy it's inverted. Investigated one step further, unprompted: at quantity 3 in
the *US*, the ordering flips too — so it isn't "Italy is special," it's that the 2yr/3yr ordering
isn't stable across market *or* quantity (`docs/OPEN-QUESTIONS.md` #5). Deliberately not
investigated further than that — reverse-engineering XCover's rating curve is explicitly out of
scope, and asking Cover Genius directly is more honest than inventing an explanation.

## 6. MOCK_MODE had real bugs — currency-mismatched confirm responses, a static cancel fixture showing the wrong customer. Doesn't that undermine the whole prototype?

It's evidence the verification process worked, not that MOCK_MODE is untrustworthy now. Both
bugs were found by *using* the app (Phase 4's Playwright pass, then the Phase 5 review), not by
someone reading the code and trusting it. Once found, both were fixed the same day, re-verified
live, and documented with the exact before/after in `docs/DECISIONS.md`. The alternative — not
looking hard enough to find them — would have been worse, not safer. MOCK_MODE's actual job
(server unreachable → still demoable) never depended on those fields being correct; the
inconsistency was cosmetic to the fallback path's core function, but cosmetic-and-visible-in-the-
Inspector is still a real defect for a tool whose whole premise is "trust what you see here."

## 7. Walk me through what happens when Create Offer fails.

Three failure classes, one governing outcome (`docs/ARCHITECTURE.md`, "Failure handling"):
XCover responds with an error (normal 4xx/5xx, shown as-is), XCover is unreachable (DNS/timeout,
`capture.networkError` set instead of a thrown exception), or something unanticipated (caught by
`asyncHandler` → Express error middleware → a last-resort `process.on("unhandledRejection")`
net). In every case the frontend shows the failure and a **"Continue checkout without
protection"** button — the purchase completes regardless. This wasn't always true: before Phase
1, an unreachable host produced an uncaught exception that killed the entire Node process, not
just the offer request. Reproduced that failure first, then fixed it, then broke it four
different ways again afterward to confirm the fix actually held.

## 8. Why does the proxy always return HTTP 200, even when XCover returns an error?

Because a 204 (from Opt Out) has no body by HTTP spec, and Node strips a 204 response's body
even when you call `.json()` on it — so mirroring XCover's status onto the proxy's own response
silently dropped the `capture` envelope the Inspector needs for exactly that one call
(`docs/DECISIONS.md`, 2026-08-13 "Web checkout UI" entry — a real bug, caught by driving the UI
in a browser, not by reading the code). Decoupling them — proxy status always reflects "did our
own server handle the request," real upstream status lives inside `capture.status` — fixed that
without losing the Inspector's ability to show every call's real outcome. One of this file's own
earlier entries (2026-08-13, "Server proxy") still describes the old mirrored-status design and
was never corrected until the Phase 5 review caught the inconsistency — fixed with an inline
correction rather than rewritten, since the point of `DECISIONS.md` is the record of what was
believed at each point.

## 9. You found the documented "correct" idempotency and cancellation mechanisms but didn't wire them into the app. Why not?

Because the ones already built work, and Session 2's brief was explicit: "do not rebuild
anything that works, do not restructure the codebase." `x-idempotency-key` (409, cached original
result) and the two-step `confirm_cancellation` flow are both confirmed live and ported into
`postman/` as reference — genuinely the more correct mechanisms per Cover Genius's own docs. But
the app's existing mechanisms (a 422-with-booking-ID double-confirm guard; a single-call
`preview:false` cancel) are also demonstrated working against live, and neither is broken.
Swapping either would be scope creep dressed as improvement. Recorded as a deliberate non-fix
with reasoning in `docs/DECISIONS.md`, Phase 3 entry, per that same session's own instruction: a
stated non-fix is defensible, not having noticed the better option would not have been.

## 10. What's your design for the eligibility engine / webhooks / settlement, and why weren't they built?

All three (plus auth/persistence) are diagrammed in `docs/ARCHITECTURE.md`'s single overview
diagram, at the exact point each would attach to what's actually built — not a separate,
disconnected "future work" list. Eligibility: a RealCheap-side check before `POST /api/offers` is
even called, since eligibility is a merchandising concern XCover's API doesn't need to know
about. Webhooks: a signed-event receiver mapping XCover's booking ID back to a real order ID,
which requires a persistent order store this prototype explicitly doesn't have. Settlement: a
scheduled job reconciling `partner.transaction_id` and `commission.partner_commission` (both
real fields, already captured in this project's fixtures) against a real ledger — meaningless to
fake, since a mock job reconciling against itself proves nothing. None of the three could be
demoed meaningfully without infrastructure CLAUDE.md explicitly puts out of scope (a real product
catalog, a real claims/notification pipeline, a real ledger).

## 11. How do you know the HMAC signing implementation is actually correct?

`server/src/signing.test.ts` asserts against a test vector computed independently via OpenSSL on
the command line — deliberately not via this codebase's own crypto call, so the test can't just
be circularly confirming itself. Beyond the unit test: every live call this project has made
(~90 across the build, Session 1.5, and Phases 1-5) used this exact signing function and got a
real `200`/`204`/documented-error back, never a `403` for a bad signature except the one
deliberately-wrong-secret test built specifically to see that shape.

## 12. What did the AI actually get wrong across this project, and how was each caught?

Not asserting a clean run — the honest list, chronological: a no-op `.replace()` in an early
draft of `rfc822Date` (caught on re-read before commit); a version-mismatched `@types/express`
package (caught wiring `package.json`, would have produced confusing type errors later);
outbound API responses treated as always-JSON until a deliberately-broken-domain test showed an
HTML error page reaching `JSON.parse` uncaught (Phase 1); an uninformative `"fetch failed"`
network-error message until the Inspector's own output showed it wasn't useful, then fixed by
unwrapping `err.cause` (Phase 1); a Confirm Offer mock that only patched the top-level price and
missed the nested tax/premium/currency fields, caught by a screenshot (Phase 4), then found to
still be *incomplete* by the Phase 5 blind review; and the credential-in-git issue above, the
most serious of all of them. The pattern across every one: nothing was caught by re-reading the
code that wrote it — each required either an independent test vector, an actual live failure, a
screenshot of the running UI, or a reviewer with no stake in the code being right.

## 13. There's one unit test in the whole project. Why no broader automated test suite?

CLAUDE.md's own testing requirement is narrow and specific: the signing function gets a unit
test against a known vector, "since a subtle bug here breaks everything and is expensive." That
bar is met. Broader coverage in this project came from a different source — actually running the
thing against the live sandbox (~90 calls across every session) and actually driving the UI with
Playwright (Phase 4) rather than a committed test suite, which is a legitimate choice for a
12-hour scoped prototype but a real gap for anything longer-lived: none of that verification
re-runs itself on the next change. A real follow-on would add integration tests against
MOCK_MODE fixtures (fast, no live credentials needed) covering the route layer specifically,
since that's exactly where the Phase 4/5 bugs lived.

## 14. If you had one more day, what would you build or fix next?

In order: rotate the leaked credential and decide on the git-history question (not code, but the
actual next action); add integration tests against MOCK_MODE so the Phase 4/5 class of bug can't
silently reappear; wire `x-idempotency-key` into the real confirm flow, since it's the
documented-correct mechanism and now proven to work; ask Cover Genius the six items in
`docs/OPEN-QUESTIONS.md`'s "To send" list rather than continuing to guess around them.

## 15. How would you know if this integration silently broke in production?

Honestly — you mostly wouldn't, as built. There's no monitoring, alerting, or logging beyond
`console.error` on the unhandled-rejection net, and no persistence of past Inspector captures
beyond the current browser tab's React state. That's consistent with CLAUDE.md's scope (no
"anything resembling a real order management system"), but it's a real limitation worth stating
plainly rather than implying the fail-open work makes this production-observable: fail-open
means the *customer* isn't blocked, not that RealCheap would notice the pattern of failures
happening. A real integration needs the capture object this prototype already builds shipped
somewhere durable (structured logs, an APM span) instead of only ever reaching a browser tab.
