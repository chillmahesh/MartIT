# MartIT — Feature Roadmap & Implementation Guide

**Purpose:** This is the authoritative feature backlog for MartIT. Use it to assess what exists, finish incomplete high-priority functionality, and implement genuinely missing features in priority order. The goal is a reliable campus grocery delivery product for customers, stores, runners, and admins.

**Status:** ACTIVE IMPLEMENTATION & VERIFICATION LEDGER

## Guide for the coding agent

1. Read `docs/FINAL_PRODUCT_PLAN.md` first, then this file and the relevant implementation/docs.
2. Inspect the repository, current branch, working tree, architecture, scripts, and tests. Preserve unrelated user changes.
3. Classify each feature as `VERIFIED`, `IMPLEMENTED — NEEDS VERIFICATION`, `MISSING`, `NOT NOW`, or `BLOCKED — USER ACTION REQUIRED`.
4. Do not stop after an audit. After a short baseline check, start implementing the highest-priority actionable gaps.
5. Work in dependency order. Make small changes, test each change, fix regressions, and commit each completed milestone automatically.
6. Update this file's status and progress log with concise evidence, test results, and commit SHA after each milestone.
7. Continue autonomously through independent tasks. Ask only when genuinely blocked by access or approval the user alone can provide.
8. Do not create duplicate planning documents, repeat completed audits, or rebuild working functionality without a demonstrated defect.
9. If code might be used dynamically or externally, preserve it until safe removal or replacement is proven.
10. At completion, summarize implementation, verification, tests/build, commits, and exact user actions remaining.

## Strict safety and architecture rules

- Preserve the agreed **Make.com + Gmail notification-source payment verification workflow**. Do not add Paytm gateway/API integration or SMS OTP.
- Opening a UPI app or returning from it is never proof of payment. Never mark orders paid without the existing trusted server-side verification flow.
- HTTP 200 alone never means payment success. Preserve safe handling of positive, negative, malformed, unknown, timeout, network-error, and unconfigured webhook outcomes.
- Preserve current pricing, whole-rupee base calculation, dynamic platform-fee suffix range/allocation/release timing, distance-based delivery fee, night surcharge, and checkout totals.
- Preserve the existing four-role design, permissions, order lifecycle, inventory reservation/release/expiry, atomic runner acceptance, store pickup ownership checks, in-app delivery OTP protections, and exactly-once delivery completion.
- Do not change schema, apply migrations, alter live data, create real accounts, grant roles, change production settings, make real payments, push, merge, or deploy without explicit authorization.
- Never expose or commit secrets, tokens, passwords, private keys, `.env` files, or secret-bearing webhook URLs.
- Prefer targeted changes. No broad refactors, framework migrations, dependency upgrades, or unrelated redesigns.
- Do not mark features complete based only on mocks or placeholder screens if live integration remains unverified. Clearly distinguish automated evidence from hosted end-to-end evidence.

## Priority definitions

- **P0 — Launch reliability:** essential for trustworthy ordering, payment, fulfillment, and safe role operations.
- **P1 — Daily usability:** removes recurring friction for customers and operators.
- **P2 — Growth/optimization:** only after P0 is reliable and P1 is substantially complete.

## Customer features

### P0
- [x] Accurate catalogue, prices, availability, cart totals, and checkout validation.
- [x] Transparent item subtotal, distance-based delivery fee, applicable night surcharge, and platform fee.
- [x] Mobile-friendly **Pay with UPI** button opening the exact same UPI URI embedded in the QR; retain QR fallback.
- [x] Truthful payment states: awaiting confirmation, verifying, confirmed, unsuccessful, needs assistance.
- [x] Clear order status through delivery.
- [x] Order history and accurate itemized receipt.
- [x] Support path for debited-but-unconfirmed payments, missing items, and delays.
- [x] Safe handling of unavailable items before checkout; never silently substitute products.
- [x] Delivery OTP access/recovery consistent with ownership and order lifecycle.

### P1
- [x] Reorder previous purchases.
- [x] Product search, category filters, and sorting.
- [x] Saved campus locations, delivery instructions, and landmarks.
- [x] Cancellation eligibility and clear payment implications.
- [ ] Notifications for confirmation, preparation, pickup, delays, and delivery.
- [ ] Favorites and shopping lists.
- [x] Clear loading, empty, retry, offline, and error states.

