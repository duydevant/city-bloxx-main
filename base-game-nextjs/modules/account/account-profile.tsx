"use client"

import { useState, type FormEvent } from "react"
import {
  CheckCircle2,
  KeyRound,
  LogIn,
  LogOut,
  Save,
  ShieldAlert,
  User,
} from "lucide-react"
import { browserAuth } from "@/lib/auth/session"
import { ApiError, type AuthIssue } from "@/lib/api/api-client"
import { useAuthStore } from "@/lib/store/auth.store"
import { useI18n } from "@/lib/i18n"
import { checkpointAccount, useSignIn } from "./auth-ui"
import { copy, errorCopy } from "./copy"
import { cancelIdentityChange, prepareIdentityChange } from "@/lib/cloud/browser"

export function AccountProfile() {
  const auth = useAuthStore(),
    showSignIn = useSignIn(),
    { locale } = useI18n(),
    i = locale === "vi" ? 1 : 0
  const [busy, setBusy] = useState(false),
    [issue, setIssue] = useState<AuthIssue | null>(null),
    [message, setMessage] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<"one" | "all" | null>(null)
  const t = (key: keyof typeof copy) => copy[key][i]

  async function execute(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setIssue(null)
    setMessage(null)
    try {
      await work()
    } catch (error) {
      setIssue(error instanceof ApiError ? error.issue : "network")
    } finally {
      setBusy(false)
    }
  }

  function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void execute(async () => {
      await browserAuth().request("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: String(data.get("fullName") ?? "").trim(),
          ...(data.get("username") ? { username: String(data.get("username")).trim() } : {}),
        }),
      })
      await browserAuth().revalidate()
      setMessage(t("saved"))
    })
  }

  function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget,
      data = new FormData(form)
    void execute(async () => {
      await browserAuth().request("/users/me/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        }),
      })
      form.reset()
      await browserAuth().invalidate()
      setMessage(t("resetDone"))
    })
  }

  return (
    <section className="web-card auth-stack">
      {auth.user ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>
              <User size={20} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>{auth.user.email}</span>
            </h2>
            <span
              className={`game-badge ${auth.user.emailVerifiedAt ? "game-badge-success" : "game-badge-warning"}`}
            >
              {auth.user.emailVerifiedAt ? (
                <CheckCircle2 size={14} aria-hidden="true" />
              ) : (
                <ShieldAlert size={14} aria-hidden="true" />
              )}
              <span>
                {auth.user.emailVerifiedAt
                  ? i
                    ? "Email đã xác thực"
                    : "Email verified"
                  : i
                    ? "Email chưa xác thực"
                    : "Email not verified"}
              </span>
            </span>
          </div>

          <form
            method="post"
            className="auth-stack"
            onSubmit={profile}
            key={auth.user.id}
            aria-label={i ? "Thông tin tài khoản" : "Account details"}
          >
            <label>
              {i ? "Họ tên" : "Full name"}
              <input
                name="fullName"
                maxLength={150}
                autoComplete="name"
                defaultValue={auth.user.fullName ?? ""}
              />
            </label>
            <label>
              {i ? "Tên người dùng" : "Username"}
              <input
                name="username"
                minLength={3}
                maxLength={50}
                pattern="[a-zA-Z0-9_.\-]{3,50}"
                autoComplete="username"
                defaultValue={auth.user.username ?? ""}
              />
            </label>
            <button disabled={busy}>
              <Save size={15} aria-hidden="true" />
              <span>{i ? "Lưu thông tin" : "Save details"}</span>
            </button>
          </form>

          <hr className="border-border my-1" />

          <form
            method="post"
            className="auth-stack"
            onSubmit={password}
            aria-label={t("reset")}
          >
            <label>
              <span className="inline-flex items-center gap-1.5">
                <KeyRound size={14} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
                {t("currentPassword")}
              </span>
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              <span className="inline-flex items-center gap-1.5">
                <KeyRound size={14} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
                {t("newPassword")}
              </span>
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p className="text-xs text-muted-foreground">{t("policy")}</p>
            <button disabled={busy}>
              <KeyRound size={15} aria-hidden="true" />
              <span>{t("reset")}</span>
            </button>
          </form>

          <hr className="border-border my-1" />

          {confirm ? (
            <div className="cloud-copy-card">
              <p className="text-sm font-medium">{t("confirm")}</p>
              <div className="auth-links">
                <button
                  className="game-btn-danger"
                  disabled={busy}
                  onClick={() => {
                    checkpointAccount()
                    void execute(async () => {
                      try {
                        await prepareIdentityChange("logout")
                        await browserAuth().logout(confirm === "all")
                      } finally {
                        cancelIdentityChange()
                        setConfirm(null)
                      }
                    })
                  }}
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>{t(confirm === "all" ? "signOutAll" : "signOut")}</span>
                </button>
                <button
                  type="button"
                  className="game-btn-secondary"
                  onClick={() => setConfirm(null)}
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="auth-links">
              <button
                type="button"
                className="game-btn-secondary"
                onClick={() => setConfirm("one")}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>{t("signOut")}</span>
              </button>
              <button
                type="button"
                className="game-btn-secondary"
                onClick={() => setConfirm("all")}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>{t("signOutAll")}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <h2>
            <User size={20} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <span>
              {auth.status === "loading"
                ? i
                  ? "Đang kiểm tra phiên…"
                  : "Checking session…"
                : i
                  ? "Khách"
                  : "Guest"}
            </span>
          </h2>
          <button className="game-btn-gold" onClick={showSignIn}>
            <LogIn size={16} aria-hidden="true" />
            <span>{t("signIn")}</span>
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {issue && <p role="alert">{errorCopy[issue][i]}</p>}
      <p className="text-xs text-muted-foreground">{t("local")}</p>
    </section>
  )
}
