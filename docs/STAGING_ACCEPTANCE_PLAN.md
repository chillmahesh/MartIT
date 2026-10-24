# MartIT — Staging Acceptance Plan & Operational Checklist

**Status:** ACTIVE EXECUTION CHECKLIST  
**Current Branch:** `audit/deep-clean-issue-register`  
**Latest Baseline Milestone:** M8 (`7f2b82f` / `25e9f02`)  
**Target Staging Infrastructure:**
- **Frontend:** Vercel Staging Deployment
- **Backend:** Render Node.js Express Service
- **Database:** Supabase PostgreSQL (`uuuqaeptpripmvavihza`)
- **Telemetry:** Make.com Webhook Scenario + Gmail Business Notification Ingestion

---

## 1. Architectural Guardrails & Invariants

1. **Preserve Make.com + Gmail Architecture:** Payment verification relies on Make.com telemetry ingesting Paytm Business UPI alerts. No additional payment gateways (e.g. Razorpay, Cashfree) or SMS OTP providers (e.g. Twilio, MSG91) may be introduced.
2. **Fail-Closed Security:** HTTP 200 from external webhooks does not equate to payment confirmation. Inconclusive, timed-out, malformed, or unverified claims remain in `PROCESSING` / `PENDING` status.
3. **Secrets Non-Disclosure:** Never print, commit, or leak `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, or database passwords.
4. **Order State Semantics:** Adhere strictly to canonical lifecycle: `PENDING` -> `PAID` / `CONFIRMED` -> `PREPARING` -> `PICKED_UP` -> `ON_THE_WAY` -> `DELIVERED` (or `CANCELLED` / `EXPIRED`).
5. **Pricing & Fee Invariants:** Flat delivery fee (₹10 single-store, ₹15 multi-store), night surcharge, and dynamic platform fee allocation/release (₹0.05–₹0.20 with 2-minute cooldown) are immutable.
6. **Delivery Handover OTP:** Plaintext 6-digit OTP is disclosed strictly in-app to the authenticated customer; PostgreSQL holds the SHA-256 hash. Three invalid attempts lock verification for 5 minutes.

---

## 2. Sequenced Task Execution Checklist

| ID | Task | Dependencies | Risk Level | Status | Responsible Party | Acceptance Criteria |
|---|---|---|---|---|---|---|
| **ST-01** | Forward Migrations & History Audit | Local git commits | Low | **VERIFIED LOCALLY** (Execution Pending Staging) | Agent / Operator | Migration scripts validated with 0 errors; syntax and idempotency verified. |
| **ST-02** | Admin Runner Approval RPC & Authorization | ST-01 | Medium | **VERIFIED LOCALLY** | Agent | Stored procedure `admin_set_runner_status` updates `profiles` and `user_roles` atomically; non-admins rejected. |
| **ST-03** | Staging Account Provisioning Matrix | Live Supabase instance | Low | **BLOCKED — USER ACTION REQUIRED** | Operator | 3 distinct accounts created in Supabase Auth (Admin, Runner, Customer). |
| **ST-04** | Make.com Webhook Contract & Config Audit | Render dashboard | Medium | **BLOCKED — USER ACTION REQUIRED** | Operator | `MAKE_VERIFICATION_WEBHOOK_URL` set in Render without leaking values. Outbound logic sends amount as content; no webhook secret exists. |
| **ST-05** | Delivery OTP Resilience & Restart Recovery | Backend Express server | Medium | **VERIFIED LOCALLY** | Agent | Backend restart recovery tested: customer reissues OTP via RPC; runner verifies against Postgres hash. |
| **ST-06** | Pre-Staging Security & Data-Integrity Audit | ST-01..ST-05 | Medium | **VERIFIED LOCALLY** | Agent | All 13 tables protected by RLS; foreign key indexes present; concurrency lock active. |
| **ST-07** | Staging Environment Deployment Promotion | ST-01..ST-06 | High | **BLOCKED — USER ACTION REQUIRED** | Operator | Render and Vercel updated with audited branch commit. |
| **ST-08** | Staged Live Acceptance Execution | ST-07 | High | **BLOCKED — USER ACTION REQUIRED** | Operator | End-to-end order completed from checkout to delivery with live UPI payment and OTP verification. |

---

## 3. Deep Dive Verification & Analysis

### Task ST-01: Forward Migrations & History Audit

#### Unapplied Forward Migrations:
1. `supabase/migrations/20261024000001_fix_admin_runner_approval_privilege.sql`:
   - **Prerequisites:**
     - `public.profiles` table exists (created in `20261010000001`).
     - `public.user_roles` table exists with unique constraint on `(user_id, role)` (created in `20261010000001`).
     - `public.runner_status_enum` exists (`'applicant'`, `'approved'`, `'suspended'`) (created in `20261022000001`).
     - Supabase Auth extension functions (`auth.role()`, `auth.uid()`) available in PostgreSQL.
   - **Risks & Mitigations:**
     - *Risk:* If historical migration `20261022000001` was skipped on staging, casting `p_status::public.runner_status_enum` will fail.
     - *Mitigation:* Migration uses existing enum; verify enum exists via `SELECT typname FROM pg_type WHERE typname = 'runner_status_enum';` before applying.
     - *Risk:* Privilege escalation trigger replacement.
     - *Mitigation:* The trigger guard explicitly restricts non-admins to `NULL -> 'applicant'` self-updates only. Non-admins cannot set `'approved'` or `'suspended'`.
   - **Actions:**
     - Fixes `trg_prevent_profile_escalation` so `service_role`, `postgres`, and authenticated admins are recognized by `auth_is_admin()`.
     - Creates atomic stored procedure `public.admin_set_runner_status(UUID, VARCHAR)`.
     - Sets `search_path = public, pg_temp` and revokes execution from `PUBLIC` and `anon`.

2. `supabase/migrations/20261024000002_add_missing_foreign_key_indexes.sql`:
   - **Prerequisites:**
     - Referenced tables exist: `stores`, `orders`, `order_items`, `inventory_reservations`, `platform_fee_reservations`.
     - Foreign key columns exist.
   - **Risks & Mitigations:**
     - *Risk:* Lock contention on active high-volume tables.
     - *Mitigation:* Uses `CREATE INDEX IF NOT EXISTS`. Tables are small/staging-scale; index creation is instantaneous and non-destructive.
   - **Actions:**
     - Adds 8 missing foreign key indexes (`idx_stores_owner`, `idx_orders_delivery_location`, `idx_orders_fee_paise`, `idx_order_items_store`, `idx_order_items_product`, `idx_inventory_reservations_store`, `idx_inventory_reservations_product`, `idx_platform_fee_reservations_order`).

#### Audit Branch Migration History:
- `20261022120000_restrict_rls_auto_enable_execute.sql` (Restricts `rls_auto_enable` execution).
- `20261022150000_require_authoritative_payment_verification.sql` (Requires authoritative verification source for payment transitions).
- `20261022160000_restrict_payment_transition_rpc.sql` (Restricts payment RPC to service role).
- `20261024000001_fix_admin_runner_approval_privilege.sql` (Atomic runner approval RPC & escalation guard fix).
- `20261024000002_add_missing_foreign_key_indexes.sql` (Foreign key indexes).

*Note:* All 13 migrations pass `node scripts/validate-migrations.mjs` cleanly. Migrations must be applied by the operator in the Supabase SQL Editor.

---

### Task ST-02: Admin Runner Approval RPC & Authorization Chain

- **Frontend Action:** Admin navigates to `/admin` -> "People & Roles" -> "Runner Applicants". Clicks "Approve". Calls `adminService.setRunnerStatus(userId, 'approved')`.
- **API Request:** `POST /admin/runners/setStatus` with `{ userId, status: 'approved' }` and `Authorization: Bearer <token>`.
- **Route Guard:** `requirePermission(PERMISSIONS.RUNNERS_APPROVE)` enforces `req.user.roles.includes('admin') || req.user.roles.includes('super_admin')`.
- **Database Execution:** Express backend calls `supabase.rpc('admin_set_runner_status', { p_user_id, p_status })`.
  - Stored procedure executes atomically:
    1. Asserts caller is admin or service_role.
    2. Updates `profiles.runner_status = 'approved'`.
    3. Inserts `user_roles (user_id, role) VALUES (p_user_id, 'runner') ON CONFLICT DO NOTHING`.
- **Fallback Guard:** If RPC is unavailable, backend falls back to direct table update, which succeeds once migration `20261024000001` is applied.
- **Automated Proof:** 35 tests passing in `server/src/__tests__/authAndPermissions.test.js`.

---

### Task ST-03: Staging Accounts Provisioning Matrix

Mock users (`src/mocks/users.js`) exist only for local Vitest/mock execution. Live staging requires actual Supabase GoTrue accounts:

| Role | Staging Email Template | Creation Method | Post-Creation Configuration |
|---|---|---|---|
| **Administrator** | `admin-staging@campus.edu` | Supabase Dashboard or `/signup` | Insert `'admin'` role into `public.user_roles`: `INSERT INTO public.user_roles (user_id, role) VALUES ('<admin-uuid>', 'admin');` |
| **Runner Applicant** | `runner-staging@campus.edu` | Customer `/signup` | User logs in, navigates to `/profile`, and clicks "Apply to become a runner" (calls `apply_for_runner()` RPC). `profiles.runner_status` becomes `'applicant'`. |
| **Customer** | `customer-staging@campus.edu` | Customer `/signup` | Default role `'customer'` is assigned automatically by database trigger upon signup. |

---

### Task ST-04: Make.com Webhook Contract & Server Configuration

#### Complete Server Environment Variable Requirements (Render):
The production schema in `server/src/config/env.js` enforces the following environment variables:
- `PORT`: (Number) Bound by Render; defaults to `10000`.
- `NODE_ENV`: (Literal) Must be `production`.
- `SUPABASE_URL`: (HTTPS URL) Supabase project URL (`https://uuuqaeptpripmvavihza.supabase.co`). Must not be a placeholder.
- `SUPABASE_ANON_KEY`: (String, min 20 chars) Public anon key. Must not be a placeholder.
- `SUPABASE_SERVICE_ROLE_KEY`: (String, min 20 chars) Backend service role key. Must differ from `SUPABASE_ANON_KEY`.
- `FRONTEND_ORIGINS`: (Comma-separated HTTPS URLs) Allowed CORS origins (e.g. `https://martit.vercel.app` or staging URL). No wildcards or localhost allowed in production.
- `MAKE_VERIFICATION_WEBHOOK_URL`: (HTTPS URL) Make.com scenario webhook endpoint for outgoing payment verification queries. MartIT sends `{ content: amount, amount, orderId }` and receives response (no webhook secret exists).
- `FEATURE_MULTI_STORE_CHECKOUT`: (Boolean) Default `false`.
- `ROUTING_MODE`: (String) Default `'walking'`.