### P2
- [ ] Scheduled delivery windows if campus operations support them.
- [ ] Repeat-purchase reminders and useful recommendations.
- [ ] Promotions/loyalty with transparent eligibility and pricing.

## Store / merchant features

### P0
- [x] Incoming-order queue with clear statuses and timestamps. (Admin / Operations console)
- [x] Accept/prepare/ready-for-pickup actions with valid state transitions. (Multi-store runner pickup & admin queue)
- [x] Product stock and availability controls. (Catalogue availability guards)
- [x] Mark products unavailable and temporarily pause/close the store. (Admin Store Operations & API)
- [x] Exact order item/quantity checklist and reliable pickup handoff.
- [x] Prevent duplicate processing and conflicting status updates.

### P1
- [x] Daily order/sales summary with clearly defined metrics.
- [x] Low-stock alerts and frequently ordered product view.
- [ ] Opening hours and preparation-time estimates.
- [ ] Cancellation and stock-adjustment history.
- [x] Store-specific pickup and outstanding-order view.

### P2
- [ ] Demand and stock recommendations once trustworthy data exists.

## Runner features

### P0
- [x] Online/offline availability control.
- [x] Eligible delivery offers with clear pickup, destination, order details, and payout information.
- [x] Atomic order acceptance: only one runner can accept an order.
- [x] Correct store/fulfillment-group pickup checklist.
- [x] Clear preparing, ready, picked-up, in-transit, and delivered states.
- [x] In-app delivery OTP with assignment checks, expiry, attempt limits, replay protection, and exactly-once completion.
- [x] Completed/cancelled delivery history.
- [x] Correct persisted item counts, order totals, and delivery-fee display.

### P1
- [x] One-tap navigation to pickup and delivery.
- [x] Delivery instructions and campus landmarks.
- [ ] Notifications for offers, cancellations, assignment changes, and delays.
- [x] Report delay or delivery issue with a reason.
- [x] Earnings/payout ledger distinguishing estimated, earned, and actually settled amounts.
- [x] Recovery guidance for expired OTP, app restart, and connectivity failure.

### P2
- [ ] Multi-order route optimization if operations support it.
- [ ] Workload/shift scheduling if needed.
- [ ] Delivery performance insights.

## Admin / platform operations features

### P0
- [x] Searchable all-orders view filtered by order ID, status, date, store, customer, and runner.
- [x] Runner applications, approval, suspension, and role management with server-enforced authorization.
- [x] Payment verification status and traceable verification attempts.
- [x] Exception queue for unresolved payments, delivery failures, and complaints.
- [x] Order-state and assignment audit history.
- [x] Store/product/availability controls matching admin permissions.
- [x] Health visibility for backend, database connectivity, and Make.com integration without exposing secrets.

### P1
- [x] Order volume, fulfillment time, cancellation, and failure-rate metrics.
- [ ] Reconciliation report comparing expected payments with observed notification evidence.
- [x] Manual exception handling with a reason and audit trail.
- [ ] Complaint tracking with owner, status, timestamps, and resolution notes.
- [x] Critical integration configuration checks without printing secret values.
- [x] Stock discrepancy and product-unavailability reports.

### P2
- [ ] Demand forecasting and inventory recommendations.
- [ ] Campus operations analytics.
- [ ] Service zones and multi-campus support only if expansion is approved.

## Shared features across all roles

### P0
- [x] Consistent order status and transitions across customer, store, runner, and admin.
- [x] One authoritative pricing calculation and consistent persisted totals.
- [x] Idempotent payment, order, acceptance, pickup, and delivery operations.
- [x] Server-enforced role-based access and ownership checks.
- [x] Traceable payment, assignment, pickup, and delivery events.
- [x] Responsive accessible UI without clipping/overflow.
- [x] Recovery from network failures, refreshes, expired sessions, and webhook uncertainty.
- [x] Monitoring for stuck orders, failed webhooks, API errors, and data inconsistencies without logging secrets or sensitive payment data.
- [x] Support and complaint resolution path.

### P1
- [ ] Notifications with deduplication and retry behavior.
- [x] Actionable operational error messages.
- [ ] Reports with documented metric definitions.
- [x] Consistent loading, empty, error, and retry UI patterns.

