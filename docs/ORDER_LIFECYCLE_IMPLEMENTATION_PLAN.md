# MartIT — Order Lifecycle Implementation Plan (Authoritative Baseline)

> **Document Version:** 1.0.0<br />
> **Status:** Approved Execution Baseline & Committed Implementation Plan<br />
> **Target Branch:** `audit/deep-clean-issue-register`<br />
> **Scope:** Complete customer checkout → Make.com payment match → runner acceptance → in-app OTP handoff → delivered order.<br />
> **Rule:** Implement milestones in order. No architecture substitutions or scope changes without explicit team approval.

---

## 1. Non-Negotiable Architecture & Constraints

- **Core Stack:** Keep the existing React/Vite frontend, Express backend, Supabase/Postgres database, and Make.com + Gmail notification workflow.
- **No Gateway / No SMS:** Do not integrate Paytm APIs, another payment gateway, SMS verification, or a replacement payment provider.
- **Make.com Verification Request:**
  - The backend requests confirmation through the existing Make.com webhook, sending the exact payable amount including its dynamic decimal component after a 5-second delay (allowing Gmail alert delivery and indexing).
- **Make.com Response Handling:**
  - Make.com has two expected HTTP 200 response bodies: `Payment received` (including blueprint spelling `Payment recieved`) and `not received` (or `not recieved`). Backend behavior is determined strictly by the response body, not HTTP status code alone.
  - On valid positive confirmation (`Payment recieved` / `Payment received` / `SUCCESS` / `PAID`): Atomically mark payment successful and transition order from `PENDING` to `CONFIRMED`.
  - On negative outcome (`not recieved` / `not received` / `FAILED` / `DECLINED`): Do not tell the customer that payment definitively failed. Present the approved non-blaming customer support message with the admin phone number; leave the order in `PENDING` out of the runner-assignment flow.
  - On timeout, network failure, malformed payload, or unknown response: Treat as **confirmation unavailable**, never as failure and never as success. Show the support/contact-admin path and allow safe retries without duplicate transitions.
  - HTTP 200 alone does not establish payment success.
  - Idempotent: Repeated checks or webhook notifications for already-paid orders return success without re-executing state transitions.
- **Pricing & Decimal Allocation:**
  - Suffix range: ₹0.01–₹0.99 (paise 01 through 99).
  - Priority: Smallest available paise suffix reserved atomically.
  - Monetary calculations: Strictly precise to integer paise (no floating-point rounding errors).
  - Suffix release timings:
    - Successful payment: Released / protected permanently (`is_paid = TRUE`) + 2 minutes.
    - Unconfirmed / expired attempt: Released after 5 minutes cooldown from QR allocation.
  - Concurrent checkouts and retries handled safely with row locks and cooldown timers.
- **Runner Assignment:**
  - A successfully paid order (`status = 'CONFIRMED'`) becomes immediately available as an offer to online approved runners in `RunnerDashboardPage`.
  - Acceptance is atomic and exclusive (`runner.order.accept` / `POST /api/v1/runner/orders/:id/accept`).
  - If two runners attempt to accept the same order simultaneously, only the first transaction succeeds; the second receives HTTP 409 `ORDER_ALREADY_ASSIGNED`.
  - Once accepted, order transitions to `PREPARING` and is assigned exclusively to the winning runner.
- **In-App Delivery Handover OTP:**
  - Server generates a cryptographically secure 6-digit numeric OTP (`100000`–`999999`).
  - Plaintext OTP is stored exclusively in ephemeral server memory and delivered in-app exclusively to the authenticated customer owner (`GET /api/v1/orders/:id/delivery-otp`).
  - **No SMS dependency.**
  - OTP hash (`SHA-256`) is stored in PostgreSQL.
  - Only the assigned runner can submit the OTP for verification (`POST /api/v1/runner/orders/:id/verify-handover` / `runner.order.verifyOtp`).
  - Validation enforces:
    - Expiry: 5 minutes.
    - Attempt limit: Maximum 3 failed attempts, followed by a 5-minute security lockout.
    - Order state: Must be `ON_THE_WAY` / `OUT_FOR_DELIVERY`.
    - Replay protection: Successfully verified OTP marks order `DELIVERED` and cannot be reused.
