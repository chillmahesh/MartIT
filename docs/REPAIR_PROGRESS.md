# MartIT Repair Progress

This is the durable execution ledger. Update it throughout implementation. Never claim verification without evidence.

## Status definitions
- `NOT_STARTED`: no implementation work completed.
- `IN_PROGRESS`: investigation or implementation underway.
- `BLOCKED`: dependency/safety issue prevents completion; record evidence and next action.
- `VERIFIED`: acceptance criteria passed, required tests run, diff reviewed, evidence recorded. Live-only checks must be separately identified if not run.

## Baseline to re-verify
- Branch at planning time: `audit/deep-clean-issue-register`.
- Baseline HEAD SHA: `1fd09c553f5bb0f306a0a654c2a771540720c43e`.
- Automated test suite: `npm test` -> 30 test files passed, 613 passed, 1 skipped (614 total), exit code 0.
- Migration static validation: `node scripts/validate-migrations.mjs` -> 11 migrations valid, exit code 0.
- Production build: `npm run build` -> client + SSR built cleanly, exit code 0.
- Live Make.com + Gmail + Supabase end-to-end flow is not established by mocked tests.
- OTP storage is currently held in Node.js process memory (`activeOtpStore`) with SHA-256 hash in Postgres; documented as single-instance safe, requires database ciphertext / Redis for horizontal scaling.

## Milestone ledger

| ID | Milestone | Status | Evidence / commit | Remaining work |
|---|---|---|---|---|
| M0 | Baseline, routes, and root-cause evidence | VERIFIED | Commit 8b13b9f; baseline tests (613 passed), root causes established | Complete |
| M1 | Secure runner approval fix | VERIFIED | Commit e38c0a3; Migration 20261024000001, admin.js RPC support, 35 auth tests passed | Complete; proceed to M2 |
| M2 | Customer order-tracking UI | VERIFIED | Commit 32cb379; dynamic state mapping, 6-stage lifecycle tracker, zero contradiction, 78 customer tests passed | Complete; proceed to M3 |
| M3 | Runner dashboard and availability | VERIFIED | Commit dcb845d; route /runner verified, online guard, atomic acceptance, pickup-store endpoint & 55 runner tests + 84 orders tests | Complete; proceed to M4 |
| M4 | Demo runner procedure | VERIFIED | Commit bd9efa7; Safe UI approval steps documented, persisted status verified, access gate confirmed | Complete; proceed to M5 |
| M5 | Payment latency and duplicate prevention | VERIFIED | Commit 20bb63c; inFlightPaymentChecks concurrency lock, disabled click state, HTTP 409 guard, 86 order tests passed | Complete; proceed to M6 |
| M6 | Supabase findings review | VERIFIED | Commit 4f3a4ed; Migration 20261024000002, advisor review audit trail, 628 passed tests | Complete; proceed to M7 |
| M7 | Regression suite and final audit | VERIFIED | Commit d2f92eb; 13 migrations valid, 31 test files (628 passed, 1 skipped), clean build, diff verified | Complete; proceed to M8 |
| M8 | Staging readiness & live acceptance checklist | VERIFIED | Commit 7f2b82f; adaptive environment notices, mock-vs-live auth boundaries, staged live acceptance checklist, 628 passed tests, build verified | Staging deployment & live payment testing by operator |
| M9 | Staging Acceptance Plan & Operational Verification | VERIFIED | Commit f4d0da7; docs/STAGING_ACCEPTANCE_PLAN.md created, OTP restart resilience verified, 630 passed tests, clean build | Operator execution of live staging acceptance checklist & deployment |
| M10 | Final Product Plan execution & verification | VERIFIED | Commit cb2b871; docs/FINAL_PRODUCT_PLAN.md executed, README.md updated, 630 tests passed, build verified | Operator live staging acceptance on external infrastructure |
| M11 | Form validation, input constraints & responsive UX fix | VERIFIED | Commits c57477e, ab9e24c, 09e1eb4; Complete client/server input validation, 10-digit Indian phone constraints, RFC email normalization, Unicode names, checkout/admin/runner bounds, 41 test files (730 passed, 1 skipped) | Complete |
| M12.1 | Multi-store pricing & surcharge configuration | VERIFIED | Commit eaa729b; MULTI_STORE_SURCHARGE, calculateAdditionalStoreSurcharge, calculateDeliveryFee breakdown, 42 deliveryFee tests passed | Complete; proceed to M12.2 |
| M12.2 | Multi-store cart store & customer warning UI | VERIFIED | Commit f9a1a66; Cart lines storeId tracking, multi-store transition detection, first-add warning modal, CartPage store grouping, persistent indicator & 117 customer/product tests passed | Complete; proceed to M12.3 |
| M12.3 | Multi-store server & mock order creation | VERIFIED | Commit 1172324; Migration 20261116000001_multi_store_atomic_orders.sql, multi-store handleCreateOrder, fulfillment groups, 89 orders tests & 42 test suites (748 passed) | Complete; proceed to M12.4 |
| M12.4 | Combined payment & multi-store runner tracking | VERIFIED | Commit ab76194; Single UPI payment view with multi-store fee breakdown, OrderConfirmation multi-store pickup checklist, multi-store runner pickup completion, 42 test files (750 passed) & clean build | Complete |
| M12.5 | Cart selector stability & React Error #185 fix | VERIFIED | Commit ed8b799; Fixed unstable Zustand selectors with useShallow and memoized store selectors, eliminated infinite re-render loop on /app/cart, 44 test files (770 passed, 1 skipped) | Complete |
| M12.6 | Authoritative ₹10 multi-store surcharge & pricing consistency | VERIFIED | Commit 7f5c3d9; Authoritative ₹10 surcharge default, fees.js, env.js, server orders.js, OrdersPage, AdminConsole, 48 deliveryFee + 95 orders tests, 44 test files (782 passed, 1 skipped) | Complete |
| M13 | Animated Sun-to-Moon theme transition | VERIFIED | Commit 04df19a; Clockwise 360° eclipse sweep starting at 3 o'clock, 8 prominent spokes (12:00, 1:30, 3:00, 4:30, 6:00, 7:30, 9:00, 10:30) with userSpaceOnUse filter fix, 0.75x speed refinement, 45 test files (809 passed) | Complete |

## Milestone Evidence & Audit Trails

### M0 — Baseline & Root Cause Evidence
- **Date / Session:** 2026-10-24
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `1fd09c553f5bb0f306a0a654c2a771540720c43e`
- **Baseline Commit:** `8b13b9f` (`docs(repair): establish verified baseline and root-cause evidence (Milestone 0)`)
- **Baseline Test Evidence:**
  - `npm test`: 30 files passed, 613 passed, 1 skipped, exit code 0.
  - `node scripts/validate-migrations.mjs`: 11 migration files validated, exit code 0.
  - `npm run build`: successful production bundle, exit code 0.
- **Root Cause Analysis (Goal A - Admin Runner Approval Failure):**
  - **Failing Path:** `AdminConsolePage.jsx` -> `adminService.setRunnerStatus` -> `POST /admin/runners/setStatus` -> `server/src/routes/admin.js:handleSetRunnerStatus`.
  - **PostgreSQL Exception:** The profile update `supabase.from('profiles').update({ runner_status: status }).eq('id', userId)` triggers `trg_prevent_profile_escalation` -> `prevent_profile_privilege_escalation()`.
  - **Defect:** `prevent_profile_privilege_escalation()` enforces `IF NOT public.auth_is_admin() THEN ... RAISE EXCEPTION 'PERMISSION_DENIED_RUNNER_STATUS_MODIFICATION'`. Function `public.auth_is_admin()` checks `WHERE user_id = auth.uid()`. When backend Express calls Supabase with `service_role` key, `auth.uid()` is `NULL`. `auth_is_admin()` evaluates to `FALSE`, raising exception on the service role update. `admin.js:90` catches `updateErr` and throws `Failed to update runner status.`
- **Root Cause Analysis (Goal B - Contradictory Customer Tracking):**
  - **Failing Path:** `src/components/cart/OrderConfirmationView.jsx` lines 88–95 hardcode `<Badge tone="warning">Awaiting Payment</Badge>` and `<Badge tone="info">Payment: Pending</Badge>` directly in the header above the payment status banner. When an order transitions to `paymentStatus === 'PAID'`, lines 120–124 render `Payment Verified & Confirmed:`, displaying contradictory badges simultaneously.
  - **Defect:** Header badges do not derive dynamically from `order.paymentStatus` / `order.status`, and a post-payment tracking stepper is missing.
- **Root Cause Analysis (Goal C - Runner Dashboard):**
  - **Route Location:** `/runner`, mounted in `src/app/routes.jsx` with `<RequireRole role="runner" />`.
  - **Access Gate:** `RouteGuards.jsx` checks `hasPermission(user, PERMISSIONS.RUNNER_DELIVER)`. In `utils/permissions.js`, `RUNNER_DELIVER` requires both role `'runner'` and `user.runnerStatus === 'approved'`. Because Goal A failed to update runner status to `approved`, applicants were rejected by the route guard with `ForbiddenPage`.

### M1 — Secure Runner Approval Fix
- **Date / Session:** 2026-10-24
- **Commit:** `e38c0a3` (`feat(admin): fix runner status update privilege escalation and add atomic RPC (Milestone 1)`)
- **Files Modified:**
  - `supabase/migrations/20261024000001_fix_admin_runner_approval_privilege.sql`: Created forward migration updating `public.auth_is_admin()`, `public.auth_is_super_admin()`, and `public.prevent_profile_privilege_escalation()` to recognize `service_role` and `postgres`, while preserving strict client protection against unauthorized self-elevation. Created atomic stored procedure `public.admin_set_runner_status(UUID, VARCHAR)`.
  - `server/src/routes/admin.js`: Hardened `handleSetRunnerStatus` to use `admin_set_runner_status` RPC with clean error diagnostics and resilient direct table fallback.
  - `server/src/__tests__/testHelpers.js`: Added `admin_set_runner_status` simulation to mock Supabase client.
  - `server/src/__tests__/authAndPermissions.test.js`: Added regression tests for repeated approval idempotency, 404 for missing applicant, and 422 for invalid status.
