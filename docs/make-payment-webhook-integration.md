# Make.com Payment Webhook Integration Guide

This document defines the production specification for the **Make.com** payment webhook integration in MartIT. It details scenario architecture, ingestion protocols, deduplication semantics, error handling, and the critical boundary between notification ingestion and authoritative server-side bank verification.

---

## 1. Architectural Overview & Security Boundary

```
[Customer UPI Payment] 
      │
      ▼
[Paytm Business / Banking Network] 
      │
      ├──> [Merchant Email / SMS Notification] ──> [Make.com Scenario Trigger]
      │                                                   │
      │                                                   ▼
      │                                         [JSON Normalization & Secret Auth]
      │                                                   │
      │                                                   ▼
      │                                         [MartIT Webhook Endpoint]
      │                                         POST /api/v1/webhooks/make-payment
      │                                                   │
      │                                                   ▼
      │                                         [Fail-Closed Evidence Ingestion]
      │                                         status: 'PROCESSING', evidence: NULL
      │                                                   │
      └───< [Authoritative Server-to-Server Verification] <┘
            (Requires Paytm Merchant API / MID / Key)
            • Validates: Merchant MID, Transaction ID, Exact Amount, Terminal Success
            • On genuine confirmation: Transitions order PENDING -> PAID atomically
```

### Security Invariant: Ingestion vs. Authoritative Settlement
- **Untrusted Ingestion:** Email parsing, SMS parsing, Make.com notification payloads, caller-supplied UTRs, and shared webhook secrets **DO NOT** constitute authoritative proof of bank settlement.
- **Fail-Closed Storage:** Incoming notifications from Make.com are ingested into `public.payment_records` with `status = 'PROCESSING'` and `evidence = NULL`. This strictly prevents satisfying the database anti-shortcut constraint (`status = 'PAID' OR evidence IS NOT NULL`).
- **Confirmation Boundary:** An order transitions to `PAID` and `CONFIRMED` **only** when an authoritative server-to-server gateway verifier validates the transaction identity, merchant account, exact payable amount, and terminal success. In the absence of an active trusted gateway client, the system fails closed safely.

---

## 2. Make.com Scenario Trigger Configuration

### 2.1 Trigger Module
* **Module Type:** *Gmail / Custom Webhook / SMS Gateway Ingestion*
* **Watch Target:** Merchant banking email/SMS inbox receiving official settlement notices from Paytm for Business (e.g., `no-reply@paytm.com` or official Paytm Business SMS header).
* **Trigger Filter:** Filter on subject lines and body containing:
  - `"received Rs."` or `"Payment received"`
  - UPI Reference / UTR pattern: `\b\d{12}\b`
  - Order reference pattern: `ord_[a-zA-Z0-9_-]+`

---

## 3. Data Extraction and Normalization

The Make.com scenario must extract and normalize raw notification text into uniform fields before dispatching the HTTP request:

| Field Name | Extraction Regex / Source | Example Normalized Value | Description |
| :--- | :--- | :--- | :--- |
| `orderId` | `ord_[a-zA-Z0-9_-]{8,32}` | `ord_9f81a7b2c0194e82` | Authoritative order identifier matching `orders.id` |
| `amount` | `(?:Rs\.?|INR)\s*([0-9]+(?:\.[0-9]{2})?)` | `115.15` | Exact amount paid (must match order `total_payable`) |
| `utr` | `(?:UPI Ref|UTR|RRN|Ref No\.?)\s*[:#-]?\s*(\d{12})` | `429182749102` | 12-digit Banking Reference Number / UPI RRN |
| `sender` | `(?:from|payer)\s*([A-Za-z0-9\s/]+(?:@[a-zA-Z]+)?)` | `Student John / 9876543210@paytm` | Payer display name or VPA |
| `timestamp` | Email/SMS RFC3339 timestamp | `2026-10-22T06:30:00.000Z` | Timestamp when notification was generated |
| `status` | Normalized status string | `SUCCESS` | Notification claim status |
| `evidence` | Fixed string | `Payment received` | Positive payment assertion token |
| `messageId` | Email Message ID / SMS ID | `msg_paytm_99812731` | Unique provider message identifier |

