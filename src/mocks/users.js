/**
 * SAMPLE ACCOUNTS for the in-browser mock server only.
 * Roles are assigned here (as a super admin would), never chosen at signup.
 * `demoKey` lets the demo login pick an account; it does not exist in a real backend.
 */
export const SAMPLE_USERS = [
  { id: 'u_customer_1', demoKey: 'customer', name: 'Aarav (sample)', email: 'customer@martit.test', phone: '9876543210', roles: ['customer'], runnerStatus: null, defaultLocationId: 'loc_hostel_b' },
  { id: 'u_runner_1', demoKey: 'runner', name: 'Meera (sample runner)', email: 'runner@martit.test', phone: '9876543211', roles: ['customer', 'runner'], runnerStatus: 'approved', defaultLocationId: 'loc_hostel_a' },
  { id: 'u_applicant_1', name: 'Kabir (sample applicant)', email: 'applicant@martit.test', roles: ['customer'], runnerStatus: 'pending', defaultLocationId: 'loc_library' },
  { id: 'u_super_1', demoKey: 'super_admin', name: 'Super Admin (sample)', email: 'superadmin@martit.test', roles: ['super_admin'], runnerStatus: null, defaultLocationId: null },
]