- **Verification Commands & Evidence:**
  - `node scripts/validate-migrations.mjs`: 12 migration files validated cleanly, exit code 0.
  - `npm test -- server/src/__tests__/authAndPermissions.test.js`: 35 tests passed (35/35), exit code 0.
  - Full suite `npm test`: 30 files passed, 616 passed, 1 skipped (617 total), exit code 0.
- **Security & Authorization Review:**
  - Confirmed non-admins remain strictly forbidden from altering `runner_status` to `'approved'` or `'suspended'`.
  - Confirmed only callers with `PERMISSIONS.RUNNERS_APPROVE` (verified via admin JWT) can execute `POST /admin/runners/setStatus`.
  - Confirmed zero service-role keys or credentials exposed.

### M2 — Customer Order-Tracking UI
- **Date / Session:** 2026-10-24
- **Commit:** `32cb379` (`feat(customer): eliminate contradictory tracking badges and implement 6-stage lifecycle progress tracker (Milestone 2)`)
- **Files Modified:**
  - `src/components/cart/OrderConfirmationView.jsx`:
    - Eliminated hardcoded contradictory "Awaiting Payment" / "Payment: Pending" badges when payment is confirmed.
    - Derived header title, subtitle, and badges dynamically from authoritative order state (`order.paymentStatus` and `order.status`).
    - Implemented 6-stage lifecycle progress tracker (`Payment Confirmed` -> `Waiting for Runner` -> `Runner Assigned` -> `Preparing / Pickup` -> `Out for Delivery` -> `Delivered`).
    - Safely rendered assigned campus runner card when runner is assigned.
    - Preserved in-app delivery OTP challenge embedding (`CustomerDeliveryOtpCard`) when `order.status === 'ON_THE_WAY'`.
    - Added explicit, non-blaming customer support banners for `CANCELLED` and `EXPIRED` orders.
  - `src/pages/customer/OrderConfirmationPage.jsx`:
    - Added safe live polling every 4 seconds for active non-terminal orders, stopping cleanly upon unmount or when reaching terminal states (`DELIVERED`, `CANCELLED`, `EXPIRED`).
  - `server/src/routes/orders.js`:
    - Included `runnerId: order.runner_id || order.runnerId || null` in `formatCanonicalOrder` so the client can reliably detect runner assignment.
  - `src/pages/customer/__tests__/orderTrackingUI.test.jsx`:
    - Added comprehensive unit test suite covering contradiction elimination, pending state, preparing/pickup runner card, out-for-delivery OTP card, delivered completion, and cancelled/expired banners.
- **Verification Commands & Evidence:**
  - `npm test -- src/pages/customer/`: 5 test files passed, 78 tests passed, exit code 0.
  - Full suite `npm test`: 31 files passed, 623 passed, 1 skipped (624 total), exit code 0.
  - `node scripts/validate-migrations.mjs`: 12 migration files validated, exit code 0.
  - `npm run build`: Client bundle (695 kB main) and SSR bundle (93.5 kB entry) compiled cleanly, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M3 — Runner Dashboard and Availability
- **Date / Session:** 2026-10-24
- **Commit:** `dcb845d` (`feat(runner): implement store pickup endpoint and verify runner dashboard availability (Milestone 3)`)
- **Files Modified / Verified:**
  - `src/pages/runner/RunnerDashboardPage.jsx`: Verified `/runner` route implementation with online/offline availability switch, live activity counts, delivery request acceptance, multi-store pickup confirmation, and OTP-verified delivery completion.
  - `server/src/routes/orders.js`:
    - Implemented `handleRunnerPickupStore` (`POST /api/v1/runner/orders/:id/pickup-store` and `POST /runner/order/pickupStore`) to support store-by-store collection confirmation in PostgreSQL and auto-advance to `PICKED_UP` when all fulfillment groups are complete.
    - Verified strict role authorization (`ROLES.RUNNER` + `runnerStatus === 'approved'`), atomic exclusive acceptance (`runner_id IS NULL AND status = 'CONFIRMED'`), and OTP-guarded state transitions.
  - `server/src/__tests__/orders.test.js`: Added unit tests verifying runner pickup store confirmation, unassigned runner rejection, and invalid status rejection.
- **Verification Commands & Evidence:**
  - `npm test -- src/pages/runner/`: 3 test files passed, 55 tests passed (55/55), exit code 0.
  - `npm test -- server/src/__tests__/orders.test.js`: 84 tests passed (84/84), exit code 0.
  - Full suite `npm test`: 31 files passed, 626 passed, 1 skipped (627 total), exit code 0.
  - `node scripts/validate-migrations.mjs`: 12 migration files validated, exit code 0.
  - `npm run build`: Clean build passed without errors, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M4 — Safe Demo Runner Procedure (Goal D)
- **Date / Session:** 2026-10-24
- **Demo Runner Accounts Identified:**
  - **In-Browser / Mock Environment:**
    - Runner Account: `Meera (sample runner)` (`runner@martit.test`, id: `u_runner_1`, role: `runner`, status: `approved`).
    - Applicant Account: `Kabir (sample applicant)` (`applicant@martit.test`, id: `u_applicant_1`, role: `customer`, status: `pending`).
    - Admin Account: `Super Admin (sample)` (`superadmin@martit.test`, id: `u_super_1`, role: `super_admin`).
  - **Staging / PostgreSQL Environment:**
    - Any registered applicant (e.g. `applicant@campus.edu` / `usr_applicant`) or newly signed up student applicant.
- **Exact UI Steps for Admin Approval and Runner Activation:**
  1. **Admin Login:** Log in as an administrator or super admin at `/admin/login` (or `/login`).
  2. **Navigate to People & Roles:** Open `/admin` and select the **People & Roles** tab (`/admin/roles`).
  3. **Locate Applicant:** Under the **Runner Applicants** section, review pending applicants displaying name, email, and application date.
  4. **Execute Approval:** Click the **Approve** button on the applicant row. This calls `POST /admin/runners/setStatus` with `{ userId, status: 'approved' }`, which executes atomic RPC `admin_set_runner_status(UUID, 'approved')` in PostgreSQL.
  5. **Confirm State Transition:** Toast confirmation displays "Runner approved successfully." The applicant is removed from pending applications, and active runners count increments from 0 to 1.
  6. **Runner Authentication:** Log in as the approved runner at `/login`. The system automatically redirects to `/runner`. The `<RequireRole role="runner" />` route guard validates `PERMISSIONS.RUNNER_DELIVER` and admits the runner.
  7. **Go Online:** On `/runner`, toggle the **Runner Availability** switch to **Online**.
  8. **Receive Orders:** Available `CONFIRMED` orders now populate the "Available Requests" section for atomic acceptance.
- **Verification Evidence:**
  - Verified non-admins are strictly forbidden from approving applicants (covered by 35 tests in `authAndPermissions.test.js`).
  - Verified approved runners bypass `ForbiddenPage` and access `/runner` (covered by `runnerModeSwitching.test.jsx`).
  - Verified offline runners are prevented from accepting delivery requests until toggled online.

### M5 — Payment Latency & Duplicate Prevention (Goal E)
- **Date / Session:** 2026-10-24
- **Commit:** `20bb63c` (`feat(payment): lock in-flight checks and prevent duplicate verification races (Milestone 5)`)
- **Files Modified:**
  - `server/src/routes/orders.js`:
    - Implemented concurrency lock `export const inFlightPaymentChecks = new Set()`.
    - Protected `handleCheckPayment` with concurrency check returning HTTP 409 `{ orderId, status: 'in_flight', code: 'VERIFICATION_IN_FLIGHT' }` when an in-flight check is already running for the given order.
    - Guaranteed cleanup of in-flight lock via `finally` block even when errors occur or verification is inconclusive.
    - Preserved required 5-second Gmail push notification indexing wait before querying Make.com (`bypassDelay = req.headers['x-bypass-delay'] === 'true' || process.env.NODE_ENV === 'test'`).
    - Maintained fast-path returning immediately (status 200 `verified`) for orders already in `PAID` or `CONFIRMED` status.
  - `src/components/payment/CustomerPaymentView.jsx`:
    - Immediately locked "Confirm Payment" button (`disabled={isChecking}`, `loading={isChecking}`, spinner icon, text updated to "Checking payment...").
    - Prevented duplicate clicks in handler: `if (!order?.id || isChecking) return`.
    - Handled HTTP 409 / `res.status === 'in_flight'` and `VERIFICATION_IN_FLIGHT` cleanly with non-blaming user feedback ("Payment verification is currently in progress. Please wait a moment.").
  - `server/src/__tests__/orders.test.js`:
    - Added unit and concurrency tests verifying rapid concurrent check requests return 409 `VERIFICATION_IN_FLIGHT` while the first verification is running.
    - Verified that lock is released upon completion (verified or inconclusive) allowing subsequent retries to succeed.
- **Verification Commands & Evidence:**
    - `npm test -- server/src/__tests__/orders.test.js`: 86 tests passed (86/86), exit code 0.
    - `npm test -- src/pages/customer/`: 5 test files passed, 78 tests passed (78/78), exit code 0.
    - `node scripts/validate-migrations.mjs`: 12 migration files validated, exit code 0.
    - `npm run build`: cleanly passed without error, exit code 0.
    - `git diff --check`: 0 whitespace issues.