#### Webhook Ingestion Contract (`POST /api/v1/webhooks/make-payment`):
- **Header:** `x-make-secret: <secret>` (or `x-webhook-secret`, or `Authorization: Bearer <secret>`). Evaluated via constant-time SHA-256 HMAC digest comparison (`crypto.timingSafeEqual`).
- **Payload:** `{ orderId, amount, utr, status, evidence }`.
- **Amount Verification:** Matches `order.total_payable` exactly (converted to paise). Mismatches fail with HTTP 400.
- **Fail-Closed Contract:** In the absence of an authoritative banking gateway client, Make.com webhook calls record `payment_records` as `status = 'PROCESSING'` and `evidence = null`.

#### Payment Verification Polling (`POST /api/v1/orders/:id/check-payment`):
- **Concurrency Lock:** `inFlightPaymentChecks` Set rejects concurrent requests for the same order with HTTP 409 `VERIFICATION_IN_FLIGHT`.
- **Timing Wait:** Backend observes the required 5-second Gmail push notification indexing wait before issuing the HTTP POST to `MAKE_VERIFICATION_WEBHOOK_URL`.
- **Response Parsing:**
  - Positive ("Payment recieved" / "Payment received" / `status: 'SUCCESS'`): Updates `payment_records` to `PAID`, `verification_source: 'AUTHORITATIVE_GATEWAY'`, and runs `executeAtomicPaymentVerification()`.
  - Negative ("not recieved" / "not received" / "fail" / "declined"): Inconclusive, remains `PENDING`.
  - Timeout (10s abort) / Error: Inconclusive, remains `PENDING`.
  - Expired (after 2-minute payment window): Invokes `executeAtomicPaymentExpiry()`, cancels order, and releases inventory.

