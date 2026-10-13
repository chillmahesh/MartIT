import { create } from 'zustand'
import { safeStorage } from '@/utils/storage'

const RUNNER_AVAILABILITY_KEY = 'martit-runner-online'

export const useRunnerStore = create((set, get) => ({
  /**
   * UI/mock availability status.
   * Stored in client safe storage for demo resilience.
   */
  isOnline: safeStorage.get(RUNNER_AVAILABILITY_KEY) !== 'false',
  activeTab: 'all',

  setOnline: (isOnline) => {
    safeStorage.set(RUNNER_AVAILABILITY_KEY, String(isOnline))
    set({ isOnline })
  },

  toggleAvailability: () => {
    const next = !get().isOnline
    safeStorage.set(RUNNER_AVAILABILITY_KEY, String(next))
    set({ isOnline: next })
  },

  setActiveTab: (activeTab) => set({ activeTab }),
}))