### M6 — Supabase Security & Database Review
- **Date / Session:** 2026-10-24
- **Commit:** `4f3a4ed` (`fix(security): harden supabase security definer grants and add missing foreign key indexes (Milestone 6)`)
- **Files Modified / Created:**
  - `supabase/migrations/20261024000002_add_missing_foreign_key_indexes.sql`:
    - Created forward migration adding 8 missing foreign key indexes:
      - `idx_stores_owner` on `public.stores(owner_id)`
      - `idx_orders_delivery_location` on `public.orders(delivery_location_id)`
      - `idx_orders_fee_paise` on `public.orders(fee_paise)`
      - `idx_order_items_store` on `public.order_items(store_id)`
      - `idx_order_items_product` on `public.order_items(product_id)`
      - `idx_inventory_reservations_store` on `public.inventory_reservations(store_id)`
      - `idx_inventory_reservations_product` on `public.inventory_reservations(product_id)`
      - `idx_platform_fee_reservations_order` on `public.platform_fee_reservations(active_order_id)`
    - Prevents table scans during foreign key CASCADE/RESTRICT operations and eliminates lock contention during concurrent checkouts.
  - `supabase/tests/database_integrity_test.sql`:
    - Added `TEST 13: Foreign Key Index Presence` asserting all 8 foreign key indexes exist in the schema.
- **Advisor Leads Audit & Resolution Matrix:**
  1. `public.rls_auto_enable()` callable by `anon` and `authenticated`:
     - *Status:* `RESOLVED_BY_MIGRATION` (statically verified).
     - *Detail:* Addressed on this audit branch in migration `20261022120000_restrict_rls_auto_enable_execute.sql` with regression test in `database_integrity_test.sql` lines 84–89.
  2. `SECURITY DEFINER` routines missing `SET search_path`:
     - *Status:* `VERIFIED_SECURE`.
     - *Detail:* Audited all 33 stored procedures and triggers across all 13 migrations. 100% of SECURITY DEFINER functions explicitly specify `SET search_path = public, pg_temp` or `public, extensions, pg_temp`, preventing search-path hijacking attacks. Enforced continuously by `scripts/validate-migrations.mjs`.
  3. `SECURITY DEFINER` execution grants to authenticated users:
     - *Status:* `INTENTIONAL_BY_DESIGN` (safe, least privilege).
     - *Detail:* `auth_user_has_role`, `auth_is_admin`, `auth_is_approved_runner`, and `auth_owns_store` require `GRANT EXECUTE TO authenticated` because Supabase evaluates Row Level Security policies using these functions under the user's authenticated session. Execution by `anon` and `PUBLIC` is strictly revoked. `apply_for_runner()` enforces `auth.uid() IS NOT NULL` and only allows self-application as `applicant`. `admin_set_runner_status()` and `mark_platform_fee_paid()` are restricted to `service_role`.
  4. Missing foreign key indexes:
     - *Status:* `RESOLVED_BY_MIGRATION`.
     - *Detail:* Added 8 missing foreign key indexes in forward migration `20261024000002_add_missing_foreign_key_indexes.sql`.
  5. Leaked-password protection disabled:
     - *Status:* `EXTERNAL_DASHBOARD_CONFIG`.
     - *Detail:* Supabase Auth configuration setting in Dashboard (`Authentication -> Attack Protection -> Leaked Passwords`). Cannot be managed via database migrations; documented in staging checklist.
  6. `citext` installed in `public` schema:
     - *Status:* `ACCEPTED_RISK_LOW`.
     - *Detail:* Extension is required by `profiles.email citext`. Moving extensions between schemas in live Supabase risks migration drift and function breakages without security benefit. Retained as-is.
  7. RLS initialization-plan and multiple permissive policies:
     - *Status:* `INVESTIGATED_PRESERVED`.
     - *Detail:* Evaluated multiple permissive policies on `orders`. These represent distinct role-based read/write access paths (customer, runner, store owner, admin) evaluated via logical OR, which is standard Supabase architecture.
- **Verification Commands & Evidence:**
  - `node scripts/validate-migrations.mjs`: 13 migration files validated cleanly, exit code 0.
  - Full suite `npm test`: 31 files passed, 628 passed, 1 skipped (629 total), exit code 0.
  - `npm run build`: cleanly compiled client and SSR bundles, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M7 — Full Regression Suite & Final Audit
- **Date / Session:** 2026-10-24
- **Automated Verification Results:**
  - **Migration Static Checks:** `node scripts/validate-migrations.mjs` -> 13 migration files validated with 0 errors (exit code 0).
  - **Full Automated Test Suite:** `npm test` -> 31 test files passed, 628 passed, 1 skipped (629 total), exit code 0.
  - **Production Bundle Build:** `npm run build` -> Client bundle (695 kB main bundle) and SSR bundle (93.5 kB entry) compiled cleanly with zero errors (exit code 0).
  - **Code Quality & Whitespace:** `git diff --check` -> 0 trailing whitespace or format issues.
- **Milestone Summary Table:**
  - `M0`: Baseline established; root causes proven for Goals A, B, and C (Commit `8b13b9f`).
  - `M1`: Admin runner approval privilege escalation fixed; forward migration `20261024000001` added with atomic RPC `admin_set_runner_status` (Commit `e38c0a3`).
  - `M2`: Contradictory order tracking badges eliminated; 6-stage lifecycle progress tracker added; live polling safely implemented (Commit `32cb379`).
  - `M3`: Runner dashboard verified at `/runner`; store-by-store pickup endpoint `handleRunnerPickupStore` implemented with strict role checks (Commit `dcb845d`).
  - `M4`: Safe demo runner approval and activation procedure documented step-by-step for campus administrators (Commit `bd9efa7`).
  - `M5`: In-flight payment concurrency guard `inFlightPaymentChecks` added with HTTP 409 lockout; frontend button immediately disabled during checks; required 5-second Gmail wait preserved (Commit `20bb63c`).
  - `M6`: Supabase advisor leads audited; 8 missing foreign key indexes added in forward migration `20261024000002`; all SECURITY DEFINER search paths verified (Commit `4f3a4ed`).
  - `M7`: Full regression test suite, static checks, build, and audit documentation completed.
- **Distinction Between Automated/Mocked Tests and Live Staging Requirements:**
  - *Automated / Local Proof:* Complete unit and integration test coverage across all Express endpoints, mock Supabase RPC handlers, React views, state machines, and concurrency locks passing cleanly.
  - *Live Staging Requirements:*
    1. Apply forward migrations `20261024000001_fix_admin_runner_approval_privilege.sql` and `20261024000002_add_missing_foreign_key_indexes.sql` to staging Supabase instance (`uuuqaeptpripmvavihza`).
    2. Enable "Leaked Passwords Protection" in Supabase Auth Dashboard (`Authentication -> Attack Protection`).
    3. Perform one live end-to-end checkout with Make.com webhook and Gmail alert matching to verify live UPI notification latency on campus network.
- **Safety & Prohibition Adherence:**
  - Zero git pushes executed (`git push` not run).
  - Zero pull requests created or default branches merged.
  - Zero deployments promoted.
  - Zero unreviewed production database changes executed.

### M8 — Staging Readiness & Live Acceptance Checklist
- **Date / Session:** 2026-10-24
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `fed07cc`
- **Goal:** Verify staging readiness, distinguish mock accounts from live Supabase Auth, validate pending forward migrations, check external integrations, and prepare an executable staged live acceptance checklist.
- **Frontend / Backend Contract Verification:**
  - **Runner Status Updates:** Frontend calls `adminService.setRunnerStatus(userId, status)` -> `request('admin.runners.setStatus', { userId, status })` -> `POST /admin/runners/setStatus`. Backend `server/src/routes/admin.js` accepts either `req.params.id` or `req.body.userId`, executes atomic RPC `admin_set_runner_status(UUID, VARCHAR)`, and returns `{ ...formatted, runnerStatus, roles }`. Contract is 100% aligned.
  - **Runner Dashboard Routes:** Frontend routes at `/runner` (`RunnerDashboardPage.jsx`) gated by `<RequireRole role="runner" />` requiring `user.runnerStatus === 'approved'` and `user.roles.includes('runner')`. Express backend mounts all runner endpoints via both REST (`/api/v1/runner/...`) and RPC-style paths (`/runner/orders/assigned`, `/runner/order/accept`, `/runner/order/pickupStore`, `/runner/order/transition`, `/runner/order/verifyOtp`).
  - **Environment Notice:** `RunnerDashboardPage.jsx` dynamically checks `isMockBackend` and displays truthful notices distinguishing mock testing from live staging.
- **Mock Demo Users vs. Live Supabase Auth Partition:**
  - `src/mocks/users.js` defines `SAMPLE_USERS` (`customer@martit.test`, `runner@martit.test`, `applicant@martit.test`, `superadmin@martit.test`) strictly for client-side and Vitest mock environments.
  - `supabase/seed.sql` populates campus categories, locations, stores, and products; it intentionally does NOT seed `auth.users`.
  - For live staging/production verification, actual Supabase Auth accounts must be provisioned via GoTrue Auth API or Supabase Dashboard.
- **Unapplied Forward Migrations Status:**
  - `supabase/migrations/20261024000001_fix_admin_runner_approval_privilege.sql` (implements atomic RPC `admin_set_runner_status`, updates `auth_is_admin()` and privilege trigger for `service_role`).
  - `supabase/migrations/20261024000002_add_missing_foreign_key_indexes.sql` (adds 8 missing foreign key indexes preventing table scans).
  - *Target Environment:* Staging Supabase project `uuuqaeptpripmvavihza`.
  - *Status:* Both migrations are locally committed, syntactically and structurally validated by `scripts/validate-migrations.mjs`, and covered by `supabase/tests/database_integrity_test.sql`. Neither migration has been applied to live staging or production.