---

### Task ST-05: Delivery OTP Durability & Server Restart Recovery

- **Architecture:**
  - Plaintext OTP stored in ephemeral memory (`activeOtpStore`) during transit.
  - SHA-256 hash stored in PostgreSQL `orders.handover_otp_hash`.
- **Server Restart Resilience:**
  - If backend restarts, `activeOtpStore` RAM is cleared.
  - Customer calling `GET /api/v1/orders/:id/delivery-otp` receives `otp: null` with `message: 'Active delivery challenge is in progress. Click refresh if you need a new code.'`.
  - Customer clicking "Refresh" calls `POST /api/v1/orders/:id/refresh-otp`.
  - Backend generates new 6-digit OTP, updates PostgreSQL via `reissue_delivery_otp(p_order_id, p_new_otp_hash, p_customer_id, 300)`, repopulates `activeOtpStore`, and returns new OTP.
  - If customer already noted the original code prior to restart, runner enters it; backend hashes it and verifies directly against PostgreSQL `orders.handover_otp_hash`. Verification succeeds regardless of RAM state.
- **Automated Proof:** 34 tests passing in `server/src/__tests__/ordersOtp.test.js` (including Section 12 restart recovery).

---

### Task ST-06: Pre-Staging Security & Data-Integrity Audit

