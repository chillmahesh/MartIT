# MartIT

Smart ordering and student-powered delivery for closed communities: campuses, hostels and residential societies. Customers order essentials, pay by UPI, track the order and receive it from a student runner with an OTP-verified handover.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # optional — leave VITE_API_BASE_URL empty to use the mock backend
npm run dev                  # http://localhost:5173
npm test                     # unit tests (fees, state machines, mock server)
npm run build                # production build in dist/
```

Useful routes while building:
- `/` — the landing page. In Phase 1 this is a shell; the full page comes in Phase 2.
- `/styleguide` — design tokens, components, the delivery-fee lab and an access-rules tester. It is internal and not linked from the site.
- `/login` — sign in with a sample customer, a sample approved runner or a sample super admin (mock backend only).
- `/admin` — admin console (people & roles), for admins and super admins.

## Tech stack

| Area | Choice |
|---|---|
| App | React 19 + Vite, React Router (data router, code-split routes) |
| Styling | Tailwind CSS v4 with CSS-variable tokens (light + dark) in `src/styles/tokens.css` |
| Data | TanStack Query (server state), Zustand (cart, session, theme) |
| UI primitives | Radix (`radix-ui`): Dialog, DropdownMenu, Switch, Slot. Patterns adapted from shadcn/ui, with credits in comments |
| Motion | Motion (`motion/react`, using `LazyMotion` + `m` so the animation engine is code-split), Lenis smooth scroll. GSAP + ScrollTrigger are installed for the scroll storytelling in Phase 2 |
| Icons / fonts | Lucide; self-hosted Bricolage Grotesque (display) + Geist (UI) |
| Tests | Vitest |

## Project structure

```
src/
  app/          router, providers, layouts, route guards
  components/   ui/ (primitives) · layout/ · products/ · cart/ · orders/ · runner/ · marketing/
  pages/        landing/ · auth/ · customer/ · runner/ · dev/ (styleguide)
  services/     domain services (auth, delivery, orders, locations) → api.js → backend or mockServer/
  config/       fees.js (pricing source of truth), env.js
  utils/        deliveryFee, orderTotals, order/payment state machines, distance, currency
  hooks/  stores/  mocks/  styles/
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
  - ₹10 up to 0.5 km, ₹15 up to 1 km, ₹20 up to 2 km, then +₹5 for every started km.
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