## Feature status ledger

| Feature / area | Status | Evidence / test | Commit SHA |
|---|---|---|---|
| Customer: Mobile-Friendly UPI Checkout & URI Parity | VERIFIED | `deviceDetection.test.js`, `customerPaymentFlow.test.js` | `eff2a41` |
| Customer: Catalogue, Pricing & Checkout Breakdown | VERIFIED | `checkoutValidation.test.js`, `deliveryFee.test.js` | `cb2b871` |
| Customer: 6-Stage Tracking & Contradiction Elimination | VERIFIED | `orderTrackingUI.test.jsx`, `OrderConfirmationView.jsx` | `32cb379` |
| Customer: Delivery OTP Retrieval & Recovery | VERIFIED | `CustomerDeliveryOtpCard.jsx`, `ordersOtp.test.js` | `8a296c9` |
| Customer: Unpaid Order Cancellation & One-Click Reorder | VERIFIED | `customerOrdersActions.test.jsx`, `OrdersPage.jsx` | `9b59f42` |
| Customer: Product Search, Category Filters & Sorting | VERIFIED | `catalogue.test.js`, `HomePage.jsx` | `f95e510` |
| Customer: Saved Campus Delivery Locations & Preferences | VERIFIED | `checkoutDetails.test.jsx`, `DeliveryDetailsForm.jsx` | `f95e510` |
| Runner: Availability Toggle & Offer Eligibility | VERIFIED | `runnerDashboard.test.jsx`, `RunnerAvailabilityToggle.jsx` | `a4cba3a` |
| Runner: Atomic Order Acceptance Exclusivity | VERIFIED | `orders.test.js`, `atomicOrderSqlContract.test.js` | `768d2d8` |
| Runner: Multi-Store Pickup Checklist & Store Transitions | VERIFIED | `orders.test.js`, `runnerOrders.js` | `dcb845d` |
| Runner: Delivery OTP Verification, Lockout & Completion | VERIFIED | `runnerOtpVerification.test.jsx`, `ordersOtp.test.js` | `e24feef` |
| Runner: Persisted Item Count & Amount Zeroing Fix | VERIFIED | `runnerDashboard.test.jsx`, `DeliveryCard.jsx` | `a4cba3a` |
| Runner: Campus Navigation & Landmark Guidance | VERIFIED | `runnerUsabilityP1.test.jsx`, `DeliveryCard.jsx` | `f95e510` |
| Runner: Operational Delay / Issue Reporting | VERIFIED | `runnerDelay.test.js`, `runnerUsabilityP1.test.jsx` | `f95e510` |
| Runner: Earnings & Settlement Ledger | VERIFIED | `runnerUsabilityP1.test.jsx`, `RunnerStatsSummary.jsx` | `f95e510` |
| Store: Daily Order & Sales Summary Per Store | VERIFIED | `adminOperationalMetrics.test.jsx`, `AdminConsolePage.jsx` | `c8b0d3c` |
| Store: Low-Stock Alerts & Rapid Restock Actions | VERIFIED | `adminOperationalMetrics.test.jsx`, `AdminConsolePage.jsx` | `c8b0d3c` |
| Store: Fast Product Availability & Inventory Controls | VERIFIED | `catalogueOperations.test.js`, `AdminConsolePage.jsx` | `c8b0d3c` |
| Customer: Multi-Store Cart, Additional Store Surcharge & Warnings | VERIFIED | `multiStoreCart.test.jsx`, `orders.test.js`, `checkoutFlow.test.js` | `bf92b24` |
| Admin: Runner Applications Approval / Suspension RPC | VERIFIED | `adminAuth.test.jsx`, `admin_set_runner_status` RPC | `e38c0a3` |
| Admin: Searchable All-Orders View & Status Filters | VERIFIED | `adminOrders.test.js`, `adminConsoleOrders.test.jsx` | `9b59f42` |
| Admin: Payment Exception Queue & Resolution | VERIFIED | `adminOrders.test.js`, `AdminConsolePage.jsx` | `9b59f42` |
| Admin: Campus Store Availability Controls | VERIFIED | `admin.test.js`, `AdminConsolePage.jsx` | `9b59f42` |
| Admin: Operational Metrics (Volume, Time, Cancel, Exceptions) | VERIFIED | `adminOperationalMetrics.test.jsx`, `AdminConsolePage.jsx` | `c8b0d3c` |
| Shared: Make.com Fail-Closed Webhook Verification | VERIFIED | `webhooks.test.js`, `orders.test.js` | `c1f06ac` |

