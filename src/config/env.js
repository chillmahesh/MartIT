/** Public, non-secret runtime config. Secrets never belong in client code. */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '',
  upiPayeeName: import.meta.env.VITE_UPI_PAYEE_NAME?.trim() || 'MartIT',
  upiPayeeVpa: import.meta.env.VITE_UPI_PAYEE_VPA?.trim() || '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
}

export const isMockBackend = !env.apiBaseUrl
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