1. **Row Level Security (RLS):** All 13 public tables have RLS enabled. Helper routines (`auth_is_admin`, `auth_is_approved_runner`, `auth_owns_store`) use `SECURITY DEFINER` with fixed `search_path = public, pg_temp`.
2. **Foreign Key Performance:** Migration `20261024000002` prevents lock contention and full-table scans during cascade deletes and order creation.
3. **Double Verification Prevention:** In-flight lock Set + frontend button disabling prevents racing webhook calls and concurrent checkout submissions.
4. **Information Disclosure Prevention:** Plaintext OTP and OTP hash are strictly stripped from all general order detail and list endpoints (`handleGetOrder`, `handleListOrders`, `handleRunnerListOrders`).

---

### 3.1 Mocked Checks vs. Genuine Live Evidence Ledger

| Dimension / Flow | Verification Type | Status | Evidence Source | Notes / Caveats |
|---|---|---|---|---|
| **Runner Status Privilege Escalation** | Automated Unit / Contract Test | VERIFIED | `authAndPermissions.test.js` (35 tests) | Simulated via mock Supabase client; verifies RPC logic and SQL contract. Live Postgres execution pending migration. |
| **Admin Runner Approval RPC** | Automated Unit / Static Check | VERIFIED | `admin.js`, migration `20261024000001` | Migration syntax validated with 0 errors; endpoint contract aligned with frontend `adminService`. |
| **Customer 6-Stage Tracking Stepper** | Automated UI Component Test | VERIFIED | `orderTrackingUI.test.jsx` (7 tests) | Proves contradiction elimination and dynamic state progression across all 6 stages. |
| **Runner Availability & Exclusive Claim** | Automated Endpoint Test | VERIFIED | `orders.test.js`, `runnerDashboard.test.jsx` | Atomic claim `WHERE runner_id IS NULL AND status = 'CONFIRMED'` tested with simulated concurrency. |
| **Runner Multi-Store Pickup** | Automated Integration Test | VERIFIED | `orders.test.js` (`handleRunnerPickupStore`) | Asserts fulfillment group state tracking and auto-transition to `PICKED_UP`. |
| **In-Flight Payment Concurrency Lock** | Automated Concurrency Test | VERIFIED | `orders.test.js` (in-flight Set tests) | Rapid concurrent calls return HTTP 409 `VERIFICATION_IN_FLIGHT`. |
| **Make.com Webhook Ingestion Contract** | Automated Contract Test | VERIFIED | `webhooks.test.js` (45 tests) | Timing-safe HMAC check and fail-closed behavior verified under mock conditions. |
| **Delivery OTP Handover & Verification** | Automated End-to-End Test | VERIFIED | `ordersOtp.test.js` (34 tests) | SHA-256 hash matching, rate limits, lockouts, and server restart recovery verified. |
| **Database Migrations on Staging DB** | External Manual SQL | UNVERIFIED | Not yet applied to `uuuqaeptpripmvavihza` | Requires operator execution in Supabase Dashboard SQL Editor. |
| **Hosted Backend Deployment on Render** | Remote Service Probe | PARTIALLY VERIFIED | Render live at `0ac83ac` (bound port 10000) | Audit branch commits not yet promoted to Render. |
| **Live External Make.com Telemetry** | External Integration | UNVERIFIED | Pending live query test | Requires `MAKE_VERIFICATION_WEBHOOK_URL` configuration on Render and active Gmail trigger. |
| **Real Staging Customer/Runner Accounts** | GoTrue Auth API | UNVERIFIED | Sample accounts in `users.js` are mock-only | Real accounts must be provisioned in Supabase GoTrue Auth for staging. |
| **Live UPI Bank Settlement** | External Banking Network | UNVERIFIED | None | Requires live payment of ₹10–₹15 by operator during staged acceptance test. |