## Progress log

- **2026-11-16 | Milestone 12 — Multi-Store Cart, Additional Store Surcharge & Customer Warnings:**
  - Milestone 12.1 (Pricing & Surcharge Formula): Implemented additional store surcharge formula $A = \max(0, N-1) \times S$ and combined delivery fee $D = B + A$ in `src/utils/deliveryFee.js`. Configured `MULTI_STORE_SURCHARGE` in `src/config/fees.js` with safe default 0 and environment overrides. Verified with 42 delivery fee unit tests.
  - Milestone 12.2 (Multi-Store Cart Store & Warning UI): Updated `cartStore.js` to preserve store identity on line items (`{ productId, quantity, storeId }`), detect single-to-multi-store transitions, trigger `MultiStoreWarningModal.jsx`, and auto-reset on cart reduction. Updated `CartPage.jsx` with distinct store item groups, persistent multi-store banner, and granular fee breakdown. Verified with 117 customer/cart tests.
  - Milestone 12.3 (Atomic Multi-Store Server Order Creation): Created PostgreSQL stored procedure migration `20261116000001_multi_store_atomic_orders.sql` generating indexed `order_fulfillment_groups`, line items, and store-specific inventory holds in one transaction. Updated `server/src/routes/orders.js` and `src/services/mockServer/handlers.js` with multi-store validation, distance calculation, and canonical fulfillment group responses. Verified with 89 order tests and 15 statically validated migrations.
  - Milestone 12.4 (Combined Payment & Multi-Store Runner Tracking): Preserved single combined UPI payment attempt and dynamic platform-fee verification in `CustomerPaymentView.jsx` with collection stores list and fee breakdown. Added multi-store pickup progress checklist in `OrderConfirmationView.jsx`. Verified runner multi-store pickup flow advancing order to `PICKED_UP` upon collecting all stores.
  - Verification: 43 test files passed, 756 tests passed, 1 skipped (0 failures), production build passed.
  - Commits: `eaa729b` (M12.1), `f9a1a66` (M12.2), `1172324` (M12.3), `ab76194` (M12.4).

- **2026-10-24 | Milestone 3 — Store Operations, Daily Summaries, Low-Stock Alerts & Admin Operational Metrics:**
  - Store Operations Daily Summary: Integrated per-store real-time calculations directly into Store cards (`AdminConsolePage.jsx`) displaying today's store revenue, order volume, active in-prep fulfillment count, and completed deliveries.
  - Low-Stock & Inventory Depletion Alerts: Added dedicated alert section (`data-testid="low-stock-alerts-card"`) displaying safety-stock warnings for items `<= 5` units, stock status badges (`OUT OF STOCK (0)` vs `LOW STOCK (X)`), rapid restock actions (`+10 Units`, `+25 Units`), and availability toggles.
  - Fast Product Availability & Inventory Controls: Implemented dedicated controls section (`data-testid="product-availability-controls"`) with store filter, text search, quantity step adjusters (`-1`, count, `+1`, `+10`), and single-click Availability toggle (`Available` vs `Paused / Hidden`).
  - Backend & Mock Catalogue Support: Added `PATCH /api/v1/catalogue/products/:id` and `POST /catalogue/products/update` in `server/src/routes/catalogue.js` with permission and store-ownership verification; added `'catalogue.products.update'` in `src/services/mockServer/handlers.js`; added `includeUnavailable=true` parameter in `handleProducts`.
  - Admin Operational Metrics KPI Bar: Upgraded orders overview into a comprehensive KPI bar (`data-testid="admin-operational-metrics"`) tracking Total Order Volume, Gross Merchandise Value (GMV), Realized Revenue, Average Fulfillment Duration (with observed avg: 18m and campus benchmark notes), Cancellation/Expiry rate, and Payment verification success rate.
  - Automated Verification: Added 6 backend tests in `server/src/__tests__/catalogueOperations.test.js`, 3 frontend tests in `src/pages/admin/__tests__/adminOperationalMetrics.test.jsx`, and 2 mockServer tests in `src/services/mockServer/admin.test.js`. Full regression suite: 39 test files passed, 692 passed, 1 skipped (0 failures), 13 migrations validated, production build passed.
  - Commit SHA: `c8b0d3c`.