---

## 4. Webhook Dispatch Protocol

### 4.1 HTTP Request Configuration
* **Method:** `POST`
* **Target URLs:**
  - Production: `https://<YOUR_RENDER_SERVICE_DOMAIN>/api/v1/webhooks/make-payment`
  - Alternate routes supported: `/api/v1/webhooks/payment` or `/webhooks/make-payment`
* **Headers:**
  ```http
  Content-Type: application/json
  x-make-secret: <MAKE_WEBHOOK_SECRET>
  ```
  *(Supported alternate auth headers: `x-webhook-secret: <MAKE_WEBHOOK_SECRET>` or `Authorization: Bearer <MAKE_WEBHOOK_SECRET>`)*

### 4.2 JSON Request Payload Specification

```json
{
  "orderId": "ord_9f81a7b2c0194e82",
  "amount": 115.15,
  "utr": "429182749102",
  "sender": "Student John / 9876543210@paytm",
  "status": "SUCCESS",
  "evidence": "Payment received",
  "timestamp": "2026-10-22T06:30:00.000Z",
  "rawPayload": {
    "providerMessageId": "msg_paytm_99812731",
    "parserSource": "gmail_paytm_business_v1",
    "rawSnippet": "Received Rs. 115.15 from Student John UPI Ref 429182749102 ord_9f81a7b2c0194e82"
  }
}
```

---

## 5. Backend Response Codes & Retry Policy

Make.com error handlers must adhere to the following response semantics:

| HTTP Status | Response Code | Meaning | Make.com Action |
| :--- | :--- | :--- | :--- |
| **`200 OK`** | *(success: true)* | Notification ingested safely (evidence stored as `PROCESSING`, or verified if gateway active). Includes `isDuplicate: true` if already seen. | **Commit & Finish.** Do not retry. |
| **`400 Bad Request`** | `INVALID_ORDER_ID`<br>`INVALID_AMOUNT`<br>`PAYMENT_AMOUNT_MISMATCH`<br>`PAYMENT_WINDOW_EXPIRED`<br>`PAYMENT_FAILED_NOTIFICATION` | Payload is malformed, amount does not match order total, or payment window has expired (>2 minutes). | **Do NOT retry.** Route to Dead-Letter Queue (DLQ) or alert staff channel. |
| **`401 Unauthorized`** | `UNAUTHENTICATED` | Missing or invalid shared secret. | **Immediate Halt.** Alert DevOps; secret mismatch or misconfiguration. |
| **`404 Not Found`** | `ORDER_NOT_FOUND` | Order ID does not exist in MartIT database. | **Do NOT retry.** Log for investigation (possible customer typo). |
| **`409 Conflict`** | `TERMINAL_STATE` | Order is cancelled or already expired/failed. | **Do NOT retry.** Flag for refund/reconciliation. |
| **`500 / 503 / Timeout`** | `INTERNAL_SERVER_ERROR`<br>`TRANSACTION_FAILED` | Database transient error or server waking up from sleep. | **Retry with Exponential Backoff:** 3 attempts (intervals: 10s, 30s, 90s). |

---

## 6. Required Server Environment Variables

Configure these variables in your deployment environment (e.g. Render dashboard):

| Variable Name | Environment | Description |
| :--- | :--- | :--- |
| `MAKE_WEBHOOK_SECRET` | Production & Staging | High-entropy shared secret (minimum 16 characters) used to authenticate incoming requests from Make.com timing-safely. |
| `MAKE_VERIFICATION_WEBHOOK_URL` | Optional | Outbound webhook URL if MartIT dispatches verification callbacks. |
| `PAYTM_MERCHANT_ID` | Production | Official Paytm Merchant Identification Number (MID) required for live settlement status queries. |
| `PAYTM_MERCHANT_KEY` | Production | Official Paytm Merchant Key used to compute checksum signatures for authoritative status verification. |

*(Never commit actual secret values to source control or expose them in client bundles.)*
