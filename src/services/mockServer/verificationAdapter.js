/**
 * Mock Verification Adapter (Mock Server).
 *
 * Simulates payment reconciliation and Make.com webhook integration.
 *
 * ARCHITECTURAL SAFETY GUARANTEES:
 * 1. This is explicitly a MOCK adapter for local development and automated testing.
 * 2. It NEVER automatically marks a payment as PAID simply to make the UI look complete.
 * 3. Only verified server-side evidence ("Payment received") can transition a payment to PAID.
 * 4. The response "not received" is strictly INCONCLUSIVE; it never marks payment failed or paid,
 *    and directs the customer to contact the administrator.
 * 5. Neither QR display, client button clicks, browser redirects, nor elapsed time can mark an order paid.
 */

export function createMockVerificationAdapter() {
  // Map of orderId -> string evidence (e.g. 'Payment received')
  const evidenceStore = new Map()

  /**
   * Records trusted verification evidence (stands in for incoming Make.com webhook).
   * For testing or automated simulation.
   */
  function recordEvidence(orderId, evidence) {
    if (!orderId) return
    evidenceStore.set(orderId, evidence)
  }

  /**
   * Clears evidence store.
   */
  function clearEvidence() {
    evidenceStore.clear()
  }

  /**
   * Verifies payment for an order against authoritative evidence.
   *
   * @param {Object} params
   * @param {string} params.orderId
   * @param {number} params.amount
   * @param {number} params.allocatedAt
   * @param {number} [params.now]
   * @returns {{ status: 'verified' | 'inconclusive', rawResponse: string, message: string }}
   */
  function verifyPayment({ orderId, amount, allocatedAt, now = Date.now() }) {
    if (!orderId) {
      return {
        status: 'inconclusive',
        rawResponse: 'not received',
        message: 'Order reference is required for payment verification.',
      }
    }

    const evidence = evidenceStore.get(orderId)

    // Trusted Make.com contract: match 'Payment received' or blueprint spelling 'Payment recieved'
    if (evidence === 'Payment received' || evidence === 'Payment recieved' || evidence === 'SUCCESS') {
      return {
        status: 'verified',
        rawResponse: evidence,
        message: 'Payment received and verified.',
      }
    }

    // Default Make.com response when transaction is not matched ('not recieved' or 'not received')
    const negativeResponse = evidence === 'not recieved' ? 'not recieved' : 'not received'
    return {
      status: 'inconclusive',
      rawResponse: negativeResponse,
      message:
        'Payment not detected yet. If money was debited from your UPI app, please contact campus support with your order reference.',
    }
  }

  return {
    recordEvidence,
    clearEvidence,
    verifyPayment,
  }
}
