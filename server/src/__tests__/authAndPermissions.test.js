import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'

describe('Authentication & Authorization Endpoints', () => {
  let app
  let state

  beforeEach(() => {
    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_customer', token: 'tok_cust', email: 'customer@campus.edu', name: 'Alice Cust' },
        { id: 'usr_runner', token: 'tok_runner', email: 'runner@campus.edu', name: 'Bob Runner' },
        { id: 'usr_admin', token: 'tok_admin', email: 'admin@campus.edu', name: 'Carol Admin' },
        { id: 'usr_super', token: 'tok_super', email: 'super@campus.edu', name: 'Dave Super' },
        { id: 'usr_applicant', token: 'tok_app', email: 'applicant@campus.edu', name: 'Eve Applicant' },
        { id: 'usr_owner', token: 'tok_owner', email: 'owner@campus.edu', name: 'Sam Owner' },
      ],
      profiles: [
        { id: 'usr_customer', email: 'customer@campus.edu', name: 'Alice Cust', runner_status: null, default_location_id: 'loc_hostel_a' },
        { id: 'usr_runner', email: 'runner@campus.edu', name: 'Bob Runner', runner_status: 'approved', default_location_id: null },
        { id: 'usr_admin', email: 'admin@campus.edu', name: 'Carol Admin', runner_status: null, default_location_id: null },
        { id: 'usr_super', email: 'super@campus.edu', name: 'Dave Super', runner_status: null, default_location_id: null },
        { id: 'usr_applicant', email: 'applicant@campus.edu', name: 'Eve Applicant', runner_status: 'applicant', default_location_id: null },
        { id: 'usr_owner', email: 'owner@campus.edu', name: 'Sam Owner', runner_status: null, default_location_id: null },
      ],
      userRoles: [
        { user_id: 'usr_customer', role: ROLES.CUSTOMER },
        { user_id: 'usr_runner', role: ROLES.RUNNER },
        { user_id: 'usr_admin', role: ROLES.ADMIN },
        { user_id: 'usr_super', role: ROLES.SUPER_ADMIN },
        { user_id: 'usr_applicant', role: ROLES.CUSTOMER },
        { user_id: 'usr_owner', role: ROLES.STORE_OWNER },
      ],
    })
    state = mock.state
    app = createApp()
  })

  it('rejects unauthenticated access to /api/v1/auth/me with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })

  it('rejects invalid bearer token with 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })

  it('returns authenticated user profile for valid customer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer tok_cust')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('usr_customer')
    expect(res.body.name).toBe('Alice Cust')
    expect(res.body.roles).toContain(ROLES.CUSTOMER)
    expect(res.body.defaultLocationId).toBe('loc_hostel_a')
  })

  it('also supports RPC-style POST /auth/me for frontend api.js compatibility', async () => {
    const res = await request(app)
      .post('/auth/me')
      .set('Authorization', 'Bearer tok_cust')
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('usr_customer')
  })

  it('rejects customer accessing admin endpoint /api/v1/admin/users with 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer tok_cust')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('allows admin accessing /api/v1/admin/users with 200', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer tok_admin')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(6)
  })

  it('approves a runner applicant and grants runner role', async () => {
    const res = await request(app)
      .post('/admin/runners/setStatus')
      .set('Authorization', 'Bearer tok_admin')
      .send({ userId: 'usr_applicant', status: 'approved' })

    expect(res.status).toBe(200)
    expect(res.body.runnerStatus).toBe('approved')

    const updatedProfile = state.profiles.find((p) => p.id === 'usr_applicant')
    expect(updatedProfile.runner_status).toBe('approved')

    const hasRunnerRole = (state.user_roles || state.userRoles).some(
      (r) => r.user_id === 'usr_applicant' && r.role === ROLES.RUNNER,
    )
    expect(hasRunnerRole).toBe(true)
  })

  it('prevents approving a user who never applied', async () => {
    const res = await request(app)
      .post('/admin/runners/setStatus')
      .set('Authorization', 'Bearer tok_admin')
      .send({ userId: 'usr_customer', status: 'approved' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOT_AN_APPLICANT')
  })

  it('blocks super admin from self-demoting their own super_admin role with 409', async () => {
    const res = await request(app)
      .post('/admin/roles/set')
      .set('Authorization', 'Bearer tok_super')
      .send({ userId: 'usr_super', role: ROLES.SUPER_ADMIN, granted: false })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SELF_DEMOTION')
  })

  it('blocks store owner from accessing admin user list with 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer tok_owner')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('blocks store owner from modifying user roles with 403', async () => {
    const res = await request(app)
      .post('/admin/roles/set')
      .set('Authorization', 'Bearer tok_owner')
      .send({ userId: 'usr_owner', role: ROLES.ADMIN, granted: true })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('blocks store owner from approving runner applicants with 403', async () => {
    const res = await request(app)
      .post('/admin/runners/setStatus')
      .set('Authorization', 'Bearer tok_owner')
      .send({ userId: 'usr_applicant', status: 'approved' })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('blocks regular admin from assigning roles (only super_admin has ROLES_ASSIGN) with 403', async () => {
    const res = await request(app)
      .post('/admin/roles/set')
      .set('Authorization', 'Bearer tok_admin')
      .send({ userId: 'usr_customer', role: ROLES.ADMIN, granted: true })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('allows super admin to grant admin role to customer', async () => {
    const res = await request(app)
      .post('/admin/roles/set')
      .set('Authorization', 'Bearer tok_super')
      .send({ userId: 'usr_customer', role: ROLES.ADMIN, granted: true })

    expect(res.status).toBe(200)
    expect(res.body.granted).toBe(true)
  })

  it('blocks runner from accessing admin console with 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer tok_runner')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('returns 500 DATABASE_ERROR when profile lookup encounters a database error', async () => {
    state.tableErrors = { profiles: 'connection reset by peer' }
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer tok_cust')

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('DATABASE_ERROR')
  })

  it('returns 500 DATABASE_ERROR when user_roles lookup encounters a database error', async () => {
    state.tableErrors = { user_roles: 'deadlock detected' }
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer tok_cust')

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('DATABASE_ERROR')
  })

  it('returns 401 PROFILE_NOT_FOUND when user profile is missing in the database', async () => {
    state.profiles = state.profiles.filter((p) => p.id !== 'usr_customer')
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer tok_cust')

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('PROFILE_NOT_FOUND')
  })

  it('returns 401 ROLE_NOT_FOUND when user has no assigned roles in user_roles', async () => {
    state.user_roles = state.user_roles.filter((r) => r.user_id !== 'usr_customer')
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer tok_cust')

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('ROLE_NOT_FOUND')
  })
})
