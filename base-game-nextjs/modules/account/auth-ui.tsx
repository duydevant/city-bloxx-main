"use client"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useI18n } from "@/lib/i18n"
import { useAuthStore } from "@/lib/store/auth.store"
import { browserAuth } from "@/lib/auth/session"
import { AuthForm, type AuthMode } from "./auth-form"
import { copy } from "./copy"
import { CloudPanel } from "./cloud-panel"
import { RankedPanel } from "./ranked-panel"
import { browserCloud } from "@/lib/cloud/browser"

const AuthUI = createContext<() => void>(() => {})
export const useSignIn = () => useContext(AuthUI)
export function checkpointAccount() {
  window.dispatchEvent(new Event("city-bloxx:checkpoint-account"))
}
export function AuthUIProvider({ children }: { children: React.ReactNode }) {
  const state = useAuthStore(),
    { locale } = useI18n(),
    i = locale === "vi" ? 1 : 0
  const [open, setOpen] = useState(false),
    dialog = useRef<HTMLDialogElement>(null)
  const [dismissed, setDismissed] = useState<typeof state | null>(null)
  const [mode, setMode] = useState<AuthMode>("signIn")
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  useEffect(() => {
    const check = () => {
      if (!document.hidden)
        void browserAuth()
          .revalidate()
          .catch(() => {})
    }
    window.addEventListener("focus", check)
    window.addEventListener("pageshow", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      window.removeEventListener("focus", check)
      window.removeEventListener("pageshow", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [])
  function show() {
    checkpointAccount()
    setMode("signIn")
    setOpen(true)
  }
  return (
    <AuthUI.Provider value={show}>
      {children}
      <CloudPanel />
      <RankedPanel />
      {state.status === "required" && dismissed !== state && (
        <aside className="auth-notice" role="status">
          <span>{copy.required[i]}</span>
          <button type="button" onClick={show}>
            {copy.again[i]}
          </button>
          <button
            type="button"
            onClick={() => {
              void browserCloud().identity("guest", false, true)
              setDismissed(state)
            }}
          >
            {copy.guest[i]}
          </button>
        </aside>
      )}
      <dialog
        ref={dialog}
        className="auth-dialog"
        aria-labelledby="auth-dialog-title"
        onCancel={() => setOpen(false)}
      >
        <button type="button" className="auth-close" onClick={() => setOpen(false)}>
          {copy.close[i]}
        </button>
        <h2 id="auth-dialog-title">{copy[mode][i]}</h2>
        {open && <AuthForm key={mode} mode={mode} onModeChange={setMode} onSignedIn={() => setOpen(false)} />}
      </dialog>
    </AuthUI.Provider>
  )
}