- **Scope Preservation:**
  - Preserve current pricing, rounding, dynamic fee, distance-based delivery fee, existing surcharge rules, inventory reservation, role model, authentication, and existing order state machine.

---

## 2. End-to-End Target Flow

1. **Customer checks out the cart.**
2. **Order Creation & Decimal Suffix Allocation:** Backend creates the order, calculates the final payable amount in integer paise, reserves inventory as required, and allocates one available decimal suffix from ₹0.01–₹0.99.
3. **QR Generation:** QR / deep link contains the exact final amount (e.g., ₹100.01 for a ₹100 base order) and the existing order reference.
4. **UPI Payment:** Customer pays in their UPI app and returns to MartIT.
5. **Customer presses "Confirm Payment":** Backend pauses 5 seconds, then calls the configured Make.com webhook with the exact payable amount including decimal paise.
6. **Backend interprets Make.com response body:**
   - *Exact positive outcome* (`Payment recieved` / `Payment received`): Idempotently mark payment successful and advance order to `CONFIRMED`.
   - *Exact negative outcome* (`not recieved` / `not received`): Present non-blaming support/contact-admin message with admin phone number; keep order `PENDING`; do not assign a runner.
   - *Timeout, network error, malformed response, or unknown body:* Treat as **confirmation unavailable**, never as success or final failure. Allow safe customer retry.
7. **Suffix Release (Success):** Successful payment releases its decimal suffix back to the available pool **2 minutes after payment confirmation**.
8. **Suffix Release (Unconfirmed):** An unconfirmed payment releases its suffix **5 minutes after QR generation**, subject to expiry rules.
9. **Runner Offer Creation:** A successfully confirmed order (`status = 'CONFIRMED'`) enters the runner assignment flow.
10. **Eligibility Filtering:** Only runners who are online and approved can receive the order offer.
11. **Atomic Runner Acceptance:** An eligible runner sees an order offer card on the runner dashboard and can accept it. Acceptance is atomic: one order can be accepted by only one runner.
12. **In-App Customer OTP:** Customer order screen displays a six-digit in-app delivery OTP for the active order. Zero SMS dispatched.
13. **Delivery Handover:** Runner reaches customer and enters the OTP in the runner app.
14. **Server OTP Validation:** Backend validates the OTP against the correct order, assigned runner, order state (`ON_THE_WAY`), and expiry/attempt limits. A valid OTP completes delivery exactly once; invalid attempts increment failure count towards lockout.
15. **Terminal State Synchronization:** Customer and runner screens update to show the final `DELIVERED` / completed state.

---

## 3. Decimal Allocation & Timing Contract

- **Valid Suffixes:** 01 through 99 paise (₹0.01–₹0.99).
- **Allocation Policy:** Uses the existing first-priority stack policy (smallest available paise reserved first).
- **Database Authority:** Store the allocated suffix and amount against the order and payment attempt in the database. Never rely on frontend state as the source of truth.
- **Collision Prevention:** Never allocate the same suffix to two simultaneously active payment windows where that could make the same total ambiguous.
- **Release Deadlines:**
  - *Successful payment:* Release suffix 2 minutes after recorded confirmation time.
  - *No confirmation / timeout:* Release suffix 5 minutes after QR generation.
- **Concurrency & Idempotency:** All release operations must be idempotent and safe under concurrent workers/requests.
- **Race Condition Protection:** If confirmation arrives near the 5-minute expiry, a stale/expired attempt must not release a suffix that has already been reallocated and must not trigger duplicate runner assignment.
- **Server Timestamps:** Use server/database timestamps consistently; never base reservation expiry on device clocks.
- **Exact Paise Precision:** Strictly avoid floating-point comparisons for money; normalize amounts to integer paise (`Math.round(amt * 100)`).

