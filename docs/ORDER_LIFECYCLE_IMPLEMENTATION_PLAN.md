# MartIT — Order Lifecycle Implementation Plan (Authoritative Baseline)

> **Document Version:** 1.0.0  
> **Status:** Committed Implementation Baseline  
> **Target Branch:** `audit/deep-clean-issue-register`  
> **Order Journey:** Customer checkout → UPI payment confirmation through Make.com → successful payment → runner offer → runner acceptance → six-digit in-app OTP → delivery completion.

---

## 1. Authoritative Constraints & Architecture

### 1.1 Payment Workflow
- Keep the existing Make.com + Gmail notification workflow.
- Do not integrate Paytm APIs, another payment gateway, SMS verification, or a replacement payment provider.
- When the customer taps "Check Payment Status" on the payment screen:
  1. The backend pauses 5 seconds (to allow Gmail alert delivery and indexing).
  2. The backend sends a verification query to Make.com with the exact payable amount and order ID.
  3. The backend parses the Make.com response body:
     - Distinguishes confirmed positive (`Payment recieved`, `Payment received`, `SUCCESS`, `PAID`) from negative (`not recieved`, `not received`, `FAILED`, `DECLINED`), timeout, network failure, malformed payload, and unknown responses.
     - HTTP 200 alone does not establish payment success.
     - Supports the blueprint's existing response spellings (`Payment recieved` and `not recieved`).
  4. On valid positive confirmation: Transitions payment to `PAID` and order to `CONFIRMED` atomically.
  5. On negative or indeterminate response: Remains `PENDING` (never marks paid or offers to runners); presents the approved customer contact-support message.
  6. Idempotent: Repeated checks or webhook notifications for already-paid orders return success without re-executing state transitions.

### 1.2 Pricing and Decimal Allocation
- Suffix range: ₹0.01–₹0.99.
- Priority: Smallest available paise suffix reserved atomically.
- Monetary calculations: Strictly precise to integer paise (no floating-point rounding errors).
- Suffix release timings:
  - Successful payment: Released / protected permanently (`is_paid = TRUE`) + 2 minutes.
  - Unconfirmed / expired attempt: Released after 5 minutes cooldown from QR allocation.
- Concurrent checkouts and retries handled safely with row locks and cooldown timers.

### 1.3 Runner Assignment
- A successfully paid order (`status = 'CONFIRMED'`) becomes immediately available as an offer to online approved runners in `RunnerDashboardPage`.
- Acceptance is atomic and exclusive (`runner.order.accept` / `POST /api/v1/runner/orders/:id/accept`).
- If two runners attempt to accept the same order simultaneously, only the first transaction succeeds; the second receives HTTP 409 `ORDER_ALREADY_ASSIGNED`.
- Once accepted, order transitions to `PREPARING` and is assigned exclusively to the winning runner.

### 1.4 Delivery Handover OTP
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

---

## 2. Milestone Execution Breakdown

### M0 — Baseline Audit (Complete)
- Inspect actual code, database schema, RLS policies, existing tests, and order/payment lifecycle.
- Confirm gaps and establish this authoritative plan document on the active branch.

### M1 — Payment Confirmation
- Connect customer payment check to Make.com verification webhook.
- Implement 5-second delay, exact amount query, and strict response parsing (`Payment recieved` vs `not recieved`).
- Update database and API layer to accept Make.com verification source upon positive response without requiring unconfigured Paytm gateway credentials.
- Add comprehensive unit and integration tests.

### M2 — Decimal Allocation & Timing
- Validate paise-level exact calculation and comparison across checkout, QR creation, and verification.
- Enforce suffix release timing (successful confirmation + 2 minutes; unconfirmed + 5 minutes cooldown).
- Ensure concurrency safety under simultaneous checkout attempts.

### M3 — Runner Assignment
- Expose available `CONFIRMED` orders to approved online runners in `handleRunnerAssignedOrders`.
- Implement atomic and exclusive runner acceptance endpoint (`handleRunnerAcceptOrder` / `runner.order.accept`).
- Prevent race conditions and duplicate assignments.

### M4 — In-App OTP Generation & Customer Display
- Verify server-authoritative 6-digit OTP generation upon transition to `ON_THE_WAY`.
- Display 6-digit OTP in customer application (`CustomerDeliveryOtpCard`), eliminating SMS dependencies.
- Ensure strict customer-only authorization and zero OTP leakage in runner broadcasts.

### M5 — Delivery Completion Handover
- Connect runner OTP submission to server verification.
- Enforce 3-attempt limit, 5-minute lockout, and atomic state transition to `DELIVERED`.
- Synchronize customer and runner dashboard states.

### M6 — End-to-End Verification
- Run complete test suites covering full order journey, failure paths, concurrency races, retries, and regressions.
- Verify migration compatibility with `scripts/validate-migrations.mjs`.

---

## 3. M0 Audit Verification Summary

| Component | Current Implementation State | Verified Gap | Required Plan Action |
|---|---|---|---|
| Payment Check | Checks `payment_records` for `AUTHORITATIVE_GATEWAY` | Does not call Make.com; fails closed because no gateway configured | Connect to Make.com query with 5s wait & parse `Payment recieved` |
| Make Ingestion | Rejects unverified webhook without PG credentials | Fails closed to Make.com email alerts | Accept valid Make.com confirmation as legitimate payment source |
| Platform Fee DB | `mark_platform_fee_paid` checks `AUTHORITATIVE_GATEWAY` | Throws `UNVERIFIED_PAYMENT_SHORTCUT_PROHIBITED` for Make.com source | Add forward migration allowing `MAKE_PAYMENT_CONFIRMATION` / `MAKE_WEBHOOK` |
| Runner Queue | `GET /api/v1/runner/orders` filters by `runner_id = req.user.id` | Does not return unassigned `CONFIRMED` orders to online runners | Return available `CONFIRMED` orders when runner is online |
| Runner Accept | Mock server has `runner.order.accept`; backend Express route missing | No backend endpoint for atomic runner claiming | Add `POST /api/v1/runner/orders/:id/accept` with row-lock concurrency |
| Customer OTP | `CustomerDeliveryOtpCard` has in-app display and demo modes | Needs verification of in-app display and refresh without SMS | Ensure `deliveryChannel = 'IN_APP'` and 6 digits display cleanly |
| Runner OTP | `verify_delivery_otp` DB RPC and backend route exist | Needs full integration with `runnerService.verifyOtp` and synchronized state | Verify end-to-end atomic handover |
