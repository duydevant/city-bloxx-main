"use client"
import { useEffect, useRef, useState } from "react"
import { browserCloud } from "@/lib/cloud/browser"
import { useCloud } from "@/lib/cloud/use-cloud"
import { guestRaw, parseSave } from "@/lib/cloud/guest"
import { useI18n } from "@/lib/i18n"
import type { CloudStatus } from "@/lib/cloud/coordinator"

const messages: Record<CloudStatus, [string, string]> = {
  loading: ["Opening saved progress…", "Đang mở tiến trình đã lưu…"],
  guest: ["Guest · saved on this device", "Khách · lưu trên thiết bị này"],
  saved: ["Saved locally and in cloud", "Đã lưu trên thiết bị và đám mây"],
  pending: ["Saved locally · cloud pending", "Đã lưu trên thiết bị · chờ đồng bộ"],
  syncing: ["Saved locally · syncing cloud…", "Đã lưu trên thiết bị · đang đồng bộ…"],
  offline: ["Cloud unavailable · local progress kept", "Chưa kết nối đám mây · giữ tiến trình trên thiết bị"],
  auth: ["Account progress kept · sign in to sync", "Giữ tiến trình tài khoản · đăng nhập để đồng bộ"],
  conflict: ["Progress differs · choose a copy", "Tiến trình khác nhau · chọn bản muốn giữ"],
  peer: ["Another tab saved · review progress", "Tab khác đã lưu · xem lại tiến trình"],
  review: ["Account changed · review before continuing", "Tài khoản đã đổi · xem lại trước khi tiếp tục"],
  storage: ["Local save failed · previous copies kept", "Lưu trên thiết bị thất bại · giữ các bản trước"],
  incompatible: [
    "Save version unsupported · original kept",
    "Chưa hỗ trợ phiên bản save · giữ nguyên bản gốc",
  ],
  rejected: [
    "Cloud rejected this save · local copy kept",
    "Đám mây chưa chấp nhận save · giữ bản trên thiết bị",
  ],
}
export function saveSummary(raw: string | null, vi: boolean): string {
  if (!raw) return vi ? "Chưa có bản lưu" : "No save"
  try {
    const save = parseSave(raw)
    const population = save.city.lots.reduce((n, b) => n + (b?.population ?? 0), 0)
    return `${vi ? "Kỷ lục" : "Best"}: ${save.standardQuickBest} · XP: ${save.progression.xp} · ${vi ? "Thành phố" : "City"}: ${population} · City ${save.city.pending ? "●" : "–"} · Daily ${save.daily.pending ? "●" : "–"}`
  } catch {
    return vi
      ? "Bản gốc chưa đọc được; tải xuống để giữ lại."
      : "Original cannot be read; download to preserve it."
  }
}
function download(raw: string, name: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })),
    link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function CloudPanel() {
  const state = useCloud(),
    { locale } = useI18n(),
    vi = locale === "vi",
    i = vi ? 1 : 0
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const critical =
    state.scope !== "guest" &&
    state.locked &&
    state.ready &&
    ["conflict", "peer", "review", "storage"].includes(state.status)
  const open = expanded || critical
  useEffect(() => {
    const show = () => setExpanded(true)
    window.addEventListener("city-bloxx:open-cloud", show)
    return () => window.removeEventListener("city-bloxx:open-cloud", show)
  }, [])
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open) dialog.current?.close()
  }, [open])
  async function action(work: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await work()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const local = state.raw,
    remote = state.remote?.payload ? JSON.stringify(state.remote.payload) : null
  return (
    <>
      <CloudTrigger floating />
      <dialog
        className="auth-dialog cloud-dialog"
        ref={dialog}
        aria-labelledby="cloud-title"
        onCancel={(event) => {
          if (critical) event.preventDefault()
          else setExpanded(false)
        }}
      >
        <div className="auth-stack">
          <h2 id="cloud-title">{vi ? "Tiến trình và đám mây" : "Progress and cloud"}</h2>
          <p role="status">{messages[state.status][i]}</p>
          <p>
            {state.scope === "guest"
              ? vi
                ? "Save Khách tách riêng khỏi mọi tài khoản."
                : "Guest progress is separate from every account."
              : vi
                ? "Save chỉ thuộc tài khoản đã mở. Không cộng dồn XP, thống kê hoặc vật phẩm giữa các bản."
                : "Progress belongs to the opened account. XP, stats and inventory are never added across copies."}
          </p>
          <p>
            <strong>{vi ? "Trên thiết bị" : "On this device"}</strong>
            <br />
            {saveSummary(local, vi)}
          </p>
          {state.remote && (
            <p>
              <strong>{vi ? "Trên đám mây" : "In cloud"}</strong>
              <br />
              {saveSummary(remote, vi)}
              <br />
              {vi ? "Sửa đổi" : "Revision"}: {state.remote.revision} ·{" "}
              {state.remote.updatedAt ? new Date(state.remote.updatedAt).toLocaleString(locale) : "–"}
            </p>
          )}
          {state.status === "review" && (
            <button disabled={busy} onClick={() => void action(() => browserCloud().acceptIdentity())}>
              {vi ? "Mở tiến trình của tài khoản hiện tại" : "Open the current account's progress"}
            </button>
          )}
          {state.remote && state.remote.compatibility !== "incompatible" && (
            <>
              <p>
                {vi
                  ? "Hai bản sẽ được sao lưu trước khi chọn. City và Daily đang dở được giữ nguyên theo bản được chọn."
                  : "Both copies are backed up before selection. Unfinished City and Daily towers stay with the selected copy."}
              </p>
              <button
                disabled={busy || !local}
                onClick={() => void action(() => browserCloud().choose("local"))}
              >
                {vi ? "Giữ bản trên thiết bị" : "Keep this device's copy"}
              </button>
              <button
                disabled={busy || !remote}
                onClick={() => void action(() => browserCloud().choose("cloud"))}
              >
                {vi ? "Dùng bản trên đám mây" : "Use the cloud copy"}
              </button>
            </>
          )}
          {state.status === "peer" && (
            <button disabled={busy} onClick={() => void action(() => browserCloud().reloadLocal())}>
              {vi ? "Mở bản tài khoản vừa được lưu" : "Open the saved account copy"}
            </button>
          )}
          {state.scope && state.scope !== "guest" && state.status !== "review" && (
            <>
              <button disabled={busy} onClick={() => void action(() => browserCloud().retry())}>
                {vi ? "Thử đồng bộ lại" : "Retry cloud sync"}
              </button>
              <button
                disabled={busy || state.status === "incompatible"}
                onClick={() =>
                  void action(async () => {
                    const guest = guestRaw()
                    if (
                      !window.confirm(
                        `${vi ? "Nhập tiến trình Khách thay thế bản tài khoản trên thiết bị? Hai bản sẽ được sao lưu; save Khách vẫn giữ nguyên." : "Import Guest progress to replace this account's device copy? Both copies will be backed up; Guest stays unchanged."}\n${saveSummary(guest, vi)}\n${saveSummary(local, vi)}`,
                      )
                    )
                      return
                    await browserCloud().importGuest()
                  })
                }
              >
                {vi ? "Nhập tiến trình Khách…" : "Import Guest progress…"}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () =>
                    download(
                      JSON.stringify(await browserCloud().backups(), null, 2),
                      "city-bloxx-backups.json",
                    ),
                  )
                }
              >
                {vi ? "Tải các bản sao lưu" : "Download backups"}
              </button>
            </>
          )}
          {local && (
            <button onClick={() => download(local, "city-bloxx-local.json")}>
              {vi ? "Tải bản gốc trên thiết bị" : "Download device original"}
            </button>
          )}
          {remote && (
            <button onClick={() => download(remote, "city-bloxx-cloud.json")}>
              {vi ? "Tải bản gốc đám mây" : "Download cloud original"}
            </button>
          )}
          {state.ready && !["review", "peer"].includes(state.status) && (
            <button
              onClick={() => {
                browserCloud().continueLocal()
                setExpanded(false)
              }}
            >
              {vi ? "Tiếp tục với bản hiện tại trên thiết bị" : "Continue with this device's copy"}
            </button>
          )}
          {!critical && <button onClick={() => setExpanded(false)}>{vi ? "Đóng" : "Close"}</button>}
          {failed && (
            <p role="alert">
              {vi
                ? "Thao tác chưa hoàn tất. Các bản cũ được giữ nguyên; kiểm tra bộ nhớ, mạng và thử lại."
                : "Operation incomplete. Existing copies are kept; check storage, connection and retry."}
            </p>
          )}
        </div>
      </dialog>
    </>
  )
}
export function CloudTrigger({ floating = false }: { floating?: boolean }) {
  const state = useCloud(),
    { locale } = useI18n(),
    label = messages[state.status][locale === "vi" ? 1 : 0]
  return (
    <button
      className={`cloud-status${floating ? " cloud-fallback" : ""}`}
      data-cloud-status={state.status}
      type="button"
      aria-label={label}
      title={label}
      onClick={() => window.dispatchEvent(new Event("city-bloxx:open-cloud"))}
    >
      <span aria-hidden="true">☁</span>
      <span className="cloud-label">{label}</span>
    </button>
  )
}
