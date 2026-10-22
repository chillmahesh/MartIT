import { beforeEach, describe, expect, it } from 'vitest'
import { createMockServer } from './handlers'
import { hasPermission, homePathFor, PERMISSIONS } from '@/utils/permissions'

let server
const login = async (role) => (await server.handle('auth.demoLogin', { role })).token

beforeEach(() => {
  server = createMockServer()
})

describe('permissions', () => {
  it('super admin has every permission and lands in /admin', () => {
    const su = { roles: ['super_admin'], runnerStatus: null }
    for (const p of Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.RUNNER_DELIVER)) {
      expect(hasPermission(su, p)).toBe(true)
    }
    expect(homePathFor(su)).toBe('/admin')
  })
  it('runner role alone is not enough without approval', () => {
    expect(hasPermission({ roles: ['runner'], runnerStatus: 'pending' }, PERMISSIONS.RUNNER_DELIVER)).toBe(false)
    expect(hasPermission({ roles: ['runner'], runnerStatus: 'approved' }, PERMISSIONS.RUNNER_DELIVER)).toBe(true)
  })
  it('customers and runners cannot open the admin console', () => {
    expect(hasPermission({ roles: ['customer', 'runner'], runnerStatus: 'approved' }, PERMISSIONS.ADMIN_ACCESS)).toBe(false)
  })
})

describe('admin endpoints', () => {
  it('reject customers and runners', async () => {
    for (const role of ['customer', 'runner']) {
      const token = await login(role)
      await expect(server.handle('admin.users.list', {}, { token })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
      await expect(server.handle('admin.roles.set', { userId: 'u_customer_1', role: 'super_admin', granted: true }, { token })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
  })

  it('super admin approves a runner applicant, which grants the runner role', async () => {
    const token = await login('super_admin')
    const u = await server.handle('admin.runners.setStatus', { userId: 'u_applicant_1', status: 'approved' }, { token })
    expect(u.roles).toContain('runner')
    expect(u.runnerStatus).toBe('approved')
  })

  it('super admin suspends an approved runner, which revokes the runner role', async () => {
    const token = await login('super_admin')
    // First approve
    await server.handle('admin.runners.setStatus', { userId: 'u_applicant_1', status: 'approved' }, { token })
    // Then suspend
    const suspended = await server.handle('admin.runners.setStatus', { userId: 'u_applicant_1', status: 'suspended' }, { token })
    expect(suspended.roles).not.toContain('runner')
    expect(suspended.runnerStatus).toBe('suspended')
  })

  it('cannot approve someone who never applied', async () => {
    const token = await login('super_admin')
    await expect(server.handle('admin.runners.setStatus', { userId: 'u_customer_1', status: 'approved' }, { token })).rejects.toMatchObject({ code: 'NOT_AN_APPLICANT' })
  })

  it('cannot grant runner role to someone who never applied', async () => {
    const token = await login('super_admin')
    await expect(server.handle('admin.roles.set', { userId: 'u_customer_1', role: 'runner', granted: true }, { token })).rejects.toMatchObject({ code: 'NOT_AN_APPLICANT' })
  })

  it('super admin can grant admin roles but cannot remove the last super admin', async () => {
    const token = await login('super_admin')
    const u = await server.handle('admin.roles.set', { userId: 'u_customer_1', role: 'admin', granted: true }, { token })
    expect(u.roles).toEqual(['customer', 'admin'])
    await expect(server.handle('admin.roles.set', { userId: 'u_super_1', role: 'super_admin', granted: false }, { token })).rejects.toMatchObject({ code: 'SELF_DEMOTION' })
  })

  it('an admin (not super) cannot assign roles', async () => {
    const su = await login('super_admin')
    await server.handle('admin.roles.set', { userId: 'u_customer_1', role: 'admin', granted: true }, { token: su })
    const adminToken = await login('customer') // same account, now with admin
    await expect(server.handle('admin.users.list', {}, { token: adminToken })).resolves.toBeTruthy()
    await expect(server.handle('admin.roles.set', { userId: 'u_customer_1', role: 'super_admin', granted: true }, { token: adminToken })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('runner signup creates an applicant with only customer role until approved', async () => {
    const signupRes = await server.handle('auth.signup', {
      name: 'Applicant Jane',
      email: 'jane.applicant@campus.edu',
      password: 'password123',
      role: 'runner',
    })

    expect(signupRes.user.roles).toEqual(['customer'])
    expect(signupRes.user.runnerStatus).toBe('applicant')
    expect(signupRes.user.roles).not.toContain('runner')

    // Applicant cannot access delivery endpoints
    await expect(
      server.handle('runner.orders.assigned', {}, { token: signupRes.token })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Applicant appears in the admin user list
    const adminToken = await login('super_admin')
    const users = await server.handle('admin.users.list', {}, { token: adminToken })
    const applicantUser = users.find((u) => u.email === 'jane.applicant@campus.edu')
    expect(applicantUser).toBeDefined()
    expect(applicantUser.runnerStatus).toBe('applicant')
    expect(applicantUser.roles).toEqual(['customer'])

    // Admin approves applicant
    const approved = await server.handle(
      'admin.runners.setStatus',
      { userId: applicantUser.id, status: 'approved' },
      { token: adminToken }
    )
    expect(approved.runnerStatus).toBe('approved')
    expect(approved.roles).toContain('customer')
    expect(approved.roles).toContain('runner')

    // Dual-role user can now access runner endpoints
    const runnerOrders = await server.handle(
      'runner.orders.assigned',
      {},
      { token: signupRes.token }
    )
    expect(Array.isArray(runnerOrders)).toBe(true)

    // Admin suspends runner
    const suspended = await server.handle(
      'admin.runners.setStatus',
      { userId: applicantUser.id, status: 'suspended' },
      { token: adminToken }
    )
    expect(suspended.runnerStatus).toBe('suspended')
    expect(suspended.roles).not.toContain('runner')
    expect(suspended.roles).toContain('customer')

    // Suspended runner is blocked from delivery endpoints
    await expect(
      server.handle('runner.orders.assigned', {}, { token: signupRes.token })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // But customer shopping remains intact
    const me = await server.handle('auth.me', {}, { token: signupRes.token })
    expect(me.roles).toContain('customer')
  })
})
