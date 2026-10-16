"use client"
import { useEffect, useState, type FormEvent } from "react"
import { browserAuth } from "@/lib/auth/session"
import { useAuthStore } from "@/lib/store/auth.store"
import { useI18n } from "@/lib/i18n"
interface GameProfile {
  publicId: string
  alias: string
  locale: "en" | "vi"
  preferences: { soundEnabled?: boolean; musicEnabled?: boolean; reducedMotion?: boolean }
}
export function GameProfile() {
  const auth = useAuthStore(),
    { locale } = useI18n(),
    vi = locale === "vi"
  return auth.user ? <Editor key={auth.user.id} owner={auth.user.id} vi={vi} /> : null
}
function Editor({ owner, vi }: { owner: string; vi: boolean }) {
  const [profile, setProfile] = useState<GameProfile | null>(null),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    void browserAuth()
      .request<GameProfile>("/city-bloxx/profile")
      .then((p) => {
        if (active) setProfile(p)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [owner])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setFailed(false)
    setSaved(false)
    try {
      const result = await browserAuth().request<GameProfile>("/city-bloxx/profile", {
        method: "PATCH",
        body: JSON.stringify({ alias: form.get("alias"), locale: form.get("locale") }),
      })
      if (browserAuth().snapshot().user?.id === owner) {
        setProfile(result)
        setSaved(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="web-card auth-stack">
      <h2>{vi ? "Hồ sơ trong game" : "Game profile"}</h2>
      {profile && (
        <form
          method="post"
          className="auth-stack"
          onSubmit={submit}
          aria-label={vi ? "Bí danh game" : "Game alias"}
        >
          <label>
            {vi ? "Bí danh công khai" : "Public alias"}
            <input name="alias" minLength={2} maxLength={24} required defaultValue={profile.alias} />
          </label>
          <label>
            {vi ? "Ngôn ngữ hồ sơ game" : "Game profile language"}
            <select name="locale" defaultValue={profile.locale}>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </label>
          <button disabled={busy}>{vi ? "Lưu bí danh" : "Save alias"}</button>
        </form>
      )}
      {saved && <p role="status">{vi ? "Đã lưu bí danh game." : "Game alias saved."}</p>}
      {failed && (
        <p role="alert">
          {vi
            ? "Chưa mở được hồ sơ game. Tiến trình vẫn giữ nguyên."
            : "Game profile unavailable. Progress is preserved."}
        </p>
      )}
    </section>
  )
}
