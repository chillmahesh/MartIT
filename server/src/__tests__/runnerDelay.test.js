import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'

describe('Runner Operational Delay Reporting API', () => {
  let app

  const sampleUsers = [
    { id: 'usr_cust', email: 'cust@campus.edu', name: 'Alice Customer', token: 'tok_cust' },
    { id: 'usr_run', email: 'run@campus.edu', name: 'Bob Runner', token: 'tok_run' },
    { id: 'usr_other_run', email: 'other@campus.edu', name: 'Other Runner', token: 'tok_other_run' },
  ]

  const sampleProfiles = [
    { id: 'usr_cust', email: 'cust@campus.edu', name: 'Alice Customer', runner_status: null },
    { id: 'usr_run', email: 'run@campus.edu', name: 'Bob Runner', runner_status: 'approved' },
    { id: 'usr_other_run', email: 'other@campus.edu', name: 'Other Runner', runner_status: 'approved' },
  ]

  const sampleRoles = [
    { user_id: 'usr_cust', role: ROLES.CUSTOMER },
    { user_id: 'usr_run', role: ROLES.RUNNER },
    { user_id: 'usr_other_run', role: ROLES.RUNNER },
  ]

  const sampleOrders = [
    {
      id: 'ord_delay_1',
      customer_id: 'usr_cust',
      runner_id: 'usr_run',
      status: 'ON_THE_WAY',
      created_at: '2026-10-24T10:00:00Z',
    },
    {
      id: 'ord_delivered_1',
      customer_id: 'usr_cust',
      runner_id: 'usr_run',
      status: 'DELIVERED',
      created_at: '2026-10-24T09:00:00Z',
    },
  ]

  beforeEach(() => {
    createMockSupabaseClient({
      users: sampleUsers,
      profiles: sampleProfiles,
      userRoles: sampleRoles,
      orders: sampleOrders,
    })
    app = createApp()
  })

  it('rejects unauthenticated delay reporting with 401', async () => {
    const res = await request(app)
      .post('/api/v1/runner/orders/ord_delay_1/report-delay')
      .send({ reason: 'BAD_WEATHER' })

    expect(res.status).toBe(401)
  })

  it('rejects non-runner customer with 403', async () => {
    const res = await request(app)
      .post('/api/v1/runner/orders/ord_delay_1/report-delay')
      .set('Authorization', 'Bearer tok_cust')
      .send({ reason: 'BAD_WEATHER' })

    expect(res.status).toBe(403)
    expect(res.body.message).toContain('approved runner')
  })

  it('rejects runner not assigned to the order with 403', async () => {
    const res = await request(app)
      .post('/api/v1/runner/orders/ord_delay_1/report-delay')
      .set('Authorization', 'Bearer tok_other_run')
      .send({ reason: 'BAD_WEATHER' })

    expect(res.status).toBe(403)
    expect(res.body.message).toContain('not assigned')
  })

  it('rejects delay reporting for completed orders with 400', async () => {
    const res = await request(app)
      .post('/api/v1/runner/orders/ord_delivered_1/report-delay')
      .set('Authorization', 'Bearer tok_run')
      .send({ reason: 'STORE_DELAY' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('active deliveries')
  })

  it('successfully records delay report via REST endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/runner/orders/ord_delay_1/report-delay')
      .set('Authorization', 'Bearer tok_run')
      .send({
        reason: 'BAD_WEATHER',
        note: 'Severe thunderstorm across north campus',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.orderId).toBe('ord_delay_1')
    expect(res.body.delayReport.reason).toBe('BAD_WEATHER')
    expect(res.body.delayReport.note).toBe('Severe thunderstorm across north campus')
    expect(res.body.delayReport.runnerId).toBe('usr_run')
  })

  it('successfully records delay report via RPC-style endpoint', async () => {
    const res = await request(app)
      .post('/runner/order/reportDelay')
      .set('Authorization', 'Bearer tok_run')
      .send({
        orderId: 'ord_delay_1',
        reason: 'CUSTOMER_UNREACHABLE',
        note: 'Called twice, waiting at hostel entry gate',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.orderId).toBe('ord_delay_1')
    expect(res.body.delayReport.reason).toBe('CUSTOMER_UNREACHABLE')
  })
})