---

## 4. Step-by-Step Live Acceptance Checklist

| Stage | Step | Description | Expected Outcome | Tool / Interface |
|---|---|---|---|---|
| **1. Database Setup** | 1.1 | Open Supabase SQL Editor for project `uuuqaeptpripmvavihza`. | SQL Editor ready. | Supabase Dashboard |
| | 1.2 | Execute `supabase/migrations/20261024000001_fix_admin_runner_approval_privilege.sql`. | `Query returned successfully`. RPC `admin_set_runner_status` created. | Supabase SQL Editor |
| | 1.3 | Execute `supabase/migrations/20261024000002_add_missing_foreign_key_indexes.sql`. | `Query returned successfully`. 8 indexes created. | Supabase SQL Editor |
| | 1.4 | Execute `supabase/tests/database_integrity_test.sql`. | 13 test assertions pass with 0 errors. | Supabase SQL Editor |
| **2. Auth Setup** | 2.1 | Sign up admin account (`admin-staging@campus.edu`). In SQL Editor, run: `INSERT INTO public.user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'admin-staging@campus.edu' ON CONFLICT DO NOTHING;` | Admin role granted. | Supabase Dashboard / SQL |
| | 2.2 | Sign up runner applicant (`runner-staging@campus.edu`). | Account created in `auth.users` with customer role. | `/signup` UI |
| | 2.3 | Runner applicant logs in, opens `/profile`, and submits runner application. | Toast: "Application submitted". `profiles.runner_status = 'applicant'`. | `/profile` UI |
| | 2.4 | Sign up customer account (`customer-staging@campus.edu`). | Account created with customer role. | `/signup` UI |
| **3. Admin Approval** | 3.1 | Admin logs in at `/login` or `/admin/login`. | Redirects to `/admin`. Route guard permits access. | Web Browser |
| | 3.2 | Navigate to "People & Roles" tab. | Pending applicant `runner-staging@campus.edu` visible. | Web Browser |
| | 3.3 | Click "Approve runner". | Toast: "Runner approved successfully." Applicant removed from pending queue; Active Runners count increments. | Web Browser |
| | 3.4 | Inspect database: `SELECT runner_status FROM public.profiles WHERE email = 'runner-staging@campus.edu';` | Returns `'approved'`. `user_roles` contains `'runner'`. | Supabase SQL Editor |
| **4. Runner Activation** | 4.1 | Log in as runner (`runner-staging@campus.edu`) at `/login`. | Redirects to `/runner`. Route guard permits access. | Web Browser |
| | 4.2 | Toggle availability switch to "Online". | Switch turns green ("Online"). Offline alert vanishes. | Web Browser |
| | 4.3 | Observe "Available Requests" queue. | Ready to receive orders. | Web Browser |
| **5. Customer Checkout** | 5.1 | Log in as customer (`customer-staging@campus.edu`). | Navigates to `/app`. | Web Browser |
| | 5.2 | Add items from Campus Mart to cart and proceed to checkout. | Total calculated with items, flat delivery fee, and dynamic platform fee. | Web Browser |
| | 5.3 | Navigate to `/app/payment`. | Dynamic UPI QR rendered with order ID and 2-minute timer. | Web Browser |
| **6. Payment & Verification** | 6.1 | Scan QR using UPI app and pay exact total, or trigger Make.com scenario test run. | Payment lands in Paytm Business; Gmail notification received. | UPI App / Make.com |
| | 6.2 | Click "Confirm Payment" button on `/app/payment`. | Button immediately disables with spinner ("Checking payment..."). Server waits 5 seconds and queries Make.com. | Web Browser |
| | 6.3 | Make.com returns positive verification ("Payment recieved"). | Backend marks `PAID` with source `AUTHORITATIVE_GATEWAY`, transitions order to `CONFIRMED`. | Web Browser / Server |
| | 6.4 | Rapid click concurrency test: Click "Confirm Payment" multiple times rapidly. | Subsequent clicks rejected or ignored without double charging or race conditions. | Web Browser DevTools |
| | 6.5 | Order tracking page updates: 6-stage tracker advances to Stage 1 "Payment Confirmed" then Stage 2 "Waiting for Runner". Zero contradictory badges. | Clean tracking stepper displayed. | `/app/order-confirmation` |
| **7. Runner Acceptance** | 7.1 | Switch to runner browser window (`/runner`). | New order appears in "Available Requests" card with store and destination. | Web Browser |
| | 7.2 | Runner clicks "Accept delivery request". | Order claimed atomically (`runner_id` assigned, status `PREPARING`). Moves to "Active Deliveries". | Web Browser |
| | 7.3 | Concurrency test: If second runner attempts to accept, received HTTP 409 `ORDER_ALREADY_ASSIGNED`. | Order disappears from second runner's queue. | Second Runner Client |
| **8. Store Pickup** | 8.1 | Runner proceeds to store and confirms item collection. | Runner clicks "Confirm Store Pickup". | Web Browser |
| | 8.2 | Store fulfillment group status advances to `PICKED_UP`. | Order status transitions to `PICKED_UP`. | Web Browser |
| **9. Out for Delivery & OTP** | 9.1 | Runner clicks "Depart Store / Out for Delivery". | Order transitions to `ON_THE_WAY`. Atomic RPC initializes OTP challenge; RAM stores 6 digits. | Web Browser |
| | 9.2 | Customer checks `/app/order-confirmation`. | Tracker advances to Stage 5 "Out for Delivery". `CustomerDeliveryOtpCard` renders 6-digit OTP and countdown timer. | Web Browser |
| | 9.3 | OTP refresh test: Customer clicks "Refresh Code". | New 6-digit OTP generated; database hash updated; customer sees new code. | Web Browser |
| | 9.4 | Backend restart simulation (optional): Restart server process. Customer clicks "Refresh Code". | Customer receives new code seamlessly; runner verification remains unblocked. | Server / Web Browser |
| **10. Delivery Completion** | 10.1 | Runner arrives at delivery destination. Customer shares 6-digit OTP. | Runner inputs 6-digit code on `/runner`. | Web Browser |
| | 10.2 | Runner clicks "Verify & Complete Delivery". | Backend executes `verify_delivery_otp()` RPC. Order transitions to `DELIVERED`. | Web Browser |
| | 10.3 | Customer tracking screen updates automatically. | Polling detects `DELIVERED`; tracker reaches Stage 6 "Delivered" and stops polling. | Web Browser |

