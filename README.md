# MartIT

Smart ordering and student-powered delivery for closed
communities---campuses, hostels, and residential societies. Customers
can browse essentials, place orders, pay by UPI, track order progress,
and receive deliveries from student runners with an OTP-verified
handover.

> **Implementation status:** This repository currently uses an
> in-browser mock backend when `VITE_API_BASE_URL` is unset. Sample data
> and mock authentication are for development only. Do not treat mock
> payment, tracking, or delivery flows as production integrations.

## Table of contents

-   [Project overview](#project-overview)
-   [Current implementation status](#current-implementation-status)
-   [Tech stack](#tech-stack)
-   [Getting started](#getting-started)
-   [Environment configuration](#environment-configuration)
-   [Useful routes](#useful-routes)
-   [Architecture and project
    structure](#architecture-and-project-structure)
-   [Business rules](#business-rules)
-   [Roles and permissions](#roles-and-permissions)
-   [Security notes](#security-notes)
-   [Testing and production build](#testing-and-production-build)
-   [Roadmap and open decisions](#roadmap-and-open-decisions)
-   [Documentation](#documentation)

## Project overview

MartIT is designed for closed communities where local stores supply
everyday essentials and student runners deliver orders within a defined
service area.

The application is organized around these capabilities:

-   Customer shopping and cart management.
-   Order creation and order-status workflows.
-   Delivery-fee calculation based on distance.
-   Runner workflows and administrative role management.
-   UPI payment and delivery handover flows, which still require
    production integrations as noted below.

## Current implementation status

The following describes the implementation documented in this
repository. Re-check the code before treating any item as
production-ready.

  -----------------------------------------------------------------------------
  Capability              Status                  Notes
  ----------------------- ----------------------- -----------------------------
  Delivery-fee            Implemented logic       `src/utils/deliveryFee.js`;
  calculation                                     unit-tested. Backend pricing
                                                  must match
                                                  `src/config/fees.js`.

  Order totals            Implemented logic       Currently includes item
                                                  totals and delivery fees.
                                                  Taxes, platform fees, and
                                                  discounts are not defined.

  Order and payment state Implemented logic       Separate state machines. Only
  machines                                        a trusted `server_verified`
                                                  source should mark a payment
                                                  as `PAID`.

  Backend and database    Mock                    `src/services/mockServer/`
                                                  uses in-memory data that
                                                  resets on reload.

  Authentication          Mock                    Sample accounts only; real
                                                  authentication is not
                                                  implemented in this mock
                                                  flow.

  Server-side re-pricing  Mock implementation     The mock ignores
  at order creation                               browser-supplied prices and
                                                  fees, rechecks stock,
                                                  re-quotes delivery, and
                                                  snapshots pricing. Production
                                                  must enforce this in a
                                                  trusted backend.

  Distance calculation    Mock                    Uses straight-line distance.
                                                  No routing provider is
                                                  connected; the UI labels this
                                                  accordingly.

  Store, product, and     Sample data             Located in `src/mocks/` and
  location data                                   labelled as sample data in
                                                  the UI.

  UPI payment             Not built               Must be implemented through a
  verification                                    trusted server-side
                                                  payment-verification flow.

  Atomic runner           Not built               Must be a server-side
  assignment                                      operation that prevents two
                                                  runners from accepting the
                                                  same order.

  Delivery OTP            UI only                 Backend verification, expiry,
  verification                                    attempt limits, and abuse
                                                  protection are still
                                                  required.

  Realtime tracking       Not built               Any current tracking display
                                                  is a simulation until a
                                                  realtime service is
                                                  integrated.

  Supabase persistence    Not established by this If Supabase is connected in a
                          repository README       newer version, update this
                                                  document to describe the
                                                  actual integration, schema,
                                                  migrations, and RLS policies.
  -----------------------------------------------------------------------------

## Tech stack

  -----------------------------------------------------------------------
  Area                                Technology
  ----------------------------------- -----------------------------------
  Application                         React 19, Vite, React Router data
                                      router, code-split routes

  Styling                             Tailwind CSS v4 and CSS-variable
                                      tokens

  Server state                        TanStack Query

  Client state                        Zustand for cart, session, and
                                      theme

  UI primitives                       Radix UI (`radix-ui`)

  Motion                              Motion (`motion/react`) and Lenis;
                                      GSAP + ScrollTrigger are installed
                                      for planned Phase 2 storytelling

  Icons and fonts                     Lucide; self-hosted Bricolage
                                      Grotesque and Geist

  Tests                               Vitest
  -----------------------------------------------------------------------

## Getting started

### Prerequisites

-   Node.js 20 or later
-   npm

### Install and run

``` bash
npm install
cp .env.example .env.local
npm run dev
```

The development server is available at `http://localhost:5173`.

Leave `VITE_API_BASE_URL` empty in `.env.local` to use the in-browser
mock backend.

### Available scripts

``` bash
npm test
npm run build
npm run dev
```

-   `npm test` runs the configured Vitest unit tests.
-   `npm run build` creates the production frontend bundle in `dist/`.
-   `npm run dev` starts the local development server.

## Environment configuration

Configuration is documented in `.env.example`. The frontend reads public
`VITE_*` values.

-   `VITE_API_BASE_URL` empty: use the in-browser mock backend.
-   `VITE_API_BASE_URL` set: service calls are sent to
    `${VITE_API_BASE_URL}/<service>/<action>` with a bearer token, as
    implemented by `src/services/api.js`.

Only put values intended to be public in frontend `VITE_*` variables.
**Never put database passwords, service-role keys, payment secrets, or
other privileged credentials in frontend environment variables.**
Secrets belong in a trusted backend or secret manager.

If the project is switched to Supabase, document the exact public client
configuration and server-only secrets used by the implementation. Do not
assume Supabase is connected merely because a project exists.

## Useful routes

  -----------------------------------------------------------------------
  Route                               Purpose
  ----------------------------------- -----------------------------------
  `/`                                 Landing page; currently a shell in
                                      Phase 1, with the full page planned
                                      for Phase 2.

  `/styleguide`                       Internal design tokens, components,
                                      delivery-fee lab, and access-rules
                                      tester. Not linked from the public
                                      site.

  `/login`                            Mock sign-in for sample customer,
                                      approved runner, and super-admin
                                      accounts. Mock backend only.

  `/admin`                            Admin console for people and roles;
                                      intended for admins and super
                                      admins.
  -----------------------------------------------------------------------

## Architecture and project structure

``` text
src/
  app/          router, providers, layouts, route guards
  components/   ui/ primitives, layout, products, cart, orders, runner, marketing
  pages/        landing, auth, customer, runner, dev/styleguide
  services/     domain services (auth, delivery, orders, locations)
                api.js -> configured backend or mockServer
  config/       fees.js (pricing configuration), env.js
  utils/        deliveryFee, orderTotals, order/payment state machines,
                distance, currency, permissions
  hooks/
  stores/
  mocks/
  styles/
docs/           design research, fee policy, brand assets
```

Components never call the backend directly. They call `services/*`, which go through `services/api.js`. When `VITE_API_BASE_URL` is empty, `api.js` routes calls to the in-browser mock server. When it's set, it POSTs to `${VITE_API_BASE_URL}/<service>/<action>` with a bearer token.

## What's real vs incomplete

| Capability | Status | Notes |
|---|---|---|
| Frontend | Real | React + Vite app; Vercel deployment is separate from backend deployment. |
| Backend / database | Real integration | Express API and Supabase PostgreSQL schema with 13 migrations. Local mock services remain available for development. |
| Authentication / roles | Real integration | Server validates Supabase sessions and enforces role checks; UI route guards protect UX. Admin runner status updates hardened via atomic RPC `admin_set_runner_status`. |
| Catalogue | Mixed | Sample/mock catalogue for local mode; PostgreSQL products and stores populated via migrations and seed data. |
| Order creation and pricing | Server-backed | Atomic order creation in PostgreSQL with locked product rows, held inventory, and dynamic platform fee allocation (1–99 paise). |
| UPI notification ingestion | Implemented (Make.com) | Authenticated Make.com webhook ingests Paytm Business UPI notifications via timing-safe secret check; fails closed if unverified. |
| Payment verification & concurrency | Implemented (Make.com) | Customer check observes 5s Gmail push indexing wait, queries Make.com scenario, locks in-flight checks with HTTP 409, and executes atomic payment verification upon positive confirmation. |
| Runner assignment and fulfillment | Implemented | Atomic exclusive acceptance (`runner_id IS NULL AND status = 'CONFIRMED'`), availability toggle, and multi-store pickup endpoint (`handleRunnerPickupStore`) fully implemented. |
| Handover OTP | Implemented & resilient | Plaintext 6-digit OTP displayed strictly in-app to authenticated owner; PostgreSQL holds SHA-256 hash. Enforces 3-attempt limit, 5-min lockout, and seamless server restart recovery via `reissue_delivery_otp`. |
| Customer order tracking | Implemented | 6-stage lifecycle progress tracker in `OrderConfirmationView.jsx` with active 4s polling that cleans up at terminal states (`DELIVERED`, `CANCELLED`, `EXPIRED`). Zero contradictory badges. |
| Automated CI | Not configured in GitHub Actions | Full automated test suite (31 files, 630 passed tests) and migration validator run locally or in deployment pipelines. |


## Running checks

```bash
npm ci
npm test
npm run test:server
npm run db:validate
npm run build
```

The migration validator checks repository structure; it does **not** execute SQL against PostgreSQL. Database migrations and privilege changes must be validated against a disposable or staging Supabase database before production deployment.

## Business rules baked into the code

- **Delivery fee** (confirmed 2026-10-09; see [docs/fee-policy.md](docs/fee-policy.md)):
  - ₹10 for every started delivery.
  - Checkout is blocked beyond 5 km, and there is no free delivery.
  - The fee is calculated from the unrounded distance, and the server is authoritative.
- **Snapshots:** each order stores its fee, distance, distance method and pricing version.
- **Fee split:** the runner payout is separate from the customer fee. Only the ₹10 → ₹8 example exists so far; the other payouts are undecided (`null`).
- **Roles and permissions** are defined in `src/utils/permissions.js` and shared by the UI and the server. The server enforces them; route guards are UX only.

  | Role | Can |
  |---|---|
  | Customer | Shop and see their own orders. Every sign-up gets this role |
  | Runner | Deliver orders, but only once `runnerStatus` is `approved` |
  | Admin | Open the admin console, view users, approve or suspend runners, view all orders |
  | Super admin | Everything, including assigning or removing any role (admin and super admin too) and managing pricing |

  Nobody can choose a role at sign-up. A super admin can't remove their own super admin role, and the last super admin can't be removed.
- **Secrets:** none are in client code. Only `VITE_*` public values are read (see `.env.example`).

## Open decisions

- Runner payouts for the ₹15–₹35 fee bands.
- Tax and platform-fee values, if any.
- A vector (SVG) version of the logo. The current mark is extracted from the supplied raster image (`public/brand/`).
- A routing provider for walking or road distance.
