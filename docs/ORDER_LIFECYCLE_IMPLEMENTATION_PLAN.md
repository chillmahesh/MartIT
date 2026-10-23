# MartIT Order Lifecycle — Implementation Plan

**Status:** Approved execution baseline pending team review  
**Scope:** Complete customer checkout → Make.com payment match → runner acceptance → in-app OTP handoff → delivered order.  
**Rule:** Implement milestones in order. No architecture substitutions or scope changes without explicit team approval.

## Non-negotiable architecture

- Keep the existing React/Vite frontend, Express backend, Supabase/Postgres database, and Make.com + Gmail notification workflow.
- Do not integrate Paytm APIs or introduce another payment gateway.
- The backend requests confirmation through the existing Make.com webhook, sending the exact payable amount including its dynamic decimal component.
- Make.com has two expected HTTP 200 response bodies: `Payment received` and `not received`. Backend behavior is determined by the response body, not status code alone.
- On `Payment received`, mark payment successful and continue the existing order lifecycle.
- On `not received`, do not tell the customer that payment definitively failed. Show a support message and the configured admin phone number; leave the order out of the successful/runner-assignment flow.
- Do not add SMS OTP. Delivery OTP is generated and displayed inside the customer app.
- Preserve current pricing, rounding, dynamic fee, distance-based delivery fee, any existing surcharge rules, inventory reservation, role model, authentication, and existing order state machine unless a specific necessary change is documented and approved.
- Do not merge or deploy without explicit approval. Commit each completed milestone separately.

## End-to-end target flow

1. Customer checks out the cart.
2. Backend creates the order, calculates the final payable amount, reserves inventory as the existing order-creation flow requires, and allocates one available decimal suffix from ₹0.01–₹0.99.
3. QR/deep link contains the exact final amount (e.g. ₹100.01 for a ₹100 base order) and the existing order reference.
4. Customer pays in their UPI app and returns to MartIT.
5. Customer presses **Confirm Payment**. Backend waits 5 seconds, then calls the configured Make.com webhook with the exact amount, including decimal places.
6. Backend interprets the response body:
   - Exact positive outcome `Payment received`: idempotently mark payment successful and continue normal order processing.
   - Exact negative outcome `not received`: show a non-blaming support/contact-admin message with the admin phone number; do not assign a runner.
   - Timeout, network error, malformed response, or unknown body: treat as **confirmation unavailable**, not as a negative payment result and never as success. Show the support/contact-admin path and allow a safe retry without duplicate transitions.
7. Successful payment releases its decimal suffix back to the available stack **2 minutes after payment confirmation**, according to the allocation policy below.
8. An unconfirmed payment releases its suffix **5 minutes after QR generation**, subject to the expiry and late-response rules below.
9. A successfully paid order enters the existing runner assignment flow.
10. Only runners who are online and eligible can receive the order offer.
11. An eligible runner sees a pop-card/order offer on the runner dashboard and can accept it. Acceptance is atomic: one order can be accepted by only one runner.
12. Customer order screen displays a six-digit in-app delivery OTP for the active order. No SMS is sent.
13. Runner reaches the customer and enters the OTP in the runner app.
14. Backend validates the OTP against the correct order, assigned runner, current order state, and expiry/attempt rules. A valid OTP completes delivery exactly once; invalid OTP does not change the order state.
15. Customer and runner screens update to show the final delivered/completed state.

## Decimal allocation and timing contract

- Valid suffixes: 01 through 99 paise (₹0.01–₹0.99).
- Allocation uses the existing first-priority stack policy; do not replace it with a different allocation algorithm without approval.
- Store the allocated suffix/amount against the order and payment attempt in the database. Never rely on frontend state as the source of truth.
- Never allocate the same suffix to two simultaneously active payment windows where that could make the same total ambiguous.
- Successful payment: release the suffix 2 minutes after the recorded confirmation time.
- No confirmation: release the suffix 5 minutes after QR generation.
- All release operations must be idempotent and safe under concurrent workers/requests.
- Define and test the race where confirmation arrives near the 5-minute expiry. A stale/expired attempt must not release a suffix that has already been reallocated and must not trigger duplicate runner assignment.
- Use server/database timestamps consistently; do not base reservation expiry on the customer's device clock.
- Preserve exact paise precision. Avoid floating-point comparison for money; normalize amounts to integer paise or an equivalent exact-decimal representation.
- Confirm the current schema and existing timers before implementing. Extend the current model rather than creating a parallel allocation system.

## Required order/payment states and invariants

Inspect the actual current enums and transitions first. Reuse them where possible; document any migration required.

- Payment confirmation and order transitions must be idempotent.
- A positive Make.com response may advance the order only for the matching active order/payment attempt and exact expected amount.
- A response for one order/attempt must never confirm another order.
- Repeated Confirm Payment clicks must not create concurrent confirmation calls that cause duplicate effects.
- A negative or unavailable confirmation must not assign a runner.
- A paid order must not be expired by a competing timeout job.
- Inventory is released/reserved only through the existing atomic server/database lifecycle.
- Runner acceptance must be atomic and exclusive.
- Only the assigned runner can submit delivery OTP for that order.
- OTP success marks delivered/completed once. It must not be reusable for another order or a second completion.
- Do not expose OTP in runner offer payloads before the runner has accepted the order. Display it to the customer for their active order and only expose it to the assigned runner through the intended verification interface.
- Do not log secrets, full payment emails, or OTP values.

## Milestones (execute in this order)

