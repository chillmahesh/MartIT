import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'

describe('Catalogue & Authoritative Delivery Quote Endpoints', () => {
  let app

  beforeEach(() => {
    createMockSupabaseClient({
      users: [
        { id: 'usr_owner1', token: 'tok_owner1', email: 'owner1@campus.edu', name: 'Owner One' },
        { id: 'usr_owner2', token: 'tok_owner2', email: 'owner2@campus.edu', name: 'Owner Two' },
        { id: 'usr_customer', token: 'tok_customer', email: 'cust@campus.edu', name: 'Cust Carol' },
        { id: 'usr_admin', token: 'tok_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      profiles: [
        { id: 'usr_owner1', email: 'owner1@campus.edu', name: 'Owner One' },
        { id: 'usr_owner2', email: 'owner2@campus.edu', name: 'Owner Two' },
        { id: 'usr_customer', email: 'cust@campus.edu', name: 'Cust Carol' },
        { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      userRoles: [
        { user_id: 'usr_owner1', role: 'store_owner' },
        { user_id: 'usr_owner2', role: 'store_owner' },
        { user_id: 'usr_customer', role: 'customer' },
        { user_id: 'usr_admin', role: 'admin' },
      ],
      stores: [
        { id: 'store_open', owner_id: 'usr_owner1', name: 'Open Mart', is_open: true, latitude: '12.970000', longitude: '77.590000', description: 'Campus Mart' },
        { id: 'store_closed', owner_id: 'usr_owner2', name: 'Closed Mart', is_open: false, latitude: '12.970000', longitude: '77.590000', description: 'Night Canteen' },
      ],
      locations: [
        { id: 'loc_close', name: 'Nearby Hostel', latitude: '12.973000', longitude: '77.590000', is_active: true }, // ~0.33 km -> band 10
        { id: 'loc_1km', name: 'Mid Hostel', latitude: '12.978000', longitude: '77.590000', is_active: true }, // ~0.89 km -> band 15
        { id: 'loc_far', name: 'Outside Campus', latitude: '13.040000', longitude: '77.590000', is_active: true }, // ~7.7 km -> outside 5km
      ],
      categories: [
        { id: 'dairy', name: 'Milk & Bread', icon: 'MilkCarton', sort_order: 1 },
      ],
      products: [
        { id: 'p_1', store_id: 'store_open', category_id: 'dairy', name: 'Milk', pack: '500ml', price: '28.00', mrp: '28.00', stock: 10, is_available: true },
        { id: 'p_2', store_id: 'store_closed', category_id: 'dairy', name: 'Curd', pack: '200g', price: '30.00', mrp: '35.00', stock: 5, is_available: true },
      ],
    })
    app = createApp()
  })

  it('lists catalogue products filtered by storeId', async () => {
    const res = await request(app)
      .get('/api/v1/catalogue/products?storeId=store_open')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].id).toBe('p_1')
    expect(res.body[0].storeId).toBe('store_open')
  })

  it('supports RPC POST /catalogue/products for frontend api.js', async () => {
    const res = await request(app)
      .post('/catalogue/products')
      .send({ storeId: 'store_open' })
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
  })

  it('lists stores via GET /api/v1/stores and POST /stores/list', async () => {
    const res = await request(app).get('/api/v1/stores')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    expect(res.body[0].isOpen).toBe(true)
    expect(res.body[1].isOpen).toBe(false)
  })

  it('calculates short delivery fee (₹10 for <= 0.5 km) and clearly marks as straight-line estimate', async () => {
    const res = await request(app)
      .post('/api/v1/delivery/quote')
      .send({ storeId: 'store_open', locationId: 'loc_close' })

    expect(res.status).toBe(200)
    expect(res.body.deliveryFee).toBe(10)
    expect(res.body.feeLabel).toBe('Short campus delivery')
    expect(res.body.distanceKm).toBeLessThanOrEqual(0.5)
    expect(res.body.isEstimate).toBe(true)
    expect(res.body.quoteType).toBe('single_store_straight_line_estimate')
    expect(res.body.routingProvider).toBe('straight_line_haversine')
  })

  it('fails-closed on multi-store delivery quote request with 422 MULTI_STORE_ROUTING_UNAVAILABLE', async () => {
    const res = await request(app)
      .post('/api/v1/delivery/quote')
      .send({ storeIds: ['store_open', 'store_closed'], locationId: 'loc_close' })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('MULTI_STORE_ROUTING_UNAVAILABLE')
  })

  it('calculates mid-distance delivery fee (₹15 for 0.5 - 1.0 km)', async () => {
    const res = await request(app)
      .post('/api/v1/delivery/quote')
      .send({ storeId: 'store_open', locationId: 'loc_1km' })

    expect(res.status).toBe(200)
    expect(res.body.deliveryFee).toBe(15)
    expect(res.body.feeLabel).toBe('Nearby hostel or campus location')
    expect(res.body.distanceKm).toBeGreaterThan(0.5)
    expect(res.body.distanceKm).toBeLessThanOrEqual(1.0)
    expect(res.body.isEstimate).toBe(true)
  })

  it('rejects quote when store is closed with 409 STORE_CLOSED', async () => {
    const res = await request(app)
      .post('/delivery/quote')
      .send({ storeId: 'store_closed', locationId: 'loc_close' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('STORE_CLOSED')
  })

  it('blocks quotes exceeding the 5 km service radius with 422 MAX_DISTANCE_EXCEEDED', async () => {
    const res = await request(app)
      .post('/api/v1/delivery/quote')
      .send({ storeId: 'store_open', locationId: 'loc_far' })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('MAX_DISTANCE_EXCEEDED')
    expect(res.body.details.maxKm).toBe(5)
  })

  it('error response does not leak stack traces or internal secrets', async () => {
    const res = await request(app).post('/non-existent-route').send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
    expect(res.body.stack).toBeUndefined()
  })

  it('allows store owner to update their own store settings (isOpen, description)', async () => {
    const res = await request(app)
      .patch('/api/v1/stores/store_open')
      .set('Authorization', 'Bearer tok_owner1')
      .send({ isOpen: false, description: 'Temporarily closed for restock' })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('store_open')
    expect(res.body.isOpen).toBe(false)
    expect(res.body.description).toBe('Temporarily closed for restock')
  })

  it('also supports RPC-style POST /stores/update for frontend api.js', async () => {
    const res = await request(app)
      .post('/stores/update')
      .set('Authorization', 'Bearer tok_owner1')
      .send({ storeId: 'store_open', isOpen: true })

    expect(res.status).toBe(200)
    expect(res.body.isOpen).toBe(true)
  })

  it('blocks another store owner from modifying a store they do not own with 403 Forbidden', async () => {
    const res = await request(app)
      .patch('/api/v1/stores/store_open')
      .set('Authorization', 'Bearer tok_owner2')
      .send({ isOpen: false })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('blocks a customer from modifying any store with 403 Forbidden', async () => {
    const res = await request(app)
      .patch('/api/v1/stores/store_open')
      .set('Authorization', 'Bearer tok_customer')
      .send({ isOpen: false })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('blocks unauthenticated requests to modify a store with 401 Unauthenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/stores/store_open')
      .send({ isOpen: false })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })

  it('allows an admin to update any store', async () => {
    const res = await request(app)
      .patch('/api/v1/stores/store_closed')
      .set('Authorization', 'Bearer tok_admin')
      .send({ isOpen: true })

    expect(res.status).toBe(200)
    expect(res.body.isOpen).toBe(true)
  })
})