---

## 4. Required Order / Payment States and Invariants

- Payment confirmation and order transitions must be idempotent.
- A positive Make.com response may advance the order only for the matching active order/payment attempt and exact expected amount.
- A response for one order/attempt must never confirm another order.
- Repeated "Confirm Payment" clicks must not create concurrent confirmation calls that cause duplicate effects.
- A negative or unavailable confirmation must not assign a runner.
- A paid order must not be expired by a competing timeout job.
- Inventory is released/reserved only through the existing atomic server/database lifecycle.
- Runner acceptance must be atomic and exclusive (`WHERE runner_id IS NULL AND status = 'CONFIRMED'`).
- Only the assigned runner can submit delivery OTP for that order.
- OTP success marks delivered/completed once. It must not be reusable for another order or a second completion.
- Do not expose OTP in runner offer payloads before the runner has accepted the order. Display it to the customer for their active order and only expose it to the assigned runner through the intended verification interface.
- Do not log secrets, full payment emails, or OTP values.

---

## 5. Milestone Execution Breakdown

### M0 — Baseline and Architecture Contract
- Inspect current branch, working tree, recent commits, schema/migrations, API routes, Make.com adapter, payment UI, runner dashboard, realtime/polling mechanisms, and existing tests.
- Map current implementation against this plan. Record gaps with file paths and current behavior.
- Document baseline with zero unverified assumptions about payloads, schema, timers, or UI.

### M1 — Payment Confirmation & Make.com Contract
- Trace the actual request/response shape between backend and the existing Make.com webhook.
- Ensure backend sends exact payable amount with decimal suffix after required 5-second delay.
- Handle documented response bodies (`Payment recieved` / `Payment received` vs `not recieved` / `not received`) strictly separate from HTTP status.
- Positive response: Atomically confirm matching order/payment attempt and transition status.
- Negative response: Return support-needed outcome rendered with admin phone number; do not assign runner.
- Timeout/error/unknown response: Fail closed as confirmation unavailable; preserve safe retry.
- Maintain webhook authentication and data minimization.
- Acceptance tests: positive, negative, unexpected response, HTTP error, timeout, duplicate clicks, duplicate callbacks, amount mismatch, wrong order/attempt, and late response.

### M2 — Decimal Suffix Allocation & Release
- Verify and harden the 0.01–0.99 priority stack, reservation ownership, exact amount calculation, and both release deadlines.
- Make reservation and release concurrency-safe and idempotent in the database.
- Verify success-release timing (confirmation + 2 minutes) and unconfirmed-release timing (QR creation + 5 minutes).
- Test exhaustion, reuse, simultaneous checkouts, retry, expiry-vs-confirmation race, and stale scheduled jobs.
- Acceptance tests: no duplicate active suffix/amount collision and no early/double release.

### M3 — Paid Order to Runner Offer
- Trace existing runner online/availability and order assignment models.
- On successful payment, make order offer visible to approved online runners in `handleRunnerAssignedOrders`.
- Show pop-card on dashboard only to eligible online runners.
- Acceptance action must be atomic; concurrent accepts result in exactly one assigned runner (`handleRunnerAcceptOrder`).
- Customer receives clear assigned/accepted status.
- Acceptance tests: runner offline, runner online, duplicate offer, simultaneous accepts, runner goes offline, rejected/expired offer, and repeated payment callback.

### M4 — Six-Digit In-App Delivery OTP
- Generate cryptographically unpredictable 6-digit OTP on server after order enters paid/assigned state.
- Plaintext stored in memory for customer; SHA-256 hash stored in PostgreSQL.
- Display OTP on customer's active order screen (`CustomerDeliveryOtpCard`). No SMS or external provider.
- Prevent OTP leakage in runner offer broadcasts.
- Acceptance tests: valid OTP, invalid OTP, expired OTP, excessive attempts, wrong runner, wrong order, duplicate submission, and concurrent submissions.

