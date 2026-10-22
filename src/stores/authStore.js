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
      activeMode: null,
      isInitialized: false,
      configError: null,
      isPasswordRecovery: false,
      recoveryEmail: null,

      /**
       * Updates the active UI mode ('customer' | 'runner') for dual-role sessions.
       */
      setActiveMode: (mode) => set({ activeMode: mode }),

      /**
       * Initializes session state on application mount or refresh.
       */
      async initialize() {
        if (get().isInitialized) return

        // 1. Mock Mode
        if (isMockBackend) {
          if (get().token) {
            try {
              const profileUser = await authService.me()
              set({ user: profileUser })
            } catch {
              // ignore stale session
            }
          }
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
            activeMode: null,
            isPasswordRecovery: false,
            recoveryEmail: null,
          })
          return
        }

        // 3. Remote Session Restoration via Supabase
        try {
          const session = await authService.getSession()
          if (session?.access_token) {
            set({ session, token: session.access_token })
            // If on /reset-password, maintain recovery mode and do not hydrate customer profile
            const isRecoveryPath =
              typeof window !== 'undefined' &&
              (window.location.pathname.includes('reset-password') ||
                window.location.hash.includes('type=recovery'))

            if (!isRecoveryPath && !get().isPasswordRecovery) {
              // Authoritative profile & role hydration from backend
              try {
                let profileUser = await authService.me()
                if (
                  session?.user?.user_metadata?.role === 'runner' &&
                  profileUser?.runnerStatus == null &&
                  !profileUser?.roles?.includes('runner')
                ) {
                  await authService.applyRunner()
                  profileUser = await authService.me()
                }
                set({ user: profileUser })
              } catch (err) {
                if (
                  err.statusCode === 401 ||
                  err.status === 401 ||
                  err.code === 'UNAUTHENTICATED' ||
                  err.code === 'PROFILE_NOT_FOUND' ||
                  err.code === 'ROLE_NOT_FOUND'
                ) {
                  await authService.logout().catch(() => {})
                  set({ session: null, token: null, user: null, activeMode: null })
                }
              }
            } else {
              set({
                user: null,
                isPasswordRecovery: true,
                recoveryEmail: session?.user?.email || null,
              })
            }
          } else {
            set({ session: null, token: null, user: null, activeMode: null })
          }
        } catch {
          set({ session: null, token: null, user: null, activeMode: null })
        }

        // 4. Set up onAuthStateChange listener
        if (!authSubscription) {
          const { data } = authService.onAuthStateChange(async (event, newSession) => {
            if (event === 'PASSWORD_RECOVERY') {
              // Supabase emitted recovery event
              set({
                session: newSession,
                token: newSession?.access_token || null,
                user: null, // Critical: do NOT treat recovery session as normal logged-in user
                isPasswordRecovery: true,
                recoveryEmail: newSession?.user?.email || null,
              })
              return
            }

            if (newSession?.access_token) {
              if (!get().isPasswordRecovery) {
                set({ session: newSession, token: newSession.access_token })
                if (event === 'SIGNED_IN' || !get().user) {
                  try {
                    let profileUser = await authService.me()
                    if (
                      newSession?.user?.user_metadata?.role === 'runner' &&
                      profileUser?.runnerStatus == null &&
                      !profileUser?.roles?.includes('runner')
                    ) {
                      await authService.applyRunner()
                      profileUser = await authService.me()
                    }
                    set({ user: profileUser })
                  } catch {
                    // Handled by 401 interceptor
                  }
                }
              }
            } else if (event === 'SIGNED_OUT') {
              set({
                session: null,
                token: null,
                user: null,
                activeMode: null,
                isPasswordRecovery: false,
                recoveryEmail: null,
              })
            }
          })
          authSubscription = data?.subscription
        }

        set({ isInitialized: true, configError: null })
      },

      /**
       * Email/password sign-in.
       * Separates authoritative Supabase authentication from backend profile hydration.
       */
      async login(email, password) {
        if (isMockBackend) {
          const res = await authService.login(email, password)
          set({ token: res.token, user: res.user, session: null })
          return res.user
        }

        // Stage 1: Supabase authentication
        let authResult
        try {
          authResult = await authService.login(email, password)
        } catch (authErr) {
          authErr.authStage = 'supabase_auth'
          throw authErr
        }

        const { session } = authResult
        set({ session, token: session.access_token, user: null, isPasswordRecovery: false })

        // Stage 2: Authoritative profile & role hydration from backend
        try {
          let profileUser = await authService.me()
          if (
            authResult?.authUser?.user_metadata?.role === 'runner' &&
            profileUser?.runnerStatus == null &&
            !profileUser?.roles?.includes('runner')
          ) {
            try {
              await authService.applyRunner()
              profileUser = await authService.me()
            } catch {
              // ignore
            }
          }
          set({ user: profileUser })
          return profileUser
        } catch (hydrationErr) {
          hydrationErr.authStage = 'profile_hydration'
          if (
            hydrationErr.status === 401 ||
            hydrationErr.statusCode === 401 ||
            hydrationErr.code === 'UNAUTHENTICATED'
          ) {
            await authService.logout().catch(() => {})
            set({ session: null, token: null, user: null, activeMode: null })
          }
          throw hydrationErr
        }
      },

      /**
       * Retries fetching profile from backend for an authenticated Supabase session.
       */
      async hydrateProfile() {
        const token = get().getToken()
        if (!token) {
          throw new ApiError('NO_SESSION', 'No active authentication session to hydrate.', 401)
        }

        try {
          const profileUser = await authService.me()
          set({ user: profileUser })
          return profileUser
        } catch (err) {
          err.authStage = 'profile_hydration'
          if (
            err.status === 401 ||
            err.statusCode === 401 ||
            err.code === 'UNAUTHENTICATED'
          ) {
            await authService.logout().catch(() => {})
            set({ session: null, token: null, user: null })
          }
          throw err
        }
      },

      /**
       * Email/password sign-up.
       */
      async signup(email, password, metadata) {
        const result = await authService.signup(email, password, metadata)
        if (result.session) {
          set({ session: result.session, token: result.session.access_token })
          if (metadata?.role === 'runner') {
            await authService.applyRunner()
          }
          const profileUser = await authService.me()
          set({ user: profileUser })
          return { user: profileUser, needsConfirmation: false }
        }
        return { user: result.authUser, needsConfirmation: result.needsConfirmation }
      },

      /**
       * Submits runner application for current user and updates local user state.
       */
      async applyForRunner() {
        const updated = await authService.applyRunner()
        set({ user: updated })
        return updated
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
       * Submits new password via Supabase Auth updateUser.
       */
      async updatePassword(newPassword) {
        return authService.updatePassword(newPassword)
      },

      /**
       * Clears password recovery state.
       */
      clearRecoveryState() {
        set({ isPasswordRecovery: false, recoveryEmail: null })
      },

      /**
       * Forces a re-fetch of the authoritative profile from authService.me()
       * to pick up external SQL role or status promotions without re-login.
       */
      async refreshProfile() {
        try {
          const profileUser = await authService.me()
          set({ user: profileUser })
          return profileUser
        } catch (err) {
          if (
            err.status === 401 ||
            err.statusCode === 401 ||
            err.code === 'UNAUTHENTICATED'
          ) {
            await authService.logout().catch(() => {})
            set({ session: null, token: null, user: null, activeMode: null })
          }
          throw err
        }
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
        set({
          token: null,
          session: null,
          user: null,
          activeMode: null,
          isPasswordRecovery: false,
          recoveryEmail: null,
        })
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
      partialize: (s) =>
        isMockBackend
          ? { token: s.token, user: s.user, activeMode: s.activeMode }
          : { user: s.user, activeMode: s.activeMode },
      storage: createJSONStorage(() => zustandSafeStorage),
    },
  ),
)

export function resetAuthSubscriptionForTesting() {
  if (authSubscription?.unsubscribe) {
    authSubscription.unsubscribe()
  }
  authSubscription = null
}

// Register token provider with API transport
setTokenProvider(() => useAuthStore.getState().getToken())

// Register 401 unauthorized handler (clears state only if authenticated)
setOnUnauthorizedHandler(() => {
  if (useAuthStore.getState().token || useAuthStore.getState().user) {
    useAuthStore.getState().logout()
  }
})