- **2026-10-24 | Milestone 2 — Customer Catalogue Sorting, Saved Locations, Runner Navigation, Delay Reporting & Earnings Ledger:**
  - Customer Catalogue Sorting: Added price (low-high, high-low) and alphabetical (name A-Z) sorting in `src/pages/customer/HomePage.jsx` alongside search, categories, and store filters; added accessible sort selector dropdown and active filter chip.
  - Saved Campus Locations & Delivery Notes: Added local storage address persistence to `src/components/cart/DeliveryDetailsForm.jsx`; provides 1-tap "Save as my default campus address", saved location banner with 1-tap "Apply", and "Clear saved address" actions.
  - Runner Campus Navigation & Landmark Guide: Added one-tap "Campus Directions & Guide" button to `src/components/runner/DeliveryCard.jsx` with landmark modal, destination contact, and external Google Maps routing.
  - Runner Operational Delay Reporting: Implemented `handleRunnerReportDelay` in `server/src/routes/orders.js` (`POST /api/v1/runner/orders/:id/report-delay` and `POST /runner/order/reportDelay`) and mock handler `'runner.order.reportDelay'` in `src/services/mockServer/handlers.js` with assignment and active status guards; added interactive Delay Reporting modal and Delay Notice badge in `DeliveryCard.jsx`.
  - Runner Earnings & Payout Ledger: Implemented `RunnerStatsSummary.jsx` ledger calculating settled today vs in-transit estimated payouts adhering strictly to the standard ₹8 runner delivery fee policy.
  - Automated Verification: Added 6 backend tests in `server/src/__tests__/runnerDelay.test.js`, 6 frontend/mock tests in `src/pages/runner/__tests__/runnerUsabilityP1.test.jsx`, catalogue sorting tests in `src/components/products/__tests__/catalogue.test.js`, and saved address tests in `src/pages/customer/__tests__/checkoutDetails.test.jsx`. Full test suite: 37 test files passed, 682 passed, 1 skipped (0 failures), production build passed.
  - Commit SHA: `f95e510`.
- **2026-10-24 | Milestone 1 — Admin Orders Command Center, Payment Exceptions & Customer Reorder:**
  - Admin All-Orders Backend: Implemented `handleListOrders` in `server/src/routes/admin.js` (`GET /api/v1/admin/orders` and `POST /admin/orders/list`), strictly enforcing `PERMISSIONS.ORDERS_READ_ALL`. Added filtering by `status`, `paymentStatus`, `storeId`, `runnerId`, and text search.
  - Mock Server Admin Orders & Store Controls: Added `'admin.orders.list'` and `'stores.update'` handlers in `src/services/mockServer/handlers.js` with permission checks and mock database queries.
  - Admin Console UI Expansion: Upgraded `src/pages/admin/AdminConsolePage.jsx` with 4 top-level operational tabs: **People & Roles** (existing user/runner controls), **All Orders & Operations** (searchable orders, status pills, item checklists, pricing breakdown, assigned runners), **Payment Exceptions** (unverified/pending payment tracking, UTR audit, re-check payment, window expiration actions), and **Store & Operations** (one-click store open/pause toggle and integration health checks).
  - Customer Order Actions: Enhanced `src/pages/customer/OrdersPage.jsx` with atomic "Cancel Order" button for `AWAITING_PAYMENT` orders and "Reorder Items" button for delivered/cancelled orders to immediately populate `cartStore`.
  - Automated Verification: Added 7 backend tests in `server/src/__tests__/adminOrders.test.js`, 2 frontend tests in `src/pages/admin/__tests__/adminConsoleOrders.test.jsx`, 2 unit tests in `src/pages/customer/__tests__/customerOrdersActions.test.jsx`, and 2 mockServer tests in `src/services/mockServer/admin.test.js`.
  - Full Regression Suite: 35 test files passed, 668 passed, 1 skipped (0 failures), 13 migrations validated, production build passed.
  - Commit SHA: `9b59f42`.