- **Authorized External Integrations Audit:**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAKE_VERIFICATION_WEBHOOK_URL` are not set in the local agent shell.
  - Staging deployment and database execution must be performed by the authorized operator using the staging checklist below.

#### Staged Live Acceptance Checklist

| Stage | Step | Description | Expected Outcome | Operator Action / Tool |
|---|---|---|---|---|
| **1. DB Migration** | 1.1 | Apply forward migration `20261024000001` to staging Supabase instance `uuuqaeptpripmvavihza`. | `admin_set_runner_status()` RPC created; `auth_is_admin()` and trigger updated. | Supabase SQL Editor / CLI |
| | 1.2 | Apply forward migration `20261024000002` to staging Supabase instance `uuuqaeptpripmvavihza`. | 8 foreign key indexes created with `IF NOT EXISTS`. | Supabase SQL Editor / CLI |
| | 1.3 | Run `supabase/tests/database_integrity_test.sql` against staging database. | All 13 tests pass with 0 errors. | Supabase SQL Editor |
| **2. Auth Provisioning** | 2.1 | Sign up or verify staging admin account (e.g. `admin@campus.edu`). | User created in `auth.users`, profile in `profiles`, role `'admin'` in `user_roles`. | Supabase Auth / Dashboard |
| | 2.2 | Sign up staging customer account (e.g. `customer@campus.edu`). | User created in `auth.users`, profile in `profiles`, role `'customer'` in `user_roles`. | `/signup` or GoTrue API |
| | 2.3 | Sign up staging runner applicant account (e.g. `applicant@campus.edu`). | User created with role `'customer'`. | `/signup` or GoTrue API |
| | 2.4 | Submit runner application for applicant account. | Calls `apply_for_runner()`; `profiles.runner_status` becomes `'applicant'`. | `/profile` or POST `/runner/apply` |
| **3. Admin Approval** | 3.1 | Log in as admin at `/admin/login`. | Navigates to `/admin`. Route guard allows access. | Web Browser |
| | 3.2 | Open "People & Roles" -> "Applicants" tab. | Applicant `applicant@campus.edu` appears in the list. | Web Browser |
| | 3.3 | Click "Approve runner" button. | Toast: "Runner approved successfully." RPC executes without `PERMISSION_DENIED` error. | Web Browser |
| | 3.4 | Verify database state in Supabase. | `profiles.runner_status = 'approved'`, `user_roles` contains `'runner'`. | Supabase Table Editor |
| **4. Runner Dashboard** | 4.1 | Log in as approved runner at `/login`. | Automatically redirects to `/runner`. Route guard allows access. | Web Browser |
| | 4.2 | Toggle "Runner Availability" switch to "Online". | Switch turns green ("Online"). Offline warning disappears. | Web Browser |
| | 4.3 | Check available orders queue. | Unassigned `CONFIRMED` orders are visible in real time. | Web Browser |
| **5. Customer Checkout** | 5.1 | Log in as customer on mobile/desktop browser. | Navigates to `/app`. | Web Browser |
| | 5.2 | Add items from Campus Mart to cart and proceed to `/app/payment`. | Dynamic UPI QR displays with payee VPA, order ID, and 2-minute countdown timer. | Web Browser |
| **6. Make.com Verification** | 6.1 | Transfer exact total amount via UPI, or dispatch test payload from Make.com scenario with `x-make-secret`. | Gmail notification received, Make.com webhook triggers backend `/api/v1/webhooks/make-payment`. | UPI App / Make.com Scenario |
| | 6.2 | Customer clicks "Confirm Payment" on `/app/payment`. | Backend calls Make.com verification; `handleCheckPayment` receives positive confirmation. | Web Browser |
| | 6.3 | Order transitions to `CONFIRMED` in PostgreSQL. | Customer view updates to Stage 1 "Payment Confirmed" on 6-stage tracker. | Web Browser / PostgreSQL |
| **7. Concurrency Lock** | 7.1 | Tap "Confirm Payment" repeatedly during active verification. | Button is disabled with spinner ("Checking payment..."); rapid clicks return HTTP 409 `VERIFICATION_IN_FLIGHT` cleanly without double charge. | Web Browser DevTools |
| **8. Runner Acceptance** | 8.1 | On `/runner`, approved runner sees new order in "Available Requests". | Order card displays store name, delivery destination, and total items. | Web Browser |
| | 8.2 | Runner clicks "Accept delivery request". | Order atomically claims `runner_id = <runner-uuid>` and status transitions to `PREPARING`. | Web Browser |
| | 8.3 | Concurrency check: Second runner attempts to accept same order. | Second runner receives HTTP 409 `ORDER_ALREADY_ASSIGNED`; order disappears from their queue. | Second Browser / Test Client |
| **9. Store Pickup** | 9.1 | Runner navigates to physical campus store. | Order card displays store pickup checklist. | Web Browser |
| | 9.2 | Runner clicks "Confirm Store Pickup". | `POST /runner/order/pickupStore` marks fulfillment group `PICKED_UP`. When all stores collected, order status advances to `PICKED_UP`. | Web Browser |
| **10. Delivery OTP Handover** | 10.1 | Runner clicks "Depart Store / Out for Delivery". | Order transitions to `ON_THE_WAY`. Atomic RPC `transition_order_to_on_the_way` initializes OTP challenge in DB; RAM holds 6-digit code. | Web Browser |
| | 10.2 | Customer checks `/app/order-confirmation`. | 6-stage tracker advances to Stage 5 "Out for Delivery"; `CustomerDeliveryOtpCard` displays 6-digit OTP with countdown timer. | Web Browser |
| | 10.3 | Customer tests "Refresh Code" button. | New 6-digit OTP generated and challenge updated in database without order disruption. | Web Browser |
| **11. Delivery Completion** | 11.1 | Runner arrives at customer delivery spot; customer reads OTP. | Runner inputs 6-digit code on `/runner`. | Web Browser |
| | 11.2 | Runner clicks "Verify & Complete Delivery". | `POST /runner/order/verifyOtp` calls `verify_delivery_otp()` RPC. SHA-256 hash verified. Order transitions to `DELIVERED`. | Web Browser |
| | 11.3 | Customer tracking screen updates automatically. | Polling detects `DELIVERED` status; tracker marks Stage 6 "Delivered" and stops polling. | Web Browser |

### M9 — Staging Acceptance Plan & Operational Verification
- **Date / Session:** 2026-10-24
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `25e9f02`
- **Commit:** `f4d0da7` (`feat(staging): define staging acceptance plan and verify OTP recovery resilience (Milestone 9)`)
- **Goal:** Synthesize and execute all safe local tasks for staging acceptance, including forward migration and history audit, admin runner approval authorization verification, staging account provisioning requirements, Make.com webhook contract and environment configuration, OTP durability and backend restart recovery testing, and publication of the authoritative staging execution checklist (`docs/STAGING_ACCEPTANCE_PLAN.md`).
- **Files Modified / Created:**
  - `docs/STAGING_ACCEPTANCE_PLAN.md`: Created comprehensive operational plan covering sequenced tasks, dependencies, risks, acceptance criteria, role boundaries, 10-stage live acceptance walkthrough, and operator personal action checklist.
  - `server/src/__tests__/ordersOtp.test.js`: Added Section 12 test suite verifying OTP resilience after backend server restart (`activeOtpStore` RAM wiped) covering customer reissuance via `reissue_delivery_otp` RPC and runner verification directly against PostgreSQL persistent hash.
  - `docs/REPAIR_PROGRESS.md`: Updated durable progress ledger with Milestone 9.
- **Verification Commands & Evidence:**
  - `npm test -- server/src/__tests__/ordersOtp.test.js`: 34 tests passed (34/34), exit code 0.
  - Full suite `npm test`: 31 files passed, 630 passed, 1 skipped (631 total), exit code 0.
  - `node scripts/validate-migrations.mjs`: 13 migration files validated cleanly, exit code 0.
  - `npm run build`: cleanly compiled client and SSR bundles with prerendered HTML, exit code 0.
  - `git diff --check`: 0 whitespace issues.
- **Distinction Between Automated/Mocked Proof and Live Requirements:**
  - *Automated / Local Proof:* All 630 unit and integration tests passing, including full lifecycle transitions, payment concurrency locks, Make.com webhook fail-closed parsing, and OTP server restart recovery.
  - *Blocked Live Requirements (User Action Required):*
    1. Apply unapplied forward migrations (`20261024000001` and `20261024000002`) to Supabase project `uuuqaeptpripmvavihza`.
    2. Enable Leaked Passwords Protection in Supabase Auth settings.
    3. Configure `MAKE_VERIFICATION_WEBHOOK_URL` in Render service environment.
    4. Configure `VITE_UPI_PAYEE_VPA` in Vercel project environment.
    5. Provision 3 staging accounts in GoTrue Auth (admin, runner applicant, customer) and execute the 10-stage live acceptance test.

### M10 — Final Product Plan Execution & Verification
- **Date / Session:** 2026-10-24
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `0e7a544`
- **Commit:** `cb2b871` (`docs(product): execute final product plan, align documentation, and record verified status`)
- **Goal:** Execute `docs/FINAL_PRODUCT_PLAN.md` as the authoritative task queue across Milestones 0 to 5, align `README.md` with verified repository state, ensure end-to-end customer-to-delivery lifecycle guarantees, verify fail-closed payment semantics, validate atomic runner exclusivity, and ensure durable documentation integrity.
- **Completed Plan Items:**
  - **Milestone 0 (Starting Point):** Verified baseline commit, test/build scripts, clean working tree, and dependency hierarchy.
  - **Milestone 1 (Application Behavior):** Verified complete order lifecycle in `endToEndOrderLifecycle.test.js`, runner pickup endpoint `handleRunnerPickupStore`, in-app OTP retrieval and server-restart resilience in `ordersOtp.test.js`, and concurrency lock guards.
  - **Milestone 2 (Database & Hosted Configuration Readiness):** Validated all 13 migration files, recorded prerequisites and risks for forward migrations `20261024000001` and `20261024000002`, inventoried required Render and Vercel environment variables, and isolated operator manual actions.
  - **Milestone 3 (Automated Verification & Release Quality):** Ran full test suite (31 files, 630 passed, 1 skipped), migration validator (13 valid), and production build (client + SSR + prerender) with zero errors.
  - **Milestone 4 (Staging End-to-End Verification):** Verified 10-stage test checklist against automated test suite, partitioned mock testing from live GoTrue staging, and documented blocked operator steps.
  - **Milestone 5 (Final Product Handoff):** Updated `README.md` "What's real vs incomplete" table to reflect completed 6-stage tracker, atomic runner approval, runner exclusivity, and restart-resilient OTP verification.
- **Verification Commands & Evidence:**
  - `npm test`: 31 files passed, 630 passed, 1 skipped (631 total), exit code 0.
  - `node scripts/validate-migrations.mjs`: 13 migration files validated cleanly, exit code 0.
  - `npm run build`: cleanly compiled client and SSR bundles with prerendered HTML, exit code 0.
  - `git diff --check`: 0 whitespace issues.
- **Distinction Between Automated/Mocked Proof and Live Requirements:**
  - *Automated / Local Proof:* All 630 unit and integration tests passing; end-to-end order lifecycle fully validated from checkout to OTP delivery completion.
  - *Blocked Live Requirements (User Action Required):*
    1. Apply unapplied forward migrations (`20261024000001` and `20261024000002`) to Supabase project `uuuqaeptpripmvavihza` via SQL Editor.
    2. Enable Leaked Passwords Protection in Supabase Auth settings (`Authentication -> Attack Protection`).
    3. Configure `MAKE_VERIFICATION_WEBHOOK_URL` in Render service environment.
    4. Configure `VITE_UPI_PAYEE_VPA` in Vercel project environment.
    5. Provision 3 staging accounts in GoTrue Auth (admin, runner applicant, customer) and execute the 10-stage live acceptance walkthrough.

### M11 — Form Validation, Input Constraints & Responsive UX Fix
- **Date / Session:** 2026-11-14
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `3931414`
- **Milestone Commits:**
  - `c57477e`: `feat(validation): add client and server validation utilities with responsive UI wrappers (Milestone A)`
  - `ab9e24c`: `feat(auth): enforce input validation, field constraints, and inline errors on registration, login, and password reset (Milestone B)`
  - `09e1eb4`: `feat(checkout): add input bounds and responsive constraints for checkout, runner notes, and admin search (Milestone C)`
  - Final Milestone D commit: `feat(api): harden backend and mock server payload validation for auth and orders (Milestone D)`
- **Goal:** Fix form validation and input usability throughout MartIT. Eliminate defects where the account registration form accepted excessively long phone numbers (20+ digits) and invalid email text without meaningful validation. Ensure robust client and server validation, responsive inputs, and input constraints across registration, login, reset password, checkout, delivery details, runner controls, and admin search.
- **Implemented Fixes & Protections:**
  1. **Shared Validation Utilities (`src/utils/validators.js` & `server/src/utils/validators.js`):**
     - **Phone Numbers:** Validates 10-digit Indian mobile numbers starting with 6, 7, 8, or 9. Handles optional `+91`, `91`, or `0` prefix. Rejects non-digits, too-short numbers, and overlong inputs without silent truncation. Allows empty string when optional (e.g. signup) but enforces strictly when required (checkout).
     - **Names:** Enforces 2–120 characters matching Postgres `VARCHAR(120)`. Allows legitimate Indian Unicode scripts (Devanagari, Tamil, Bengali), spaces, hyphens, and typographic/curly apostrophes (`' `, `’`). Rejects blank or non-letter inputs.
     - **Emails:** RFC-compliant syntax validation with 255 character limit, username max 64 chars, and mandatory domain extension (min 2 chars). Rejects internal spaces and malformed text. Normalizes casing and whitespace.
     - **Passwords:** Minimum 8 characters on registration, maximum 72 characters (Bcrypt safe boundary). Confirmation matching verification.
  2. **Responsive UI & Container Bounds:**
     - `src/components/ui/Input.jsx`: Added `min-w-0` to default input class to prevent overflow in CSS flex/grid containers.
     - `src/components/ui/Field.jsx`: Added `min-w-0` and `break-words` on error containers so long validation messages wrap cleanly on narrow screens (320px–375px).
  3. **Auth & Registration Forms:**
     - `src/pages/auth/SignupPage.jsx`: Inline field-level validation on blur and change once touched; HTML `type="tel"`, `inputMode="tel"`, `maxLength={16}` for phone, `maxLength={255}` for email, `maxLength={120}` for full name, `maxLength={72}` for password and confirm password. Prevents submission while errors exist.
     - `src/pages/auth/LoginPage.jsx`: Email syntax check on blur and submit, inline error messages, `maxLength={255}` for email, `maxLength={72}` for password, and `maxLength={255}` for forgot password email.
     - `src/pages/auth/ResetPasswordPage.jsx`: Validates password length and confirmation match with inline field errors, `maxLength={72}` on password inputs, `maxLength={255}` on recovery email request input.
     - `src/pages/admin/AdminLoginPage.jsx`: Administrator email validation and length constraints (`maxLength={255}`).
  4. **Checkout, Runner & Admin Controls:**
     - `src/components/cart/DeliveryDetailsForm.jsx` & `src/utils/checkoutValidation.js`: Bound customer name to 120 chars, phone to 16 chars with `inputMode="tel"`, custom location address to 200 chars, and delivery instructions to 500 chars.
     - `src/components/runner/DeliveryCard.jsx`: Handover OTP constrained to exactly 6 numeric digits with `inputMode="numeric"`, `pattern="[0-9]*"`, and `maxLength={6}`. Additional delay notes constrained to `maxLength={250}` with responsive `min-w-0`.
     - `src/components/products/CatalogueSearch.jsx`: Search input constrained to `maxLength={100}` with `min-w-0`.
     - `src/pages/admin/AdminConsolePage.jsx`: User search, order search, and product search constrained to `maxLength={100}`.
  5. **Backend & Mock Server Payload Enforcement:**
     - `server/src/routes/auth.js`: `handleSignup` validates name, email, phone, and password using server validators, returning `400 INVALID_NAME`, `400 INVALID_EMAIL`, `400 INVALID_PHONE`, or `400 INVALID_PASSWORD`.
     - `server/src/routes/orders.js`: `handleCreateOrder` validates `customerDetails` (recipient name 2-120 chars, 10-digit Indian phone, destination <= 200 chars, notes <= 500 chars).
     - `src/services/mockServer/handlers.js`: Synchronized mock `auth.signup` and `orders.create` to enforce identical validation rules.
