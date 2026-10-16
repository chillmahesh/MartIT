# MartIT — Implementation Roadmap & Repository Audit

> **Document version:** 1.2.0  
> **Last updated:** 2026-10-10  
> **Repository state:** `feat/backend-foundation` branch, working-tree clean, 161/161 vitest tests passing (136 client/mock + 25 server), production SSR build passing.  
> **Companion Document:** [`docs/backend-architecture.md`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/docs/backend-architecture.md) (Confirmed Multi-Store Backend Specification)

---

## 1. Executive Summary & Audit Baseline

MartIT is a smart campus grocery delivery platform built with **React 19**, **Vite**, **React Router v7/v8 data router**, **TanStack Query v5**, **Zustand v5**, and **Tailwind CSS v4**.

An end-to-end repository audit was executed prior to implementing code changes. Below is the evidence-based assessment of all system capabilities.

### Evidence Classification Legend
1. **Implemented and tested:** Functional logic covered by automated unit/integration tests in the repository.
2. **Implemented only with mock data:** UI & domain services functional in-browser using mock server (`src/services/mockServer/`) and sample datasets.
3. **Partially implemented:** Slices of functionality built; remaining flows or edge-cases incomplete.
4. **Placeholder or not implemented:** Placeholder page (`PhasePlaceholder`), empty directory, or stubs.
5. **Architectural Specification Defined:** Production contract, relational schema, and failure handling formally defined in architecture documents.

---

## 2. Capability Audit

