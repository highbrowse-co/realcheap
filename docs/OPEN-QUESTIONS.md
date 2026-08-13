# Open questions for Cover Genius

Ambiguities found in the public docs (`partner-docs.covergenius.com`) that this prototype
resolved provisionally, but that should be confirmed with Cover Genius directly per
CLAUDE.md's "if the docs are ambiguous, say so and stop" rule.

## 1. HMAC algorithm: SHA-512 or SHA-256?

`offers/api/authentication.md` — the page dedicated to authentication — documents SHA-512 as
the recommended algorithm and uses it in every worked example ("SHA1 (deprecated) / SHA256 /
SHA384 / SHA512 (recommended, used in all examples)"), with the header literally showing
`algorithm="hmac-sha512"`.

The Create Offer and Confirm Offer reference pages, by contrast, describe the same
`X-Api-Key` / `Date` / `Authorization` scheme as "HMAC-SHA256 signature of canonical request
components" — no worked example, just that one line.

**Provisional resolution**: implemented SHA-512, on the theory that the page whose entire
purpose is documenting the signing algorithm outranks a one-line paraphrase on unrelated
reference pages. Confirmed against the live sandbox (`E3CCM`) — a SHA-512-signed request was
accepted, ruling out SHA-256 as intended for this partner/environment. See
`docs/DECISIONS.md` for the entry logging that verification.

**Ask Cover Genius**: is the "HMAC-SHA256" wording on the offer reference pages simply stale
copy, or does the algorithm vary by product line / partner config?

## 2. `context` object schema for Create Offer is undocumented

`offers/api/reference/create-offer.md` describes the request body's `context` field only as
"schema-defined fields" validated by "a schema-driven approach" — no public page enumerates
what those fields are for any given offer/product config. The closest thing to a worked
example, `offers/vertical-examples/parcel-shipping.md` (shipped goods being the nearest
analogue to RealCheap's marketplace), has no request body either — it explicitly says a full
example collection is only available by contacting a Customer Success Engineer. Quantity-based
rating for a multi-unit line item is not mentioned in any public page.

**Provisional resolution**: discovered the actual field names by calling Create Offer against
the live sandbox for partner `E3CCM` and reading the 422 validation error's field list, then
iterating to a 200. See `docs/DECISIONS.md` for exactly what came back and
`fixtures/create-offer.json` for the real captured shape.

**Ask Cover Genius**: is there a document describing the `E3CCM` sandbox's offer schema(s) and
their `context`/quantity fields, so future integration work doesn't depend on reverse-engineering
422 responses?