- **Verification Commands & Evidence:**
  - `npm test`: 41 test files passed, 730 passed, 1 skipped (731 total), exit code 0.
  - `npm run test:server`: 17 test files passed, 369 passed, 1 skipped, exit code 0.
  - `npm run test:all`: 41 test files + 13 migration checks validated, exit code 0.
  - `npm run build`: Client, SSR, and pre-rendering completed with 0 errors, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M12.1 — Multi-Store Pricing & Surcharge Configuration
- **Date / Session:** 2026-11-16
- **Changes Implemented:**
  1. `src/config/fees.js`: Added `MULTI_STORE_SURCHARGE` with safe default of ₹0, configurable via `process.env.MULTI_STORE_SURCHARGE` or `import.meta.env.VITE_MULTI_STORE_SURCHARGE`. Added `MULTI_STORE_SURCHARGE_LABEL = 'Additional store surcharge'`.
  2. `src/utils/deliveryFee.js`: Implemented `calculateAdditionalStoreSurcharge(storeCount, surcharge)` adhering strictly to the formula $A = \max(0, N - 1) \times S$. Updated `calculateDeliveryFee(distanceKm, storeCount, options)` returning combined delivery fee $D = B + A$ alongside granular breakdown fields (`baseDeliveryFee`, `additionalStoreSurcharge`, `storeCount`, `surchargePerAdditionalStore`).
  3. `src/utils/orderTotals.js`: Extended `calculateOrderTotals` to accept optional `baseDeliveryFee` and `additionalStoreSurcharge`, returning them in breakdown while preserving exact backward compatibility for existing callers.
  4. `src/utils/__tests__/deliveryFee.test.js`: Added 10 new test cases covering single store ($N=1 \implies A=0$), 2 stores ($N=2 \implies A=S$), 3 stores ($N=3 \implies A=2S$), store count reductions, custom surcharge rate overrides, and edge cases.
- **Verification Commands & Evidence:**
  - `npx vitest run src/utils/__tests__/deliveryFee.test.js`: 42 tests passed, exit code 0.
  - `npx vitest run src/utils/__tests__/ src/pages/customer/__tests__/flatDeliveryFeePolicy.test.jsx`: 7 test files, 124 passed, exit code 0.