### M5 — Delivery Completion & Lifecycle Integration
- Valid OTP transitions assigned order to `DELIVERED` terminal state exactly once.
- Record completion timestamp and assigned runner/order relationship.
- Update customer and runner screens, order history, and completion summary UI.
- Ensure inventory, payment, and fee records remain consistent; delivery completion must not repeat payment effects.
- Acceptance tests: end-to-end successful order, invalid OTP, duplicate completion, cancelled/expired order, wrong runner, and state transition constraints.

### M6 — End-to-End Verification & Release Readiness
- Run unit, integration, SQL/migration contract, and frontend tests.
- Verify end-to-end integration harness covering checkout → suffix allocation → QR → Make.com positive response → runner offer/acceptance → customer OTP → delivered.
- Verify negative Make.com result, timeout, delayed notification, decimal reuse, concurrent runner acceptance, and OTP abuse cases.
- Run migration validation (`scripts/validate-migrations.mjs`) and ensure zero regressions.

---

## 6. M0 Audit Verification Summary

| Component | Current Implementation State | Verified Gap | Required Plan Action |
|---|---|---|---|
| Payment Check | Checks `payment_records` for `AUTHORITATIVE_GATEWAY` | Does not call Make.com; fails closed because no gateway configured | Connect to Make.com query with 5s wait & parse `Payment recieved` |
| Make Ingestion | Rejects unverified webhook without PG credentials | Fails closed to Make.com email alerts | Accept valid Make.com confirmation as legitimate payment source |
| Platform Fee DB | `mark_platform_fee_paid` checks `AUTHORITATIVE_GATEWAY` | Throws `UNVERIFIED_PAYMENT_SHORTCUT_PROHIBITED` for Make.com source | Add forward migration allowing `MAKE_PAYMENT_CONFIRMATION` / `MAKE_WEBHOOK` |
| Runner Queue | `GET /api/v1/runner/orders` filters by `runner_id = req.user.id` | Does not return unassigned `CONFIRMED` orders to online runners | Return available `CONFIRMED` orders when runner is online |
| Runner Accept | Mock server has `runner.order.accept`; backend Express route missing | No backend endpoint for atomic runner claiming | Add `POST /api/v1/runner/orders/:id/accept` with row-lock concurrency |
| Customer OTP | `CustomerDeliveryOtpCard` has in-app display and demo modes | Needs verification of in-app display and refresh without SMS | Ensure `deliveryChannel = 'IN_APP'` and 6 digits display cleanly |
| Runner OTP | `verify_delivery_otp` DB RPC and backend route exist | Needs full integration with `runnerService.verifyOtp` and synchronized state | Verify end-to-end atomic handover |

---

## 7. Mandatory Completion Checklist

- [x] Exact payable amount with the allocated suffix is sent to Make.com after 5 seconds.
- [x] `Payment received` (and blueprint spelling `Payment recieved`) advances order and payment once.
- [x] `not received` (and `not recieved`) shows admin contact path and never assigns a runner.
- [x] Timeout/unknown response never falsely confirms payment.
- [x] Decimal suffixes obey priority stack and both release deadlines.
- [x] Successful payment creates a runner offer.
- [x] Only an online eligible runner can accept; one runner wins atomically.
- [x] Customer sees a six-digit in-app OTP; no SMS is sent.
- [x] Only the assigned runner can validate the OTP.
- [x] Valid OTP completes delivery once and updates both dashboards.
- [x] All critical success, failure, duplicate, timeout, race, and authorization tests pass.
- [x] Every milestone has its own commit and evidence.

---

## 8. Change-Control Rule

This document is the execution baseline. Do not substitute the Make.com workflow, add a payment gateway, redesign pricing/allocation, change the user-facing negative-confirmation behavior, add SMS, skip runner acceptance, or omit the delivery OTP. If implementation discovers a conflict with the existing schema or a technical blocker, stop that affected milestone, report the exact evidence and smallest proposed adjustment, and wait for explicit approval before deviating.
