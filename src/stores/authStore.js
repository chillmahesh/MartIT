import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { authService } from '@/services/authService'
import { setTokenProvider, setOnUnauthorizedHandler } from '@/services/api'
import { zustandSafeStorage } from '@/utils/storage'
import { isMockBackend } from '@/config/env'
import { validateSupabaseConfig } from '@/config/supabaseClient'

let authSubscription = null

/**
 * Session state store.
 * Supports both Mock mode (sample accounts) and Remote mode (real Supabase Auth).
 * Cached user object is for UI rendering convenience only; the server independently
 * verifies each permission using the active JWT.
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      session: null,
      user: null,
      isInitialized: false,
      configError: null,

      /**
       * Initializes session state on application mount or refresh.
       */
      async initialize() {
        if (get().isInitialized) return

        // 1. Mock Mode
        if (isMockBackend) {
          set({ isInitialized: true, configError: null })
          return
        }

        // 2. Remote Mode Configuration Check
        const { valid, error } = validateSupabaseConfig()
        if (!valid) {
          set({
            isInitialized: true,
            configError: error,
            token: null,
            session: null,
            user: null,
          })
          return
        }

        // 3. Remote Session Restoration via Supabase
        try {
          const session = await authService.getSession()
          if (session?.access_token) {
            set({ session, token: session.access_token })
            // Authoritative profile & role hydration from backend
            try {
              const profileUser = await authService.me()
              set({ user: profileUser })
            } catch (err) {
              if (
                err.statusCode === 401 ||
                err.code === 'UNAUTHENTICATED' ||
                err.code === 'PROFILE_NOT_FOUND' ||
                err.code === 'ROLE_NOT_FOUND'
              ) {
                await authService.logout().catch(() => {})
                set({ session: null, token: null, user: null })
              }
            }
          } else {
            set({ session: null, token: null, user: null })
          }
        } catch {
          set({ session: null, token: null, user: null })
        }

        // 4. Set up onAuthStateChange listener
        if (!authSubscription) {
          const { data } = authService.onAuthStateChange(async (event, newSession) => {
            if (newSession?.access_token) {
              set({ session: newSession, token: newSession.access_token })
              if (event === 'SIGNED_IN' || !get().user) {
                try {
                  const profileUser = await authService.me()
                  set({ user: profileUser })
                } catch {
                  // Handled by 401 interceptor
                }
              }
            } else if (event === 'SIGNED_OUT') {
              set({ session: null, token: null, user: null })
            }
          })
          authSubscription = data?.subscription
        }

        set({ isInitialized: true, configError: null })
      },

      /**
       * Email/password sign-in.
       */
      async login(email, password) {
        if (isMockBackend) {
          const res = await authService.login(email, password)
          set({ token: res.token, user: res.user, session: null })
          return res.user
        }

        const { session } = await authService.login(email, password)
        set({ session, token: session.access_token })

        // Authoritative hydration from backend
        const profileUser = await authService.me()
        set({ user: profileUser })
        return profileUser
      },

      /**
       * Email/password sign-up.
       */
      async signup(email, password, metadata) {
        const result = await authService.signup(email, password, metadata)
        if (result.session) {
          set({ session: result.session, token: result.session.access_token })
          const profileUser = await authService.me()
          set({ user: profileUser })
          return { user: profileUser, needsConfirmation: false }
        }
        return { user: result.authUser, needsConfirmation: result.needsConfirmation }
      },

      /**
       * Demo login (mock mode only).
       */
      async demoLogin(role) {
        const { token, user } = await authService.demoLogin(role)
        set({ token, user, session: null })
        return user
      },

      /**
       * Password recovery request.
       */
      async forgotPassword(email) {
        return authService.forgotPassword(email)
      },

      /**
       * Sign-out.
       */
      async logout() {
        try {
          await authService.logout()
        } catch {
          // ignore
        }
        set({ token: null, session: null, user: null })
      },

      /**
       * Active token provider function for API requests.
       */
      getToken() {
        const s = get()
        return s.session?.access_token || s.token || null
      },

      hasRole: (role) => Boolean(get().user?.roles?.includes(role)),
    }),
    {
      name: 'martit-session',
      partialize: (s) => (isMockBackend ? { token: s.token, user: s.user } : { user: s.user }),
      storage: createJSONStorage(() => zustandSafeStorage),
    },
  ),
)

// Register token provider with API transport
setTokenProvider(() => useAuthStore.getState().getToken())

// Register 401 unauthorized handler (clears state only if authenticated)
setOnUnauthorizedHandler(() => {
  if (useAuthStore.getState().token || useAuthStore.getState().user) {
    useAuthStore.getState().logout()
  }
})