### M12.2 — Multi-Store Cart Store & Customer Warning UI
- **Date / Session:** 2026-11-16
- **Changes Implemented:**
  1. `src/stores/cartStore.js`:
     - Extended cart line items to retain store identity: `{ productId, quantity, storeId }`.
     - Preserved backward compatibility for older persisted single-store carts via fallback store ID extraction and product catalogue lookup.
     - Implemented single-store to multi-store transition detection: triggers `showMultiStoreWarning: true` and initializes `warningDismissed: false` on the first multi-store addition.
     - Automatically resets `warningDismissed` if cart store count drops back to $\le 1$ store, ensuring subsequent multi-store transitions re-trigger notice.
     - Added selectors: `selectDistinctStoreIds`, `selectIsMultiStore`, `selectMultiStoreCount`, and `selectCartLinesByStore`.
  2. `src/components/products/ProductCard.jsx`:
     - Removed restrictive single-store switch dialog and cart-clearing behavior. Customers can add items from different stores directly.
  3. `src/components/cart/MultiStoreWarningModal.jsx`:
     - Created accessible modal dialog using Radix UI describing multi-store surcharges, separate runner pickups, delivery fee combination, and single payment attempt.
     - Mounted inside `src/app/providers.jsx` to be active across all customer shopping views.
  4. `src/pages/customer/CartPage.jsx`:
     - Added distinct store grouping: groups cart items by store with individual store headers and item subtotals.
     - Added persistent multi-store indicator banner displaying distinct store count, campus store names, and additional surcharge summary.
     - Rendered granular delivery fee breakdown in the order summary (Base Delivery Fee + Additional Store Surcharge = Total Delivery Fee).
     - Passed `storeIds` array and per-line `storeId`s to `orderService.create`.
  5. Tests:
     - Created `src/pages/customer/__tests__/multiStoreCart.test.jsx` (5 tests covering store transitions, warning triggers, pricing helpers, and grouped cart UI).
     - Updated `src/components/products/__tests__/catalogue.test.js` and `src/pages/customer/__tests__/checkoutFlow.test.js` to assert `{ productId, quantity, storeId }` lines.
- **Verification Commands & Evidence:**
  - `npx vitest run src/pages/customer/__tests__/multiStoreCart.test.jsx`: 5 tests passed, exit code 0.
  - `npx vitest run src/components/products/__tests__/catalogue.test.js`: 21 tests passed, exit code 0.
  - `npx vitest run src/pages/customer/__tests__/checkoutFlow.test.js`: 22 tests passed, exit code 0.
  - `npx vitest run src/components/products/__tests__/ src/pages/customer/__tests__/`: 8 test files, 117 tests passed, exit code 0.

### M12.3 — Server & Mock Server Multi-Store Order Creation
- **Date / Session:** 2026-11-16
- **Changes Implemented:**
  1. `supabase/migrations/20261116000001_multi_store_atomic_orders.sql`:
     - Upgraded PostgreSQL stored procedure `create_order_atomic` to support multi-store carts.
     - Loops through unique store IDs derived from line items, inserting distinct `order_fulfillment_groups` with indexed pickup sequences.
     - Inserts `order_items` linked to their respective fulfillment groups and store IDs.
     - Creates `inventory_reservations` held per store and product with automatic expiration window.
     - Statically validated against schema conventions with `node scripts/validate-migrations.mjs`.
  2. `server/src/routes/orders.js`:
     - Updated `handleCreateOrder` to accept `storeIds` array and line-item store mappings.
     - Validates all requested stores upfront (exists, open); rejects closed stores with `STORE_CLOSED` (409) and missing stores with `STORE_NOT_FOUND` (404).
     - Validates product availability and stock across all participating campus stores.
     - Computes multi-store delivery distances across all involved store locations to customer destination.
     - Calculates authoritative financial totals including base delivery fee + additional store surcharge ($A = \max(0, N-1) \times S$).
     - Returns canonical response shape with populated `fulfillmentGroups` array containing store snapshots and respective line items.
  3. `src/services/mockServer/handlers.js`:
     - Updated mock server `orders.create` to handle multi-store cart payloads, calculate multi-store delivery fees with surcharge, deduct inventory across stores, and populate `order_fulfillment_groups` and `pickups`.
  4. `server/src/__tests__/testHelpers.js`:
     - Updated mock transaction engine for `create_order_atomic` to create distinct fulfillment groups and items per store.
  5. `server/src/__tests__/orders.test.js`:
     - Added test 33: creates multi-store order across campus stores with distinct fulfillment groups and fee breakdown.
     - Added test 34: rejects multi-store order if any included store is closed.
- **Verification Commands & Evidence:**
  - `node scripts/validate-migrations.mjs`: 14 migration files validated, exit code 0.
  - `npx vitest run server/src/__tests__/orders.test.js`: 89 tests passed, exit code 0.
  - `npx vitest run server/src/__tests__/endToEndOrderLifecycle.test.js`: 8 tests passed, exit code 0.
  - `npm run test:server`: 17 test files, 374 passed, exit code 0.
  - `npm test`: 42 test files, 748 passed, 1 skipped, exit code 0.

### M12.4 — Combined Payment & Multi-Store Runner Tracking
- **Date / Session:** 2026-11-16
- **Changes Implemented:**
  1. `src/components/payment/CustomerPaymentView.jsx`:
     - Updated store header to reflect multi-store collections ("Stores (Multi-Store)" listing campus store names).
     - Rendered granular delivery fee breakdown when multi-store surcharges apply: `(Base ₹10 + Multi-Store ₹S)`.
     - Preserved single combined UPI payment attempt, dynamic platform fee allocation, 2-minute payment window, and Make.com + Gmail verification path.
  2. `src/components/cart/OrderConfirmationView.jsx`:
     - Updated store summary to render all participating stores when order contains multiple fulfillment groups.
     - Added multi-store pickup status card displaying collection progress across all distinct campus stores (`X of N Picked Up` with individual store status badges).
     - Added granular delivery fee breakdown in the authoritative pricing snapshot.
  3. Tests:
     - Added tests to `src/pages/customer/__tests__/multiStoreCart.test.jsx` verifying `CustomerPaymentView` and `OrderConfirmationView` multi-store UI rendering, granular fee breakdown, and pickup checklist.
- **Verification Commands & Evidence:**
  - `npx vitest run src/pages/customer/__tests__/multiStoreCart.test.jsx`: 7 tests passed, exit code 0.
  - `npx vitest run src/pages/runner/__tests__/`: 4 test files, 65 tests passed, exit code 0.
  - `npm test`: 42 test files, 750 passed, 1 skipped, exit code 0.
  - `npm run test:server`: 17 test files, 374 passed, exit code 0.
  - `npm run build`: Production client, SSR build, and static pre-rendering cleanly succeeded, exit code 0.

### M12.5 — Cart Selector Stability & React Error #185 Prevention
- **Date / Session:** 2026-11-17
- **Problem Statement:**
  - Production deployment at `https://martit.vercel.app/app/cart` crashed with `Minified React error #185 — Maximum update depth exceeded`.
  - Root Cause: In Zustand v5 (`^5.0.15`) with React 19 (`^19.3.0`), `useCartStore(selectDistinctStoreIds)` in `CartPage.jsx` returned a newly allocated array instance (`Array.from(...)`) on every read. When combined with state updates (such as the `checkoutDetails` profile prefill effect), `Object.is` check in React's `useSyncExternalStore` detected changed snapshots during render cycles, triggering continuous updates and crashing with `Minified React error #185`.
- **Changes Implemented:**
  1. `src/pages/customer/CartPage.jsx`:
     - Imported `useShallow` from `zustand/react/shallow`.
     - Wrapped `selectDistinctStoreIds` in `useCartStore(useShallow(selectDistinctStoreIds))`.
     - Wrapped `checkoutDetails` in `useCartStore(useShallow((s) => s.checkoutDetails))`.
     - Deconstructed primitive strings (`userName = user?.name`, `userPhone = user?.phone`) in the profile prefill `useEffect` dependency array.
  2. `src/stores/cartStore.js`:
     - Stabilized `selectDistinctStoreIds` with internal referential equality caching (`cachedDistinctStoreIds`) so consecutive selector evaluations return the exact same array reference when distinct store IDs have not changed.
     - Refactored `selectIsMultiStore`, `selectMultiStoreCount`, and `selectCartStoreId` to reuse the memoized `selectDistinctStoreIds(s)`.
     - Stabilized `selectCartLinesByStore` with caching (`cachedCartLinesByStore`) so consecutive reads return the same array reference when cart lines have not changed.
  3. `src/pages/customer/__tests__/cartSelectorStability.test.jsx`:
     - Added 11 regression tests verifying selector referential stability across consecutive reads, state updates, item quantity changes, and store additions/removals.
     - Verified `CartPage` renders without error for empty cart, single-store cart, persisted multi-store cart, and authenticated profile prefill.
- **Verification Commands & Evidence:**
  - `npx vitest run src/pages/customer/__tests__/cartSelectorStability.test.jsx`: 11 passed, exit code 0.
  - `npm test`: 44 test files, 767 passed, 1 skipped, exit code 0.
  - `npm run test:server`: 17 test files, 374 passed, 1 skipped, exit code 0.
  - `node scripts/validate-migrations.mjs`: 15 migrations statically validated, exit code 0.
  - `npm run build`: Production client, SSR build, and static pre-rendering cleanly succeeded, exit code 0.

### M13 — Animated Sun-to-Moon Theme Transition
- **Date / Session:** 2026-11-17
- **Objective:**
  - Replace MartIT's basic circular reveal theme toggle with a cinematic, animated sun-to-moon eclipse transition.
  - Deliver genuine clockwise 360-degree sweep starting from the 3 o'clock position (rightmost coordinate: $(cx + r, cy)$).
  - Guarantee zero flash of previous theme or unstyled intermediate states.
  - Support `prefers-reduced-motion` accessible bypass, rapid-click protection, and SSR pre-rendering compatibility.
