import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  hasHydrated: boolean
  setTokens: (accessToken: string, refreshToken: string) => void
  clearTokens: () => void
  setHasHydrated: (value: boolean) => void
}

/** Zustand store cho access/refresh token, persist vào localStorage key "auth-storage".
 * `lib/api/api-client.ts` đọc trực tiếp key này (không qua React) cho interceptor. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearTokens: () => set({ accessToken: null, refreshToken: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
