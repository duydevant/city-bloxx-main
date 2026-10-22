"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { KeyRound, ShieldAlert } from "lucide-react"
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
    pathname = usePathname(),
    isEmbed = pathname?.startsWith("/embed") ?? false,
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
      {!isEmbed && <CloudPanel />}
      {!isEmbed && <RankedPanel />}
      {!isEmbed && state.status === "required" && dismissed !== state && (
        <aside className="auth-notice" role="status">
          <ShieldAlert size={18} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{copy.required[i]}</span>
          <button type="button" onClick={show}>
            {copy.again[i]}
          </button>
          <button
            type="button"
            className="game-btn-secondary"
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
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 id="auth-dialog-title" className="m-0">
            <KeyRound size={20} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <span>{copy[mode][i]}</span>
          </h2>
          <button
            type="button"
            className="auth-close"
            onClick={() => setOpen(false)}
          >
            {copy.close[i]}
          </button>
        </div>
        {open && (
          <AuthForm
            key={mode}
            mode={mode}
            onModeChange={setMode}
            onSignedIn={() => setOpen(false)}
          />
        )}
      </dialog>
    </AuthUI.Provider>
  )
}
