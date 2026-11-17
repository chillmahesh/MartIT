import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'

describe('Catalogue Operations & Product Availability API', () => {
  let app

  const sampleUsers = [
    { id: 'usr_owner', email: 'owner@campus.edu', name: 'Store Owner', token: 'tok_owner' },
    { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin User', token: 'tok_admin' },
    { id: 'usr_cust', email: 'cust@campus.edu', name: 'Student Customer', token: 'tok_cust' },
  ]

  const sampleProfiles = [
    { id: 'usr_owner', email: 'owner@campus.edu', name: 'Store Owner', runner_status: null },
    { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin User', runner_status: null },
    { id: 'usr_cust', email: 'cust@campus.edu', name: 'Student Customer', runner_status: null },
  ]

  const sampleRoles = [
    { user_id: 'usr_owner', role: ROLES.STORE_OWNER },
    { user_id: 'usr_admin', role: ROLES.ADMIN },
    { user_id: 'usr_cust', role: ROLES.CUSTOMER },
  ]

  const sampleStores = [
    {
      id: 'store_campus_mart',
      name: 'Campus Mart',
      owner_id: 'usr_owner',
      is_open: true,
      latitude: '12.9716',
      longitude: '77.5946',
    },
  ]

  const sampleProducts = [
    {
      id: 'p_milk_500',
      store_id: 'store_campus_mart',
      category_id: 'dairy',
      name: 'Toned Milk',
      pack: '500 ml',
      price: '28',
      mrp: '28',
      stock: 40,
      is_available: true,
      image_url: null,
    },
    {
      id: 'p_maggi',
      store_id: 'store_campus_mart',
      category_id: 'instant',
      name: 'Instant Noodles',
      pack: '4 × 70 g',
      price: '56',
      mrp: '60',
      stock: 0,
      is_available: false,
      image_url: null,
    },
  ]

  beforeEach(() => {
    createMockSupabaseClient({
      users: sampleUsers,
      profiles: sampleProfiles,
      userRoles: sampleRoles,
      stores: sampleStores,
      products: sampleProducts,
    })
    app = createApp()
  })

  it('filters out unavailable products by default for customers', async () => {
    const res = await request(app).get('/api/v1/catalogue/products')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const ids = res.body.map((p) => p.id)
    expect(ids).toContain('p_milk_500')
    expect(ids).not.toContain('p_maggi')
  })

  it('includes unavailable products when includeUnavailable=true', async () => {
    const res = await request(app)
      .get('/api/v1/catalogue/products')
      .query({ includeUnavailable: 'true' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const ids = res.body.map((p) => p.id)
    expect(ids).toContain('p_milk_500')
    expect(ids).toContain('p_maggi')
  })

  it('rejects unauthenticated product update with 401', async () => {
    const res = await request(app)
      .patch('/api/v1/catalogue/products/p_milk_500')
      .send({ stock: 50, isAvailable: true })
    expect(res.status).toBe(401)
  })

  it('rejects non-owner non-admin user with 403', async () => {
    const res = await request(app)
      .patch('/api/v1/catalogue/products/p_milk_500')
      .set('Authorization', 'Bearer tok_cust')
      .send({ stock: 50, isAvailable: true })
    expect(res.status).toBe(403)
  })

  it('permits store owner to update product stock and availability', async () => {
    const res = await request(app)
      .patch('/api/v1/catalogue/products/p_maggi')
      .set('Authorization', 'Bearer tok_owner')
      .send({ stock: 25, isAvailable: true })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('p_maggi')
    expect(res.body.stock).toBe(25)
    expect(res.body.isAvailable).toBe(true)
  })

  it('permits admin to update product via RPC endpoint', async () => {
    const res = await request(app)
      .post('/catalogue/products/update')
      .set('Authorization', 'Bearer tok_admin')
      .send({ productId: 'p_milk_500', isAvailable: false })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('p_milk_500')
    expect(res.body.isAvailable).toBe(false)
  })
})