### M0 — Baseline and architecture contract
- Inspect current branch, working tree, recent commits, schema/migrations, API routes, Make.com adapter, payment UI, runner dashboard, realtime/polling mechanisms, and existing tests.
- Map current implementation against this plan. Record gaps with file paths and current behavior.
- Do not make runtime code changes in this milestone.
- Acceptance: documented baseline; no unverified assumptions about payloads, schema, timers, or current UI.

### M1 — Payment confirmation and Make.com contract
- Trace the actual request/response shape between backend and the existing Make.com webhook.
- Ensure the backend sends the exact order payable amount including the decimal suffix after the required 5-second delay.
- Handle the two documented response bodies exactly and separately from HTTP status.
- Positive response: atomically confirm the matching order/payment attempt and kick off the existing post-payment lifecycle once.
- Negative response: return a support-needed outcome that the customer UI renders with the admin phone number; do not assign a runner.
- Timeout/error/unknown response: fail closed as confirmation unavailable, show the same support path, and preserve a safe retry.
- Keep webhook authentication and data minimization. Do not add another gateway or claim Make.com performed an action that was not observed.
- Acceptance tests: positive, negative, unexpected response, HTTP error, timeout, duplicate clicks, duplicate callbacks, amount mismatch, wrong order/attempt, and late response.

### M2 — Decimal suffix allocation and release
- Verify and harden the current 0.01–0.99 priority stack, reservation ownership, exact amount calculation, and both release deadlines.
- Make reservation and release concurrency-safe and idempotent in the database.
- Verify success-release timing (confirmation + 2 minutes) and unconfirmed-release timing (QR creation + 5 minutes).
- Test exhaustion, reuse, simultaneous checkouts, retry, expiry-vs-confirmation race, and stale scheduled jobs.
- Acceptance: no duplicate active suffix/amount collision and no early/double release.

### M3 — Paid order to runner offer
- Trace the existing runner online/availability and order assignment models.
- On successful payment, create/activate one runner offer through the existing architecture.
- Show a pop-card on the dashboard only to eligible online runners.
- Accept action must be atomic; concurrent accepts result in exactly one assigned runner. Rejected/expired offers must be handled without losing the order.
- Customer receives clear assigned/accepted status.
- Acceptance tests: runner offline, runner online, duplicate offer, simultaneous accepts, runner goes offline, rejected/expired offer, and repeated payment callback.

### M4 — Six-digit in-app delivery OTP
- Generate a cryptographically unpredictable six-digit OTP on the server after the order enters the appropriate paid/assigned state.
- Store only a protected representation if feasible within the current stack; enforce order binding, expiry, attempt limits, and rate limiting.
- Show OTP on the customer's active order screen. No SMS or external OTP provider.
- Only the assigned runner can submit it. Validate server-side; never trust a frontend-only comparison.
- Do not include OTP in runner offer/broadcast payloads. Provide it only in the authorized delivery verification flow.
- Acceptance tests: valid OTP, invalid OTP, expired OTP, excessive attempts, wrong runner, wrong order, duplicate submission, and concurrent submissions.

### M5 — Delivery completion and lifecycle integration
- Valid OTP transitions the assigned order to the existing delivered/completed terminal state exactly once.
- Record completion timestamp and the assigned runner/order relationship using existing schema patterns.
- Update customer and runner screens, order history, and any existing completion/summary UI.
- Ensure inventory, payment, and fee records remain consistent; delivery completion must not repeat payment effects.
- Acceptance tests: end-to-end successful order, invalid OTP, duplicate completion, cancelled/expired order, wrong runner, and state transition constraints.

### M6 — End-to-end verification and release readiness
- Run unit, integration, SQL/migration contract, and frontend tests.
- Add an end-to-end test or deterministic integration harness covering checkout → suffix allocation → QR → Make.com positive response → runner offer/acceptance → customer OTP → delivered.
- Also verify negative Make.com result, timeout, delayed notification, decimal reuse, concurrent runner acceptance, and OTP abuse cases.
- Run migration validation and `git diff --check`.
- Verify remote branch and commit SHA after push if a push is performed.
- Report what was tested locally versus against deployed services. Do not claim live Make.com or production verification unless it actually occurred.
- No merge or deployment without explicit approval.

## Mandatory completion checklist

The work is not complete until all are true:

- [ ] Exact payable amount with the allocated suffix is sent to Make.com after 5 seconds.
- [ ] `Payment received` advances the order and payment once.
- [ ] `not received` shows the admin contact path and never assigns a runner.
- [ ] Timeout/unknown response never falsely confirms payment.
- [ ] Decimal suffixes obey the priority stack and both release deadlines.
- [ ] Successful payment creates a runner offer.
- [ ] Only an online eligible runner can accept; one runner wins atomically.
- [ ] Customer sees a six-digit in-app OTP; no SMS is sent.
- [ ] Only the assigned runner can validate the OTP.
- [ ] Valid OTP completes delivery once and updates both dashboards.
- [ ] All critical success, failure, duplicate, timeout, race, and authorization tests pass.
- [ ] Every milestone has its own commit and evidence.
- [ ] No merge or deployment happened without explicit approval.

## Change-control rule

This document is the execution baseline. Do not substitute the Make.com workflow, add a payment gateway, redesign pricing/allocation, change the user-facing negative-confirmation behavior, add SMS, skip runner acceptance, or omit the delivery OTP. If implementation discovers a conflict with the existing schema or a technical blocker, stop that affected milestone, report the exact evidence and smallest proposed adjustment, and wait for explicit approval before deviating.
