import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'

describe('Admin Orders Management & Monitoring API', () => {
  let app

  const sampleUsers = [
    { id: 'usr_admin', email: 'admin@campus.edu', name: 'Carol Admin', token: 'tok_admin' },
    { id: 'usr_super', email: 'super@campus.edu', name: 'Dave Super', token: 'tok_super' },
    { id: 'usr_cust', email: 'cust@campus.edu', name: 'Alice Customer', token: 'tok_cust' },
    { id: 'usr_run', email: 'run@campus.edu', name: 'Bob Runner', token: 'tok_run' },
  ]

  const sampleProfiles = [
    { id: 'usr_admin', email: 'admin@campus.edu', name: 'Carol Admin', runner_status: null },
    { id: 'usr_super', email: 'super@campus.edu', name: 'Dave Super', runner_status: null },
    { id: 'usr_cust', email: 'cust@campus.edu', name: 'Alice Customer', runner_status: null },
    { id: 'usr_run', email: 'run@campus.edu', name: 'Bob Runner', runner_status: 'approved' },
  ]

  const sampleRoles = [
    { user_id: 'usr_admin', role: ROLES.ADMIN },
    { user_id: 'usr_super', role: ROLES.SUPER_ADMIN },
    { user_id: 'usr_cust', role: ROLES.CUSTOMER },
    { user_id: 'usr_run', role: ROLES.RUNNER },
  ]

  const sampleOrders = [
    {
      id: 'ord_adm_1',
      customer_id: 'usr_cust',
      runner_id: 'usr_run',
      status: 'DELIVERED',
      payment_status: 'PAID',
      item_subtotal: 100,
      combined_delivery_fee: 10,
      base_amount: 110,
      platform_fee: 0.05,
      total_payable: 110.05,
      route_distance_km: 0.8,
      created_at: '2026-10-24T10:00:00Z',
      delivery_location_snapshot: {
        id: 'loc_hostel_a',
        customerDetails: {
          fullName: 'Alice Customer',
          phoneNumber: '9876543210',
          selectedDestination: 'Hostel A Common Room',
        },
      },
      order_fulfillment_groups: [
        {
          id: 'grp_1',
          store_id: 'store_campus_mart',
          status: 'PICKED_UP',
          order_items: [
            {
              id: 'itm_1',
              product_id: 'p_milk',
              product_name: 'Fresh Milk',
              product_pack: '500ml',
              unit_price: 50,
              quantity: 2,
              line_subtotal: 100,
            },
          ],
        },
      ],
    },
    {
      id: 'ord_adm_2',
      customer_id: 'usr_cust',
      runner_id: null,
      status: 'AWAITING_PAYMENT',
      payment_status: 'PENDING',
      item_subtotal: 60,
      combined_delivery_fee: 10,
      base_amount: 70,
      platform_fee: 0.01,
      total_payable: 70.01,
      route_distance_km: 0.5,
      created_at: '2026-10-24T11:00:00Z',
      delivery_location_snapshot: {
        id: 'loc_library',
        customerDetails: {
          fullName: 'Alice Customer',
          phoneNumber: '9876543210',
          selectedDestination: 'Central Library',
        },
      },
      order_fulfillment_groups: [
        {
          id: 'grp_2',
          store_id: 'store_nescafe',
          status: 'PENDING',
          order_items: [
            {
              id: 'itm_2',
              product_id: 'p_coffee',
              product_name: 'Cold Coffee',
              product_pack: '200ml',
              unit_price: 60,
              quantity: 1,
              line_subtotal: 60,
            },
          ],
        },
      ],
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

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/admin/orders')
    expect(res.status).toBe(401)
  })

  it('strictly blocks customers and runners from accessing admin orders (requires ORDERS_READ_ALL)', async () => {
    // Customer
    const resCust = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', 'Bearer tok_cust')
    expect(resCust.status).toBe(403)

    // Runner
    const resRun = await request(app)
      .post('/admin/orders/list')
      .set('Authorization', 'Bearer tok_run')
    expect(resRun.status).toBe(403)
  })

  it('allows administrator to list all orders with canonical formatting', async () => {
    const res = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', 'Bearer tok_admin')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(2)

    const order1 = res.body.find((o) => o.id === 'ord_adm_1')
    expect(order1).toBeDefined()
    expect(order1.status).toBe('DELIVERED')
    expect(order1.paymentStatus).toBe('PAID')
    expect(order1.storeId).toBe('store_campus_mart')
    expect(order1.customerDetails?.fullName).toBe('Alice Customer')
    expect(order1.pricing?.total).toBe(110.05)
    expect(order1.lines).toHaveLength(1)
    expect(order1.lines[0].name).toBe('Fresh Milk')
  })

  it('supports POST /admin/orders/list RPC path used by frontend transport', async () => {
    const res = await request(app)
      .post('/admin/orders/list')
      .set('Authorization', 'Bearer tok_super')
      .send({})

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })

  it('filters orders by lifecycle status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/orders?status=AWAITING_PAYMENT')
      .set('Authorization', 'Bearer tok_admin')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('ord_adm_2')
    expect(res.body[0].status).toBe('AWAITING_PAYMENT')
  })

  it('filters orders by store ID', async () => {
    const res = await request(app)
      .post('/admin/orders/list')
      .set('Authorization', 'Bearer tok_admin')
      .send({ storeId: 'store_nescafe' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('ord_adm_2')
  })

  it('searches orders by order ID keyword', async () => {
    const res = await request(app)
      .post('/admin/orders/list')
      .set('Authorization', 'Bearer tok_admin')
      .send({ search: 'ord_adm_1' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('ord_adm_1')
  })
})