- **Changes Implemented:**
  1. `src/stores/themeStore.js`:
     - Added `isTransitioning`, `transitionDirection` (`'to-dark'` | `'to-light'`), `targetTheme`, and `isOverlayMounted`.
     - Hardened `setTheme(theme)` with rapid click guard: ignores redundant triggers while transition is running.
     - Added `prefers-reduced-motion` check: instantly commits theme without animation if reduced motion is requested.
     - Added overlay mount check: commits immediately when overlay is not mounted (e.g. headless unit tests, non-overlay routes).
     - Added `commitTheme(targetTheme)` to commit dataset and localStorage state at totality.
     - Added `finishTransition()` to clean up transition state after exit fade.
  2. `src/components/theme/ThemeTransitionOverlay.jsx`:
     - Full-screen fixed overlay (`fixed inset-0 z-[99999] pointer-events-auto`) mounted centrally in the viewport.
     - Implemented `getSectorPath(cx, cy, r, angleDeg)` generating an exact circular sector starting at 3 o'clock and sweeping clockwise through 360°.
     - Light $\to$ Dark: Warm glowing sun (`#FEF08A`) with 8 rays that extinguish sequentially as the dark moon sector (`#0b1410`) sweeps clockwise from 3 o'clock over the sun disk.
     - Dark $\to$ Light: Dark celestial moon disk revealed clockwise into a warm glowing sun with a radiant dawn beam travelling along the leading sweep edge.
     - Totality synchronization: at 360° totality (850ms), the backdrop veil reaches 100% opacity of the destination theme token (`#0b1410` for dark, `#f8fafc` for light), calling `commitTheme()` behind the solid veil with zero visible flash.
     - Exit fade: smooth 200ms dissolve from opacity 1.0 to 0 with subtle scale dispersion.
  3. `src/components/layout/ThemeToggle.jsx`:
     - Connected `disabled={isTransitioning}` and `aria-busy={isTransitioning}`.
     - Blocked click events during transition (`if (!isTransitioning) setTheme(next)`).
     - Preserved accessible `aria-label` and spring-based icon flip.
  4. `src/app/providers.jsx`:
     - Mounted `<ThemeTransitionOverlay />` inside the application's global provider hierarchy.
  5. `src/components/theme/__tests__/themeTransition.test.jsx`:
     - 27 comprehensive unit and integration tests covering:
       - 3 o'clock starting position $(cx + r, cy)$ and clockwise 360° sweep geometry.
       - 8 evenly spaced spokes at 12 o'clock, 1:30, 3 o'clock, 4:30, 6 o'clock, 7:30, 9 o'clock, 10:30.
       - Uniform spoke length and zero collision with sun circular outline.
       - Scaled durations reflecting 0.75x playback speed (1.3333x duration scaling).
       - `easeInOutCubic` monotonicity and bounds.
       - Store state transitions, rapid click protection, totality commit, and finish lifecycle.
       - Reverse `to-light` transition.
       - `prefers-reduced-motion` instant bypass.
       - `ThemeToggle` accessibility attributes (`aria-label`, `disabled`, `aria-busy`).
       - Full-screen overlay markup in both directions.
  6. Spokes & Speed Refinements:
     - Completely redesigned and rewrote the sun spokes so that all 8 spokes (12:00, 1:30, 3:00, 4:30, 6:00, 7:30, 9:00, 10:30) are bold, crisp, and prominent.
     - Resolved SVG filter zero-dimension bounding-box collapse bug: vertical lines (`x1 === x2`, width 0) and horizontal lines (`y1 === y2`, height 0) were previously hidden by browsers when `filterUnits="objectBoundingBox"` was evaluated per line. Fixed by specifying `filterUnits="userSpaceOnUse"` and applying `filter="url(#martitWarmGlow)"` to the parent `<g id="sunRays">` container.
     - Spoke length extended to a uniform 14.0 units (inner radius 26.0, outer radius 40.0, strokeWidth 3.6 with rounded caps).
     - Sun circular body calibrated to radius 19.0 (strokeWidth 3.2, outer edge 20.6), providing a clean 5.4-unit visual margin with guaranteed zero collision.
     - Calibrated subtle glow filter (`stdDeviation="1.0"`) and radial aura (`r="23"`) so diagonal rays are never washed out or blurred into background haze.
     - Maintained 0.75x playback speed consistently across the entire transition lifecycle (1.3333x duration scaling: INTRO 187ms, SWEEP 907ms, OUTRO 267ms, TOTAL 1361ms).
- **Verification Commands & Evidence:**
  - `npx vitest run src/components/theme/__tests__/themeTransition.test.jsx`: 27 tests passed, exit code 0.
  - `npm test`: 45 test files, 809 passed, 1 skipped (810 total), exit code 0.
  - `npm run test:server`: 17 test files, 380 passed, 1 skipped, exit code 0.
  - `node scripts/validate-migrations.mjs`: 15 migrations statically validated, exit code 0.
  - `npm run build`: Production client, SSR build, and static pre-rendering cleanly succeeded, exit code 0.

### M12.6 — Authoritative ₹10 Multi-Store Surcharge & Pricing Consistency
- **Date / Session:** 2026-11-17
- **Problem Statement:**
  - Multi-store orders were displaying ₹0 additional-store surcharge on the cart page (e.g. 2 stores, ₹100 items, ₹10 base delivery, ₹0 surcharge, ₹110 estimated total).
  - Root Cause: In `src/config/fees.js`, `MULTI_STORE_SURCHARGE` fell back to `0` when `process.env.MULTI_STORE_SURCHARGE` or `import.meta.env.VITE_MULTI_STORE_SURCHARGE` was omitted from environment variables.
- **Changes Implemented:**
  1. `src/config/fees.js`:
     - Established `DEFAULT_MULTI_STORE_SURCHARGE = 10` as the authoritative approved default.
     - Implemented `resolveMultiStoreSurcharge` with strict validation: safely returns ₹10 when omitted/empty; parses valid numbers; throws descriptive error on negative or non-numeric values.
     - Bumped `PRICING_VERSION = '2026-11-17.1'`.
  2. `server/src/config/env.js`:
     - Added `MULTI_STORE_SURCHARGE: z.coerce.number().nonnegative().default(10)` to production and development schemas, and default 10 to test schema.
  3. `server/src/routes/orders.js`:
     - Updated `formatCanonicalOrder` to include `baseDeliveryFee` and `additionalStoreSurcharge` in all canonical order snapshots (including idempotent replays and order lookups).
     - Ensured `storeIds` array is always present in canonical order outputs.
     - Preserved authoritative server-side calculation: client-supplied totals, delivery fees, and surcharges in request bodies are completely ignored.
  4. `src/pages/customer/OrdersPage.jsx`:
     - Added multi-store indicator (`Multi-Store (N)`) and rendered all store names for multi-store orders.
     - Rendered explicit surcharge breakdown (`(Includes ₹X multi-store surcharge)`) in the order card summary.
     - Preserved store affinity per line item during reorders.
  5. `src/pages/admin/AdminConsolePage.jsx`:
     - Added multi-store badges and store names in the Admin operations order list.
     - Rendered granular delivery fee breakdown (`(Delivery: ₹D [Base ₹B + Surcharge ₹S])`) in the pricing summary.
  6. Tests:
     - `src/utils/__tests__/deliveryFee.test.js`: Added 6 tests for `resolveMultiStoreSurcharge` validation, default ₹10 surcharge, and multi-store delivery fee calculations (48 passed).
     - `server/src/__tests__/orders.test.js`: Added 6 tests for Acceptance Scenarios 1, 2, and 3 (1 store ₹110, 2 stores ₹120, 3 stores ₹130), same-store item additions, client-spoofing rejection, and idempotent replay consistency (95 passed).
     - `src/pages/customer/__tests__/multiStoreCart.test.jsx`: Updated cart rendering assertions for ₹10 surcharge and combined breakdown (7 passed).
- **Verification Commands & Evidence:**
  - `npx vitest run src/utils/__tests__/deliveryFee.test.js`: 48 passed, exit code 0.
  - `npx vitest run server/src/__tests__/orders.test.js`: 95 passed, exit code 0.
  - `npm test`: 44 test files, 782 passed, 1 skipped, exit code 0.
  - `npm run test:server`: 17 test files, 380 passed, 1 skipped, exit code 0.
  - `node scripts/validate-migrations.mjs`: 15 migrations statically validated, exit code 0.
  - `npm run build`: Production client, SSR build, and static pre-rendering cleanly succeeded, exit code 0.

### M13 — Animated Sun-to-Moon Theme Transition
- **Date / Session:** 2026-11-17
- **Objective:**
  - Replace MartIT's basic circular reveal theme toggle with a cinematic, animated sun-to-moon eclipse transition.
  - Deliver genuine clockwise 360-degree sweep starting from the 3 o'clock position (rightmost coordinate: $(cx + r, cy)$).
  - Guarantee zero flash of previous theme or unstyled intermediate states.
  - Support `prefers-reduced-motion` accessible bypass, rapid-click protection, and SSR pre-rendering compatibility.
