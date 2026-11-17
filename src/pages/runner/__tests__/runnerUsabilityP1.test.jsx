import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { RunnerStatsSummary } from '@/components/runner/RunnerStatsSummary'
import { DeliveryCard } from '@/components/runner/DeliveryCard'
import { createMockServer } from '@/services/mockServer/handlers'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { SAMPLE_ORDERS } from '@/mocks/orders'

describe('Runner Usability Features (P1: Directions, Delay Reporting & Earnings Ledger)', () => {
  let server

  beforeEach(() => {
    server = createMockServer()
  })

  describe('1. Runner Stats & Earnings Summary', () => {
    it('renders Earnings & Payout Ledger tile with settled and in-transit amounts', () => {
      const html = renderToString(
        <RunnerStatsSummary
          availableCount={2}
          activeCount={3}
          completedCount={4}
          earnedTotal={32}
          activeEstimatedTotal={24}
          selectedTab="all"
          onSelectTab={vi.fn()}
        />,
      )

      expect(html).toContain('data-testid="runner-earnings-summary"')
      expect(html).toContain('Earnings &amp; Payout Ledger')
      expect(html).toContain('Settled Today')
      expect(html).toContain('₹32')
      expect(html).toContain('In Transit (Est.)')
      expect(html).toContain('₹24')
      expect(html).toContain('₹8 payout per completed delivery')
    })
  })

  describe('2. DeliveryCard Campus Directions & Delay Notice UI', () => {
    const mockPreparingOrder = {
      id: 'ord_runner_p1_test',
      status: ORDER_STATUS.PREPARING,
      runnerId: 'usr_runner_1',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      customerDetails: {
        fullName: 'Rohan Sharma',
        selectedDestination: 'Hostel 3',
        detailedAddress: '2nd Floor, Room 204, near North Wing',
      },
      lines: [{ name: 'Instant Noodles', quantity: 2, unitPrice: 20, lineSubtotal: 40 }],
      deliveryFee: 10,
    }

    it('renders Campus Directions button and destination landmarks', () => {
      const html = renderToString(
        <DeliveryCard
          order={mockPreparingOrder}
          currentRunnerId="usr_runner_1"
          onAction={vi.fn()}
        />,
      )

      expect(html).toContain('data-testid="btn-directions-ord_runner_p1_test"')
      expect(html).toContain('Campus Directions &amp; Guide')
      expect(html).toContain('Hostel 3')
      expect(html).toContain('2nd Floor, Room 204, near North Wing')
      expect(html).toContain('data-testid="btn-report-delay-ord_runner_p1_test"')
      expect(html).toContain('Report Delay')
    })

    it('displays Delay Reported notice badge when an operational delay was logged', () => {
      const orderWithDelay = {
        ...mockPreparingOrder,
        latestDelayReport: {
          reportedAt: new Date().toISOString(),
          reason: 'STORE_DELAY',
          note: 'Store is baking fresh batch, 5 mins extra',
        },
      }

      const html = renderToString(
        <DeliveryCard
          order={orderWithDelay}
          currentRunnerId="usr_runner_1"
          onAction={vi.fn()}
        />,
      )

      expect(html).toContain('data-testid="delay-badge-ord_runner_p1_test"')
      expect(html).toContain('Delay Reported:')
      expect(html).toContain('Store Delay (Items still preparing)')
      expect(html).toContain('Store is baking fresh batch, 5 mins extra')
    })
  })

  describe('3. Backend / MockServer Delay Reporting Contract', () => {
    it('records delay report for assigned runner on active orders', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Find or setup an active preparing order assigned to this runner
      const sample = SAMPLE_ORDERS.find((o) => o.status === ORDER_STATUS.PREPARING) || SAMPLE_ORDERS[0]
      sample.runnerId = 'u_runner_1'
      sample.status = ORDER_STATUS.PREPARING

      const res = await server.handle(
        'runner.order.reportDelay',
        {
          orderId: sample.id,
          reason: 'BAD_WEATHER',
          note: 'Heavy rain across campus academic block',
        },
        { token: runnerToken },
      )

      expect(res.success).toBe(true)
      expect(res.orderId).toBe(sample.id)
      expect(res.delayReport.reason).toBe('BAD_WEATHER')
      expect(res.delayReport.note).toBe('Heavy rain across campus academic block')
      expect(res.delayReport.runnerId).toBe('u_runner_1')
    })

    it('rejects delay report if caller is not the assigned runner', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      const sample = SAMPLE_ORDERS[0]
      sample.runnerId = 'u_other_runner'
      sample.status = ORDER_STATUS.PREPARING

      await expect(
        server.handle(
          'runner.order.reportDelay',
          { orderId: sample.id, reason: 'STORE_DELAY' },
          { token: runnerToken },
        ),
      ).rejects.toThrow('You are not assigned to this delivery.')
    })

    it('rejects delay report if order is not in an active delivery status', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      const sample = SAMPLE_ORDERS[0]
      sample.runnerId = 'u_runner_1'
      sample.status = ORDER_STATUS.DELIVERED

      await expect(
        server.handle(
          'runner.order.reportDelay',
          { orderId: sample.id, reason: 'STORE_DELAY' },
          { token: runnerToken },
        ),
      ).rejects.toThrow('Delays can only be reported for active deliveries')
    })
  })
})
