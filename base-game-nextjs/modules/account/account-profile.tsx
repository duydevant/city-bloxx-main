"use client"
import { useState, type FormEvent } from "react"
import { browserAuth } from "@/lib/auth/session"
import { ApiError, type AuthIssue } from "@/lib/api/api-client"
import { useAuthStore } from "@/lib/store/auth.store"
import { useI18n } from "@/lib/i18n"
import { checkpointAccount, useSignIn } from "./auth-ui"
import { copy, errorCopy } from "./copy"

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
          <h2>{auth.user.email}</h2>
          <p>
            {auth.user.emailVerifiedAt
              ? i
                ? "Email đã xác thực"
                : "Email verified"
              : i
                ? "Email chưa xác thực"
                : "Email not verified"}
          </p>
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
            <button disabled={busy}>{i ? "Lưu thông tin" : "Save details"}</button>
          </form>
          <form method="post" className="auth-stack" onSubmit={password} aria-label={t("reset")}>
            <label>
              {t("currentPassword")}
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              {t("newPassword")}
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p>{t("policy")}</p>
            <button disabled={busy}>{t("reset")}</button>
          </form>
          {confirm ? (
            <div className="auth-stack">
              <p>{t("confirm")}</p>
              <button
                disabled={busy}
                onClick={() => {
                  checkpointAccount()
                  void execute(async () => {
                    try {
                      await browserAuth().logout(confirm === "all")
                    } finally {
                      setConfirm(null)
                    }
                  })
                }}
              >
                {t(confirm === "all" ? "signOutAll" : "signOut")}
              </button>
              <button type="button" onClick={() => setConfirm(null)}>
                {t("cancel")}
              </button>
            </div>
          ) : (
            <div className="auth-links">
              <button onClick={() => setConfirm("one")}>{t("signOut")}</button>
              <button onClick={() => setConfirm("all")}>{t("signOutAll")}</button>
            </div>
          )}
        </>
      ) : (
        <>
          <h2>
            {auth.status === "loading"
              ? i
                ? "Đang kiểm tra phiên…"
                : "Checking session…"
              : i
                ? "Khách"
                : "Guest"}
          </h2>
          <button onClick={showSignIn}>{t("signIn")}</button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {issue && <p role="alert">{errorCopy[issue][i]}</p>}
      <p>{t("local")}</p>
    </section>
  )
}
