# Make.com Payment Verification Integration Guide

This document defines the production specification for the **Make.com** payment verification integration in MartIT.

---

## 1. Architectural Overview & Verification Flow

```
[Customer UPI Payment] 
      │
      ▼
[Paytm Business / Banking Network] ──> [Merchant Gmail Alert]
                                             │
                                             ▼
[Customer clicks "Confirm Payment"]     [Make.com Scenario]
              │                              │
              ▼                              │
[MartIT Backend (orders.js)]                 │
  POST MAKE_VERIFICATION_WEBHOOK_URL         │
  Body: { content: amount, orderId } ────────> Searches Gmail alerts for amount
                                             │
  <── Receives Response ─────────────────────┘
      • "Payment recieved"  ──> Marks Order PAID & CONFIRMED
      • "not recieved"      ──> Fails closed (remains PENDING)
```

### Key Clarifications:
- **No Webhook Secret:** There is no `MAKE_WEBHOOK_SECRET` or secret header. The only configuration is `MAKE_VERIFICATION_WEBHOOK_URL`.
- **Outbound Query Logic:** MartIT sends the order amount as `content` to the Make.com webhook URL and awaits the verification response.
- **Fail-Closed Security:** Only an explicit positive confirmation ("Payment recieved") transitions an order to `PAID`. Inconclusive, timed-out, negative ("not recieved"), or unconfigured responses leave the order in `PENDING`.

---

## 2. Make.com Webhook Request Protocol

When a customer confirms payment, MartIT calls `MAKE_VERIFICATION_WEBHOOK_URL`:

* **Method:** `POST`
* **Headers:** `Content-Type: application/json`
* **JSON Payload:**
  ```json
  {
    "content": 115.15,
    "amount": 115.15,
    "orderId": "ord_9f81a7b2c0194e82"
  }
  ```

---

## 3. Make.com Scenario Expected Response

The Make.com scenario searches recent merchant Gmail alerts for matching payment evidence and returns either plain text or JSON:

| Scenario Outcome | Expected Response Body | MartIT Backend Action |
| :--- | :--- | :--- |
| **Payment Confirmed** | Plain text `"Payment recieved"` (or `"Payment received"`), or `{"status": "SUCCESS"}` | Order atomically transitions to `PAID` / `CONFIRMED`. Suffix released. Ready for runner pickup. |
| **Payment Not Detected** | Plain text `"not recieved"` (or `"not received"`), or `{"status": "FAILED"}` | Fails closed. Order remains `AWAITING_PAYMENT` (`PENDING`). Prompts user to retry or contact admin. |
| **Timeout / Error** | HTTP non-200, network error, or empty body | Fails closed. Order remains `AWAITING_PAYMENT` (`PENDING`). No runner assigned. |

---

## 4. Required Server Environment Variables

| Variable Name | Environment | Description |
| :--- | :--- | :--- |
| `MAKE_VERIFICATION_WEBHOOK_URL` | Production & Staging | Make.com scenario webhook URL that receives the amount query and returns verification evidence. |

*(Note: There is no `MAKE_WEBHOOK_SECRET`. Do not configure dummy secrets or secret headers.)*
