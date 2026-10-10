import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'

describe('Health & Readiness Endpoints', () => {
  let app

  beforeEach(() => {
    createMockSupabaseClient({
      locations: [{ id: 'loc_test', name: 'Test Location', is_active: true }],
    })
    app = createApp()
  })

  it('GET /healthz returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.timestamp).toBeDefined()
  })

  it('GET /readyz returns 200 when database probe succeeds', async () => {
    const res = await request(app).get('/readyz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
    expect(res.body.timestamp).toBeDefined()
  })

  it('GET /readyz returns 200 even with an empty locations table (database reachable)', async () => {
    createMockSupabaseClient({ locations: [] })
    const res = await request(app).get('/readyz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('GET /readyz returns 503 when database connectivity fails', async () => {
    // Inject failing Supabase client
    const { setSupabaseAdmin } = await import('../config/supabase.js')
    setSupabaseAdmin({
      from() {
        return {
          select() {
            return {
              limit: async () => ({ data: null, error: { message: 'Connection refused', code: 'ECONNREFUSED' } }),
            }
          },
        }
      },
    })

    const res = await request(app).get('/readyz')
    expect(res.status).toBe(503)
    expect(res.body.status).toBe('not_ready')
    expect(res.body.reason).toContain('Database connectivity probe failed')
  })
})
