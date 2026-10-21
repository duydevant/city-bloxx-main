"use client"
import Link from "next/link"
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import { ApiError, type AuthIssue } from "@/lib/api/api-client"
import { emailApi, registerApi, resetApi, verifyApi } from "@/lib/api/auth.api"
import { browserAuth } from "@/lib/auth/session"
import { useI18n } from "@/lib/i18n"
import { useAuthStore } from "@/lib/store/auth.store"
import { copy, errorCopy } from "./copy"
import { cancelIdentityChange, prepareIdentityChange } from "@/lib/cloud/browser"

export type AuthMode = "signIn" | "signUp" | "forgot" | "reset" | "verify" | "resend"
export function AuthForm({
  mode,
  onSignedIn,
  onModeChange,
}: {
  mode: AuthMode
  onSignedIn?: () => void
  onModeChange?: (mode: AuthMode) => void
}) {
  const { locale } = useI18n(),
    index = locale === "vi" ? 1 : 0
  const auth = useAuthStore(),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<string | null>(null)
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const [issue, setIssue] = useState<AuthIssue | null>(null),
    [retryAt, setRetryAt] = useState(0)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [retryAt])
  const token = useRef<string | null>(null),
    tokenRead = useRef(false),
    formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (mode !== "reset" && mode !== "verify") return
    if (tokenRead.current) return
    tokenRead.current = true
    token.current = new URL(location.href).searchParams.get("token")
    // Keep one-time tokens in memory, outside subsequent URLs/Referer and browser history.
    if (location.search) history.replaceState(history.state, "", location.pathname)
  }, [mode])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || Date.now() < retryAt) return
    const fields = new FormData(event.currentTarget)
    const email = String(fields.get("email") ?? "").trim(),
      password = String(fields.get("password") ?? "")
    setBusy(true)
    setIssue(null)
    try {
      if (mode === "signIn") {
        if (
          !window.confirm(
            index
              ? "Mở tiến trình riêng của tài khoản này? Tiến trình hiện tại sẽ được lưu riêng; không tự nhập save Khách."
              : "Open this account's separate progress? Current progress stays separate; Guest is not imported automatically.",
          )
        )
          return
        await prepareIdentityChange()
        await browserAuth().login(email, password)
        formRef.current?.reset()
        onSignedIn?.()
        return
      }
      if (mode === "signUp") {
        const created = await registerApi(
          email,
          password,
          String(fields.get("fullName") ?? "").trim(),
        )
        if (created?.status === "active" && created?.emailVerifiedAt) {
          await prepareIdentityChange()
          await browserAuth().login(email, password)
          formRef.current?.reset()
          onSignedIn?.()
          return
        }
        setDone("registered")
      }
      if (mode === "forgot" || mode === "resend") {
        await emailApi(mode === "forgot" ? "forgot-password" : "resend-verification", email)
        setDone("sent")
      }
      if (mode === "reset" || mode === "verify") {
        if (!token.current || !/^[A-Za-z0-9_-]{43}$/.test(token.current)) throw new ApiError("invalid")
        if (mode === "reset") {
          await resetApi(token.current, password)
          await browserAuth().invalidate()
          setDone("resetDone")
        } else {
          await verifyApi(token.current)
          setDone("verified")
        }
        token.current = null
      }
      formRef.current?.reset()
    } catch (error) {
      if (mode === "signIn") cancelIdentityChange()
      setIssue(error instanceof ApiError ? error.issue : "network")
      if (error instanceof ApiError && error.issue === "rate")
        setRetryAt(Date.now() + (error.retryAfter ?? 60) * 1000)
    } finally {
      setBusy(false)
    }
  }
  const t = (key: keyof typeof copy) => copy[key][index]
  if (mode === "signIn" && auth.status === "authenticated")
    return (
      <section className="auth-stack">
        <p role="status">
          {locale === "vi" ? "Đã đăng nhập: " : "Signed in: "}
          {auth.user?.email}
        </p>
        <Link href="/profile">{locale === "vi" ? "Quản lý tài khoản" : "Manage account"}</Link>
        <p>{t("local")}</p>
      </section>
    )
  return (
    <div className="auth-stack">
      {done ? (
        <p role="status">{t(done as keyof typeof copy)}</p>
      ) : (
        <form
          method="post"
          ref={formRef}
          onSubmit={submit}
          className="auth-stack"
          aria-label={t(mode)}
          data-auth-ready={String(ready)}
        >
          {mode !== "reset" && mode !== "verify" && (
            <label>
              {t("email")}
              <input
                name="email"
                type="email"
                required
                maxLength={255}
                autoComplete="email"
                autoCapitalize="none"
              />
            </label>
          )}
          {mode === "signUp" && (
            <label>
              {t("name")}
              <input name="fullName" maxLength={150} autoComplete="name" />
            </label>
          )}
          {(mode === "signIn" || mode === "signUp" || mode === "reset") && (
            <label>
              {t(mode === "reset" ? "newPassword" : "password")}
              <input
                name="password"
                type="password"
                required
                minLength={mode === "signIn" ? 1 : 12}
                maxLength={128}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                aria-describedby={mode === "signIn" ? undefined : "password-policy"}
              />
            </label>
          )}
          {(mode === "signUp" || mode === "reset") && <p id="password-policy">{t("policy")}</p>}
          <button type="submit" disabled={busy || !ready || seconds > 0}>
            {busy ? t("working") : seconds > 0 ? `${seconds}s` : t(mode)}
          </button>
        </form>
      )}
      {issue && <p role="alert">{errorCopy[issue][index]}</p>}
      <nav className="auth-links" aria-label={locale === "vi" ? "Tài khoản" : "Account"}>
        {(
          [
            ["signIn", "/sign-in"],
            ["signUp", "/sign-up"],
            ["forgot", "/forgot-password"],
            ["resend", "/resend-verification"],
          ] as const
        )
          .filter(([target]) => target !== mode)
          .map(([target, href]) =>
            onModeChange ? (
              <button key={target} type="button" onClick={() => onModeChange(target)}>
                {t(target)}
              </button>
            ) : (
              <Link key={target} href={href}>
                {t(target)}
              </Link>
            ),
          )}
      </nav>
      <p>{t("local")}</p>
      {!onModeChange && <Link href="/play">{t("guest")}</Link>}
    </div>
  )
}