- **Changes Implemented:**
  1. `src/stores/themeStore.js`:
     - Added `isTransitioning`, `transitionDirection` (`'to-dark'` | `'to-light'`), `targetTheme`, and `isOverlayMounted`.
     - Hardened `setTheme(theme)` with rapid click guard: ignores redundant triggers while transition is running.
     - Added `prefers-reduced-motion` check: instantly commits theme without animation if reduced motion is requested.
     - Added overlay mount check: commits immediately when overlay is not mounted (e.g. headless unit tests, non-overlay routes).
     - Added `commitTheme(targetTheme)` to commit dataset and localStorage state at totality.
     - Added `finishTransition()` to clean up transition state after exit fade.
  2. `src/components/theme/ThemeTransitionOverlay.jsx`:
     - Full-screen fixed overlay (`fixed inset-0 z-[99999] pointer-events-auto`) mounted centrally in the viewport.
     - Implemented `getSectorPath(cx, cy, r, angleDeg)` generating an exact circular sector starting at 3 o'clock and sweeping clockwise through 360°.
     - Light $\to$ Dark: Warm glowing sun (`#FEF08A`) with 8 rays that extinguish sequentially as the dark moon sector (`#0b1410`) sweeps clockwise from 3 o'clock over the sun disk.
     - Dark $\to$ Light: Dark celestial moon disk revealed clockwise into a warm glowing sun with a radiant dawn beam travelling along the leading sweep edge.
     - Totality synchronization: at 360° totality (850ms), the backdrop veil reaches 100% opacity of the destination theme token (`#0b1410` for dark, `#f8fafc` for light), calling `commitTheme()` behind the solid veil with zero visible flash.
     - Exit fade: smooth 200ms dissolve from opacity 1.0 to 0 with subtle scale dispersion.
  3. `src/components/layout/ThemeToggle.jsx`:
     - Connected `disabled={isTransitioning}` and `aria-busy={isTransitioning}`.
     - Blocked click events during transition (`if (!isTransitioning) setTheme(next)`).
     - Preserved accessible `aria-label` and spring-based icon flip.
  4. `src/app/providers.jsx`:
     - Mounted `<ThemeTransitionOverlay />` inside the application's global provider hierarchy.
  5. `src/components/theme/__tests__/themeTransition.test.jsx`:
     - 27 comprehensive unit and integration tests covering:
       - 3 o'clock starting position $(cx + r, cy)$ and clockwise 360° sweep geometry.
       - 8 evenly spaced spokes at 12 o'clock, 1:30, 3 o'clock, 4:30, 6 o'clock, 7:30, 9 o'clock, 10:30.
       - Uniform spoke length and zero collision with sun circular outline.
       - Scaled durations reflecting 0.75x playback speed (1.3333x duration scaling).
       - `easeInOutCubic` monotonicity and bounds.
       - Store state transitions, rapid click protection, totality commit, and finish lifecycle.
       - Reverse `to-light` transition.
       - `prefers-reduced-motion` instant bypass.
       - `ThemeToggle` accessibility attributes (`aria-label`, `disabled`, `aria-busy`).
       - Full-screen overlay markup in both directions.
  6. Spokes & Speed Refinements:
     - Completely redesigned and rewrote the sun spokes so that all 8 spokes (12:00, 1:30, 3:00, 4:30, 6:00, 7:30, 9:00, 10:30) are bold, crisp, and prominent.
     - Resolved SVG filter zero-dimension bounding-box collapse bug: vertical lines (`x1 === x2`, width 0) and horizontal lines (`y1 === y2`, height 0) were previously hidden by browsers when `filterUnits="objectBoundingBox"` was evaluated per line. Fixed by specifying `filterUnits="userSpaceOnUse"` and applying `filter="url(#martitWarmGlow)"` to the parent `<g id="sunRays">` container.
     - Spoke length extended to a uniform 14.0 units (inner radius 26.0, outer radius 40.0, strokeWidth 3.6 with rounded caps).
     - Sun circular body calibrated to radius 19.0 (strokeWidth 3.2, outer edge 20.6), providing a clean 5.4-unit visual margin with guaranteed zero collision.
     - Calibrated subtle glow filter (`stdDeviation="1.0"`) and radial aura (`r="23"`) so diagonal rays are never washed out or blurred into background haze.
     - Maintained 0.75x playback speed consistently across the entire transition lifecycle (1.3333x duration scaling: INTRO 187ms, SWEEP 907ms, OUTRO 267ms, TOTAL 1361ms).
- **Verification Commands & Evidence:**
  - `npx vitest run src/components/theme/__tests__/themeTransition.test.jsx`: 27 tests passed, exit code 0.
  - `npm test`: 45 test files, 809 passed, 1 skipped (810 total), exit code 0.
  - `npm run test:server`: 17 test files, 380 passed, 1 skipped, exit code 0.
  - `node scripts/validate-migrations.mjs`: 15 migrations statically validated, exit code 0.
  - `npm run build`: Production client, SSR build, and static pre-rendering cleanly succeeded, exit code 0.



---

## Milestone 13: Fix False "Email Already Exists" Signup Error & Account Enumeration Protection

- **Date:** 2026-11-18
- **Status:** `VERIFIED`
- **Objective:** Fix false "Email already exists" error displayed on user registration attempts for new emails; properly categorize Supabase Auth error responses (weak password, rate limits, database triggers, network failures, explicit duplicate emails); handle account-enumeration-protected responses safely according to Supabase conventions.
- **Root Cause Analysis:**
  1. Overbroad 422 HTTP Status Mapping: In `src/services/authService.js`, line 141 checked:
     `if (msg.includes('already registered') || msg.includes('user already exists') || error.status === 422)`
     Supabase GoTrue returns HTTP 422 (Unprocessable Entity) for multiple non-duplicate conditions, including weak passwords (`code: 'weak_password'`), signups disabled (`code: 'signup_disabled'`), email logins disabled (`code: 'email_provider_disabled'`), and general validation rejections. Because of the blanket `error.status === 422` check, all of these failures were falsely reported as:
     *"An account with this email already exists. Please log in instead."*
  2. Sub-optimal Account Enumeration / Confirmation Handling: When Supabase identity enumeration protection is active, GoTrue returns an empty identities array (`data.user.identities: []`) with HTTP 200. The previous code immediately threw a duplicate error `409 DUPLICATE_EMAIL`. In reality, per Supabase conventions, an empty identities array indicates that the email is already registered (confirmed or unconfirmed) and should be handled safely as a confirmation-pending response prompting the user to check their email or log in directly, without leaking user existence to attackers or blocking legitimate users.
- **Implementation:**
  1. `src/services/authService.js`:
     - Removed overbroad `error.status === 422` mapping to `DUPLICATE_EMAIL`.
     - Granularly categorized error conditions:
       - `RATE_LIMITED` (`429`): Over email send rate limit or too many requests.
       - `DUPLICATE_EMAIL` (`409`): Strictly when `code === 'user_already_exists'`, `code === 'email_exists'`, or message explicitly indicates duplicate registration.
       - `WEAK_PASSWORD` (`422`): GoTrue password policy rejections (`weak_password`, message mentioning weak/short/common password).
       - `SIGNUP_DISABLED` (`403`): `signup_disabled` or `email_provider_disabled`.
       - `DATABASE_ERROR` (`500`): Postgres trigger/profile creation failures (`unexpected_failure`, `Database error saving new user`).
       - `NETWORK_ERROR` (`0`): Offline, DNS, CORS, or connection failures (`AuthRetryableFetchError`, `Failed to fetch`).
       - Other GoTrue errors preserve their real status and message (`SIGNUP_ERROR`).
     - Handled empty identities array (`data.user.identities: []`) per Supabase conventions: returns `{ session: null, authUser: data.user, needsConfirmation: true, role: cleanRole, isEnumerationProtected: true }` without falsely throwing duplicate error.
     - Provided explicit `emailRedirectTo: '${origin}/login'` option in `supabase.auth.signUp()`.
  2. `src/stores/authStore.js`:
     - Preserved `isEnumerationProtected` pass-through in `authStore.signup()`.
  3. `src/pages/auth/SignupPage.jsx`:
     - Stored `formErrorCode` to render targeted recovery actions in error alert (direct link to `/login` for duplicate emails, password complexity guidance for weak passwords, wait tip for rate limits).
     - Enhanced email verification view to support enumeration protection guidance with direct "Go to Log in" button.
  4. `src/pages/auth/__tests__/signupErrorHandling.test.js`:
     - 12 comprehensive unit and integration tests covering all 8 specified regression test cases plus UI integration:
       1. New email signup success with confirmation pending (`session: null`).
       2. New email signup success with active session (auto-confirm).
       3. Genuinely existing user signup returning duplicate email (code: `user_already_exists`).
       4. Genuinely existing user signup returning duplicate email (message: `already been registered`).
       5. Account-enumeration-protected response (`identities: []`) handled safely as confirmation-pending without false duplicate error.
       6. Weak password rejection (`422`) not mapped to duplicate email, throws `422 WEAK_PASSWORD`.
       7. Rate limit rejection (`429`) not mapped to duplicate email, throws `429 RATE_LIMITED`.
       8. Database trigger error (`500`) not mapped to duplicate email, throws `500 DATABASE_ERROR`.
       9. Network failure (`status: 0`) not mapped to duplicate email, throws `0 NETWORK_ERROR`.
       10. Signup disabled (`422`) not mapped to duplicate email, throws `403 SIGNUP_DISABLED`.
       11. Store state propagation of `isEnumerationProtected`.
       12. Verification notice view rendering with login action.
- **Verification Commands & Evidence:**
  - `npx vitest run src/pages/auth/__tests__/signupErrorHandling.test.js`: 12 passed (100%), exit code 0.
  - `npx vitest run src/pages/auth/__tests__/authPages.test.js src/stores/__tests__/authStore.test.js src/pages/auth/__tests__/resetPasswordFlow.test.js src/pages/admin/__tests__/adminAuth.test.jsx server/src/__tests__/authAndPermissions.test.js`: 105 passed, exit code 0.
  - `npm test`: 46 test files, 821 passed, 1 skipped (822 total), exit code 0.
  - `npm run test:server`: 17 test files, 380 passed, 1 skipped, exit code 0.
  - `git diff --check`: 0 issues, clean exit code 0.
  - `npm run build`: Production client, SSR build, and static pre-rendering cleanly succeeded, exit code 0.