| Area | Feature / Module | Status | Primary Code References | Notes & Limitations |
|---|---|---|---|---|
| **Customer** | Catalogue Browsing | Implemented only with mock data | [`src/pages/customer/HomePage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/HomePage.jsx), [`src/components/products/ProductGrid.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/products/ProductGrid.jsx) | Refactored in Milestone 1 to product-first discovery across all campus stores without store selectors. |
| **Customer** | Catalogue Search | Implemented only with mock data | [`src/components/products/CatalogueSearch.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/products/CatalogueSearch.jsx) | In-memory search by name, pack, category across all stores. Tested in `catalogue.test.js`. |
| **Customer** | Category Browsing | Implemented only with mock data | [`src/components/products/CategoryPills.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/products/CategoryPills.jsx), [`src/mocks/categories.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/mocks/categories.js) | Dynamic category counts across comprehensive catalogue. Tested in `catalogue.test.js`. |
| **Customer** | Product Card & Stepper | Implemented only with mock data | [`src/components/products/ProductCard.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/products/ProductCard.jsx) | Non-blocking store badge, stock limits, quantity stepper connected to `cartStore`. |
| **Customer** | Cart Management | Implemented only with mock data | [`src/stores/cartStore.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/stores/cartStore.js), [`src/pages/customer/CartPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/CartPage.jsx) | Single-store cart active in UI; multi-store cart backend model specified in `docs/backend-architecture.md`. |
| **Customer** | Delivery Location Selector | Implemented only with mock data | [`src/components/cart/DeliveryLocationSelector.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/cart/DeliveryLocationSelector.jsx), [`src/mocks/campus.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/mocks/campus.js) | Grouped campus delivery spots (Hostels, Academic, Residential). |
| **Customer** | Delivery Fee Engine | **Implemented and tested** | [`src/utils/deliveryFee.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/utils/deliveryFee.js), [`src/config/fees.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/config/fees.js) | 33 vitest tests. Multi-stop route fee application confirmed in `docs/fee-policy.md`. |
| **Customer** | Dynamic Platform Fee | **Implemented and tested** | [`src/services/mockServer/platformFeeAllocator.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/mockServer/platformFeeAllocator.js) | 17 vitest tests in `platformFeeAllocator.test.js`. Smallest available paise (₹0.01–₹0.99), 2-min window, 5-min cooldown. |
| **Customer** | Order Creation & Repricing | **Implemented and tested** | [`src/services/mockServer/handlers.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/mockServer/handlers.js), [`src/services/orderService.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/orderService.js) | Single-store order creation tested. Multi-store parent/group transactional schema specified in `docs/backend-architecture.md`. |
| **Customer** | UPI Payment & Verification Screen | **Implemented and tested** | [`src/pages/customer/PaymentPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/PaymentPage.jsx), [`src/components/payment/CustomerPaymentView.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/payment/CustomerPaymentView.jsx), [`src/utils/upi.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/utils/upi.js) | 20 vitest tests in `customerPaymentFlow.test.js`. Real UPI QR, authoritative expiry timer, inconclusive feedback. |
| **Customer** | Order Confirmation | Implemented only with mock data | [`src/pages/customer/OrderConfirmationPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/OrderConfirmationPage.jsx), [`src/components/cart/OrderConfirmationView.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/cart/OrderConfirmationView.jsx) | Authoritative pricing snapshot view. Tested in `checkoutFlow.test.js`. |
| **Customer** | Orders History & Tracking | Placeholder or not implemented | [`src/pages/customer/OrdersPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/OrdersPage.jsx), [`src/components/orders/`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/orders) | Placeholder (`PhasePlaceholder` Phase 4). Component folder empty. |
| **Customer** | Profile & Saved Locations | Placeholder or not implemented | [`src/pages/customer/ProfilePage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/ProfilePage.jsx) | Placeholder (`PhasePlaceholder` Phase 4). |
| **Auth** | Demo Login | Implemented only with mock data | [`src/pages/auth/LoginPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/auth/LoginPage.jsx), [`src/stores/authStore.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/stores/authStore.js) | Sample accounts for customer, runner, super_admin. LocalStorage token persistence. |
| **Auth** | Registration / Sign Up | Placeholder or not implemented | [`src/pages/auth/SignupPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/auth/SignupPage.jsx) | Placeholder (`PhasePlaceholder` Phase 3). |
| **Auth** | Role-Based Access Control | **Implemented and tested** | [`src/utils/permissions.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/utils/permissions.js), [`src/app/RouteGuards.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/app/RouteGuards.jsx) | Route guards + server-side permission enforcement. Tested in `admin.test.js`. |
| **Runner** | Runner Dashboard | Placeholder or not implemented | [`src/pages/runner/RunnerDashboardPage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/runner/RunnerDashboardPage.jsx), [`src/components/runner/`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/runner) | Placeholder (`PhasePlaceholder` Phase 5). Component folder empty. |
| **Runner** | Order Queue & Atomic Accept | Placeholder or not implemented | None | Planned for Phase 5. Single runner assignment to parent order. |
| **Runner** | Pickup & OTP Handover | Partially implemented | [`src/components/ui/OtpInput.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/ui/OtpInput.jsx) | OtpInput UI primitive exists; multi-group pickup tracking and rate-limited OTP handover specified in `docs/backend-architecture.md`. |
| **Runner** | Payout Policy | Needs a product decision | [`src/config/fees.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/config/fees.js), [`src/utils/deliveryFee.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/utils/deliveryFee.js) | Only ₹10 -> ₹8 split defined. ₹15–₹35 tiers are `null`. |
| **Admin** | People & Roles Console | **Implemented and tested** | [`src/pages/admin/AdminConsolePage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/admin/AdminConsolePage.jsx), [`src/services/adminService.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/adminService.js) | 8 tests in `admin.test.js`. Approves/suspends runners, assigns roles, prevents self-demotion. |
| **Admin** | Store & Inventory Management | Placeholder or not implemented | None | Admin console only manages users & roles currently. |
| **Infrastructure** | API Client Transport | Partially implemented | [`src/services/api.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/api.js) | Switches between in-browser mock and `VITE_API_BASE_URL`. |
| **Infrastructure** | Routing / Distance | Implemented only with mock data | [`src/services/mockServer/routing.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/mockServer/routing.js) | Straight-line haversine distance in mock. Real multi-stop road/walking route engine specified in `docs/backend-architecture.md`. |
| **Infrastructure** | Payment Reconciliation | Implemented only with mock data | [`src/services/mockServer/verificationAdapter.js`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/services/mockServer/verificationAdapter.js) | Mock adapter simulating Make.com evidence. Real webhook listener contract specified in `docs/backend-architecture.md`. |

---

## 3. Store Discovery & Confirmed Multi-Store Fulfillment Policy

### Milestone 1 Resolution: Product-First Shopping (Completed)
- Mandatory store selection headers and dropdowns have been removed from the customer catalogue.
- Customers browse, search, and filter the comprehensive campus catalogue across all participating stores simultaneously.
- Individual [`ProductCard`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/products/ProductCard.jsx) components clearly display store fulfillment identity as non-blocking informational metadata.
- Product availability, per-store stock limits, and store-closed indicators are evaluated at the individual product level.

### Confirmed Multi-Store Architecture Policy (2026-10-10)
The product owner has confirmed the following multi-store policies, detailed fully in [`docs/backend-architecture.md`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/docs/backend-architecture.md):
1. **Multi-Store Basket in Single Checkout:** Customers can purchase products originating from multiple distinct campus stores in a single checkout session.
2. **Parent Order & Store Fulfillment Groups:**
   - All items belong to a single parent order (`orders`).
   - Items for each participating store are partitioned into distinct store fulfillment groups (`order_fulfillment_groups`).
   - The parent order owns the combined financial snapshot, payment attempt, and lifecycle.
   - Fulfillment groups preserve store IDs, pickup locations, item snapshots, inventory reservations, pickup progress, and group status (`PENDING` $\to$ `READY_FOR_PICKUP` $\to$ `PICKED_UP`).
3. **Single Runner per Parent Order:** Exactly one runner is assigned to the parent order. The runner visits all participating stores, collects every fulfillment group, and delivers the combined order to the customer.
4. **Single Payable Total & Payment Transaction:**
   - One customer checkout, one combined payable total, and one customer payment transaction.
   - Parent order total = authoritative sum of all item subtotals + one combined delivery fee + one dynamic platform fee.
   - Dynamic platform fee (₹0.01–₹0.99) is allocated once for the parent payment, with atomic reservation and existing 2-min window / 5-min cooldown rules.
5. **Combined Delivery Fee on Multi-Store Route (Flat ₹10 MVP Policy):**
   - Flat ₹10 delivery is the MVP policy for all new eligible orders.
   - Distance-based delivery pricing and route optimization are deferred beyond MVP.
   - Exactly one delivery fee applies per parent order (never charged per store or fulfillment group).
   - Supported delivery-area restrictions still apply: destinations exceeding 5 km remain blocked.
   - The existing dynamic platform fee (₹0.01–₹0.99) and runner payout rule (₹8 payout for ₹10 delivery fee) are unchanged.
6. **Delivery Handover Invariants:**
   - The parent order cannot advance to `OUT_FOR_DELIVERY` until **all** store fulfillment groups are confirmed `PICKED_UP`.
   - Handover requires server-authoritative, rate-limited OTP verification (max 3 failed attempts, 5-minute lockout).

### Safety & Rollout Strategy
- **Baseline Protection:** The existing single-store checkout and in-browser mock server remain fully operational while new backend services are developed.
- **Rollout Boundary:** Multi-store checkout will remain gated behind `FEATURE_MULTI_STORE_CHECKOUT=false` until routing, inventory locking, runner collection, and payment webhook reconciliation are verified end-to-end against a real Supabase PostgreSQL instance.

---

## 4. Implementation Milestones

### Milestone 1: Product-First Shopping (Completed & Verified)
- [x] Complete repository audit and roadmap ([`docs/implementation-roadmap.md`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/docs/implementation-roadmap.md)).
- [x] Remove mandatory `<StoreHeader>` and `<StoreSelector>` from customer catalogue ([`src/pages/customer/HomePage.jsx`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/pages/customer/HomePage.jsx)).
- [x] Enable product discovery across all stores via `useProducts()` without mandatory store filtering.
- [x] Ensure category pills and search filter the comprehensive campus product set across all stores.
- [x] Display store fulfillment identity as non-blocking product metadata on [`ProductCard`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/src/components/products/ProductCard.jsx).
- [x] Preserve product availability, stock limits, and closed-store indicators per product.
- [x] Maintain single-store cart integrity with clear switch-store confirmation dialog.
- [x] Ensure checkout seamlessly resolves fulfillment store identity from product metadata without requiring prior store selection.
- [x] Add comprehensive vitest suite covering product-first browsing, search, stock validation, and checkout.
- [x] Full test suite verified: **136 passed** across 8 test suites (0 failed).
- [x] Production SSR and client builds verified (`npm run build`).

### Milestone 2: Customer Order History & Real-Time Simulation (Phase 4)
- [ ] Implement `src/pages/customer/OrdersPage.jsx` displaying past customer orders.
- [ ] Connect order tracking view with state transitions (`AWAITING_PAYMENT` -> `CONFIRMED` -> `PREPARING` -> `OUT_FOR_DELIVERY` -> `DELIVERED`).
- [ ] Implement `src/pages/customer/ProfilePage.jsx` for managing saved delivery spots.

### Milestone 3: Real Authentication & Profile (Phase 3)
- [ ] Implement production email/password login and registration forms (`LoginPage.jsx`, `SignupPage.jsx`).
- [ ] Session management with secure token refresh via Supabase Auth.
- [ ] Password validation and college email domain verification.

### Milestone 4: Runner App & Delivery Handover (Phase 5)
- [ ] Implement `src/pages/runner/RunnerDashboardPage.jsx`.
- [ ] Implement active order queue with atomic accept lock (first runner to accept gets parent order).
- [ ] Implement multi-store pickup progress checklist (confirming pickup per store group).
- [ ] Implement rate-limited OTP verification for customer handover (`POST /runner/orders/:id/verify-handover`).
- [ ] Establish runner payout policy for distance bands > 1 km.

### Milestone 5: Multi-Store Backend Architecture, Persistent Database & Authoritative API
- [x] **Milestone 5.0: Architecture & Relational Specification:** Comprehensive specification documented in [`docs/backend-architecture.md`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/docs/backend-architecture.md).
- [x] **Milestone 5.1: Supabase PostgreSQL Schema & Relational Models (Implemented):**
  - Created migrations in `supabase/migrations/`:
    - `20261010000001_initial_schema.sql` (core entities: `profiles`, `user_roles`, `stores`, `locations`, `categories`, `products`, `orders`, `order_fulfillment_groups`, `order_items`, `inventory_reservations`, `platform_fee_reservations`, `payment_records`, `audit_logs`).
    - `20261010000002_platform_fee_functions.sql` (seed 99 platform fee slots, atomic allocation function with `FOR UPDATE SKIP LOCKED`).
    - `20261010000003_row_level_security.sql` (RLS policies for least-privilege customer, runner, store owner, and admin access).
    - `supabase/seed.sql` (sample campus stores, locations, and catalogue products).
    - Validation script `scripts/validate-migrations.mjs` verifying syntax, structure, and monetary numeric types.
- [x] **Milestone 5.2A: Render Express API Foundation (Implemented):**
  - Implemented Node.js/Express backend in `server/` with:
    - Environment validation via Zod (`server/src/config/env.js`).
    - Security headers (`helmet`), CORS configuration, request logging without sensitive data, rate limiting (`express-rate-limit`).
    - Health and readiness probes (`/healthz`, `/readyz`).
    - Supabase Auth middleware with role resolution and permission enforcement (`server/src/middleware/auth.js`).
    - User profile retrieval (`GET /api/v1/auth/me`, `POST /auth/me`).
    - Catalogue reads (`GET /api/v1/catalogue/products`, `GET /api/v1/catalogue/categories`).
    - Store and location reads (`GET /api/v1/stores`, `GET /api/v1/locations`).
    - Delivery quote endpoint with authoritative fee calculation (`POST /api/v1/delivery/quote`).
    - Authenticated customer order history and order lookup (`GET /api/v1/orders`, `GET /api/v1/orders/:id`, `POST /orders/get`).
    - Admin user listing, runner approval, and role assignment endpoints (`/api/v1/admin/*`).
    - Automated unit and integration test suite: 25 tests passing in Vitest.
    - Render deployment blueprint (`render.yaml`).
- [ ] **Milestone 5.2B: Multi-Stop Routing & Auditable Fee Engine (Deferred beyond MVP):**
  - Flat ₹10 delivery is the authoritative MVP policy; distance-based delivery pricing and route optimization are deferred beyond MVP.
  - Future phase: connect authoritative routing service (Mapbox Directions / OpenRouteService walking profile) for runner navigation and route visualization.
  - Supported service radius restrictions (up to 5 km) remain enforced.
  - Persist route distance, stop sequence, routing provider, and fee policy version with each order.
- [ ] **Milestone 5.3: Server-Authoritative Multi-Store Order Creation:**
  - Implement `POST /api/v1/orders/create-multistore` in Render Node.js/Express.
  - Enforce idempotency via unique `idempotency_key`.
  - Transactional inventory lock across all participating stores (`SELECT ... FOR UPDATE`); abort transaction if any store item is insufficient.
  - Atomic dynamic platform fee reservation (₹0.01–₹0.99) with 2-min window / 5-min cooldown.
  - Atomic insertion of parent order and store fulfillment groups.
- [ ] **Milestone 5.4: Single Runner Multi-Group Pickup Lifecycle & Delivery OTP Handover:**
  - Implement `POST /api/v1/runner/orders/:id/pickup-group` updating store fulfillment group status.
  - Enforce delivery gatekeeper invariant: parent order cannot transition to `OUT_FOR_DELIVERY` until all associated store groups are `PICKED_UP`.
  - Implement `POST /api/v1/runner/orders/:id/verify-handover` with hashed OTP check and rate limiting (max 3 failed attempts).
- [ ] **Milestone 5.5: Multi-Store Failure Handling & Automated Concurrency Tests:**
  - Automated tests covering the 8 failure modes specified in `docs/backend-architecture.md`:
    1. Store closing during checkout (atomic rollback).
    2. Partial stock shortage across stores (atomic multi-store rollback, zero partial holds).
    3. Route calculation failure or route $>5$ km (fail-closed, checkout blocked).
    4. Runner dropout mid-pickup (order re-queued, already-picked-up groups preserved).
    5. Store pickup failure (group marked failed, partial refund compensation).
    6. Payment success followed by fulfillment failure (authoritative refund ledger).
    7. Duplicate checkout requests / retries (idempotency verified).
    8. Expired payment verification window (order expired, fee entered cooldown).
- [ ] **Milestone 5.6: Frontend Multi-Store Cart & Checkout Integration:**
  - Update `src/stores/cartStore.js` to allow items from multiple stores when `FEATURE_MULTI_STORE_CHECKOUT=true`.
  - Update `CartPage.jsx` to render multi-store group subtotals and single combined delivery fee.
  - Enable multi-store checkout in production only after milestones 5.1–5.5 pass against live Supabase PostgreSQL.

---

## 5. Confirmed Decisions & Open Items

1. **Multi-Store Orders vs Single-Store Cart:** **CONFIRMED (2026-10-10)**. Multi-store checkout confirmed with single parent order, store fulfillment groups, single runner multi-stop pickup, combined route delivery fee, and single customer payment. Detailed architecture in [`docs/backend-architecture.md`](file:///c:/Users/omkar/OneDrive/Desktop/MyProjects/MartIT/docs/backend-architecture.md).
2. **Runner Payout Schedule:** Values for ₹15 (0.5–1 km), ₹20 (1–2 km), ₹25 (2–3 km), ₹30 (3–4 km), ₹35 (4–5 km) delivery fee bands remain provisional (`null`). Internal ledger only, not shown to customers.
3. **Road Routing Provider:** Selection of road/walking routing service (Mapbox Directions API vs OpenRouteService). Must use walking/campus profile with fail-closed error handling.

---

## 6. Subsystem Status & Rollout Readiness

To ensure transparency and deployment safety, MartIT explicitly distinguishes between three statuses:
- **Implemented in repository:** The code exists and is committed in the codebase.
- **Tested against a real database:** The schema and transactional logic have been executed and tested against an active Supabase PostgreSQL database.
- **Enabled in production:** The feature is live and accessible to end-users in the production deployment.

### Current Subsystem Status Matrix

| Subsystem / Capability | Implemented in Repo | Tested Against Real DB | Enabled in Production | Notes & Next Step |
|---|:---:|:---:|:---:|---|
| **Product-First Browsing (All Stores)** | **YES** | N/A (Client/Mock) | **YES** | Milestone 1 completed; active in Vercel build. |
| **Single-Store Cart & Checkout** | **YES** | **NO** (In-browser mock) | **YES** (Demo mock) | Operational baseline while multi-store backend is built. |
| **Delivery Fee Engine (Single Store)** | **YES** | N/A (Pure logic) | **YES** | 33 vitest tests passing in `deliveryFee.test.js`. |
| **Dynamic Platform Fee Allocator** | **YES** | **NO** (In-memory mock) | **YES** (Demo mock) | 17 vitest tests passing in `platformFeeAllocator.test.js`. |
| **UPI QR & Payment Verification Screen** | **YES** | **NO** (Mock adapter) | **YES** (Demo mock) | 20 vitest tests passing in `customerPaymentFlow.test.js`. |
| **Multi-Store Relational Schema (PostgreSQL)** | **YES** | **NO** (Pending Supabase provision) | **NO** | Migrations 01–03 + Seed in `supabase/migrations/`; validated with `db:validate`. |
| **Render Express API Foundation** | **YES** | **NO** (Tested with mock client) | **NO** | Implemented in `server/`; 25 server tests passing; Render blueprint `render.yaml`. |
| **Multi-Stop Route & Fee Engine** | **NO** (Design specified) | **NO** | **NO** | Multi-stop sequencing and fail-closed logic specified in `docs/backend-architecture.md`. |
| **Atomic Multi-Store Order Creation API** | **NO** (Design specified) | **NO** | **NO** | Transactional contract and idempotency specified. |
| **Single Runner Group Pickup Lifecycle** | **NO** (Design specified) | **NO** | **NO** | Gatekeeper invariant (`OUT_FOR_DELIVERY` blocked until all picked up) specified. |
| **Rate-Limited Handover OTP Verification** | **NO** (Design specified) | **NO** | **NO** | Max 3 attempts, 5-min lockout specified. |
| **Combined Multi-Store Customer Checkout** | **NO** (Design specified) | **NO** | **NO** | Blocked on routing provider integration and DB E2E testing. |