---

## 5. Operator Personal Action Checklist (Must be performed by Omkar)

Because of environment permissions and credential boundaries, the following actions must be performed manually:

- [ ] **Action 1: Apply Forward Migrations in Supabase Dashboard**
  - Open Supabase Project `uuuqaeptpripmvavihza` -> SQL Editor.
  - Paste and run `supabase/migrations/20261024000001_fix_admin_runner_approval_privilege.sql`.
  - Paste and run `supabase/migrations/20261024000002_add_missing_foreign_key_indexes.sql`.
- [ ] **Action 2: Enable Leaked Passwords Protection**
  - In Supabase Dashboard, navigate to **Authentication** -> **Attack Protection**.
  - Enable **Leaked Passwords Protection**.
- [ ] **Action 3: Configure Render Environment Variables**
  - In Render Dashboard, ensure backend service environment variables include:
    - `MAKE_VERIFICATION_WEBHOOK_URL` (Make.com scenario URL)
- [ ] **Action 4: Configure Vercel Frontend Variable**
  - In Vercel Project Settings -> Environment Variables, ensure `VITE_UPI_PAYEE_VPA` matches the live merchant VPA.
- [ ] **Action 5: Provision Staging Accounts**
  - Create admin account, runner applicant account, and customer account using the steps in Task ST-03.
- [ ] **Action 6: Run Staged Live Acceptance Test**
  - Walk through the 10-stage checklist above with one live UPI transaction (₹10–₹15 test purchase).

---

## 6. Risk Register & Mitigations

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| **Make.com Email Ingestion Latency** | High | Medium | Customer payment check preserves required 5-second Gmail wait; button is disabled with spinner; 2-minute countdown timer allows manual refresh or retry. |
| **Unapplied Forward Migrations** | High | Low | Forward migrations are validated locally and idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`). Clear step-by-step SQL scripts provided. |
| **Concurrent Runner Acceptance Race** | Medium | Low | PostgreSQL atomic `UPDATE orders SET runner_id = ... WHERE runner_id IS NULL AND status = 'CONFIRMED'` guarantees single runner exclusivity. |
| **Backend Process Restart in Transit** | Low | Low | PostgreSQL stores persistent SHA-256 hash; customer can refresh challenge at any time; runner verification checks database directly. |
| **Admin Runner Approval Privilege Escalation Trigger** | High | Low | Addressed in `20261024000001`; `service_role` and `auth_is_admin()` are recognized by the escalation trigger guard. |
