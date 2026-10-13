import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'
import { isOriginAllowed, normalizeOrigin } from '../config/cors.js'

describe('CORS and Preflight Regression Tests', () => {
  let app

  beforeEach(() => {
    createMockSupabaseClient({
      users: [
        {
          id: 'usr_customer_1',
          token: 'tok_valid_jwt',
          email: 'student@campus.edu',
          name: 'Campus Student',
        },
      ],
      profiles: [
        {
          id: 'usr_customer_1',
          email: 'student@campus.edu',
          name: 'Campus Student',
          runner_status: null,
          default_location_id: 'loc_hostel_1',
        },
      ],
      userRoles: [
        { user_id: 'usr_customer_1', role: ROLES.CUSTOMER },
      ],
    })

    app = createApp()
  })

  describe('Requirement 1: OPTIONS /auth/me preflight from production origin', () => {
    it('handles OPTIONS /auth/me successfully with status 204 and required CORS headers', async () => {
      const res = await request(app)
        .options('/auth/me')
        .set('Origin', 'https://martit.vercel.app')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization, content-type')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
      expect(res.headers['access-control-allow-credentials']).toBe('true')

      const allowMethods = res.headers['access-control-allow-methods'] || ''
      expect(allowMethods).toContain('POST')
      expect(allowMethods).toContain('GET')
      expect(allowMethods).toContain('OPTIONS')

      const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase()
      expect(allowHeaders).toContain('authorization')
      expect(allowHeaders).toContain('content-type')

      // Preflight must never execute authentication logic or throw 401
      expect(res.body).toEqual({})
    })

    it('handles OPTIONS /api/v1/auth/me REST route preflight successfully', async () => {
      const res = await request(app)
        .options('/api/v1/auth/me')
        .set('Origin', 'https://martit.vercel.app')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
    })
  })

  describe('Requirement 2: Local development origin is permitted', () => {
    it('permits OPTIONS preflight from http://localhost:5173', async () => {
      const res = await request(app)
        .options('/auth/me')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization, content-type')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('permits authenticated POST /auth/me from http://localhost:5173', async () => {
      const res = await request(app)
        .post('/auth/me')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', 'Bearer tok_valid_jwt')
        .send({})

      expect(res.status).toBe(200)
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
      expect(res.body.id).toBe('usr_customer_1')
    })
  })

  describe('Requirement 3: Unapproved origin is not granted access', () => {
    it('rejects preflight from unapproved origin without granting CORS access', async () => {
      const res = await request(app)
        .options('/auth/me')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST')

      expect(res.status).toBe(403)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('rejects POST /auth/me from unapproved origin without granting CORS access', async () => {
      const res = await request(app)
        .post('/auth/me')
        .set('Origin', 'https://malicious-site.com')
        .set('Authorization', 'Bearer tok_valid_jwt')
        .send({})

      expect(res.status).toBe(403)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('rejects deceptive subdomains targeting martit.vercel.app', async () => {
      const res = await request(app)
        .options('/auth/me')
        .set('Origin', 'https://martit.vercel.app.attacker.com')
        .set('Access-Control-Request-Method', 'POST')

      expect(res.status).toBe(403)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('Requirement 4: Unauthenticated /auth/me remains unauthorized', () => {
    it('returns 401 when Authorization header is absent, preserving CORS headers for allowed origin', async () => {
      const res = await request(app)
        .post('/auth/me')
        .set('Origin', 'https://martit.vercel.app')
        .send({})

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHENTICATED')
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('returns 401 when Bearer token is invalid, preserving CORS headers for allowed origin', async () => {
      const res = await request(app)
        .post('/auth/me')
        .set('Origin', 'https://martit.vercel.app')
        .set('Authorization', 'Bearer invalid-token')
        .send({})

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHENTICATED')
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
    })
  })

  describe('Requirement 5: Valid token is handled by existing authentication logic', () => {
    it('returns user profile and roles for valid token from production frontend', async () => {
      const res = await request(app)
        .post('/auth/me')
        .set('Origin', 'https://martit.vercel.app')
        .set('Authorization', 'Bearer tok_valid_jwt')
        .send({})

      expect(res.status).toBe(200)
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
      expect(res.body).toEqual({
        id: 'usr_customer_1',
        name: 'Campus Student',
        email: 'student@campus.edu',
        roles: [ROLES.CUSTOMER],
        runnerStatus: null,
        defaultLocationId: 'loc_hostel_1',
      })
    })

    it('does not trust client-supplied user ID or role in request body', async () => {
      const res = await request(app)
        .post('/auth/me')
        .set('Origin', 'https://martit.vercel.app')
        .set('Authorization', 'Bearer tok_valid_jwt')
        .send({
          id: 'hacked_admin_id',
          roles: ['super_admin'],
        })

      expect(res.status).toBe(200)
      // Must reflect server-verified identity, ignoring forged body fields
      expect(res.body.id).toBe('usr_customer_1')
      expect(res.body.roles).toEqual([ROLES.CUSTOMER])
    })
  })

  describe('Requirement 6: CORS headers are present on relevant error responses', () => {
    it('includes CORS headers on 404 Not Found error responses for allowed origins', async () => {
      const res = await request(app)
        .get('/nonexistent-route')
        .set('Origin', 'https://martit.vercel.app')

      expect(res.status).toBe(404)
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('includes CORS headers on 422 schema validation errors for allowed origins', async () => {
      const res = await request(app)
        .post('/api/v1/delivery/quote')
        .set('Origin', 'https://martit.vercel.app')
        .set('Authorization', 'Bearer tok_valid_jwt')
        .send({ invalid: 'payload' })

      expect(res.status).toBe(422)
      expect(res.headers['access-control-allow-origin']).toBe('https://martit.vercel.app')
    })

    it('never grants CORS headers on error responses to unapproved origins', async () => {
      const res = await request(app)
        .get('/nonexistent-route')
        .set('Origin', 'https://unapproved-hacker.com')

      expect(res.status).toBe(403)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('Preview Deployments & Origin Normalization', () => {
    it('permits official MartIT Vercel preview deployments', async () => {
      const res = await request(app)
        .options('/auth/me')
        .set('Origin', 'https://martit-feat-auth-fix.vercel.app')
        .set('Access-Control-Request-Method', 'POST')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe('https://martit-feat-auth-fix.vercel.app')
    })

    it('normalizes origins with trailing slashes correctly', () => {
      expect(normalizeOrigin('https://martit.vercel.app/')).toBe('https://martit.vercel.app')
      expect(normalizeOrigin('  https://martit.vercel.app///  ')).toBe('https://martit.vercel.app')
      expect(isOriginAllowed('https://martit.vercel.app/')).toBe(true)
      expect(isOriginAllowed('http://localhost:5173/')).toBe(true)
      expect(isOriginAllowed('https://evil.com/')).toBe(false)
    })
  })
})
