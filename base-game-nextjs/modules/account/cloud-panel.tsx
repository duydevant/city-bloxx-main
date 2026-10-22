"use client"

import { useEffect, useRef, useState } from "react"
import {
  Cloud,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react"
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
          <div className="flex items-center justify-between gap-2">
            <h2 id="cloud-title" className="m-0">
              <Cloud size={22} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>{vi ? "Tiến trình và đám mây" : "Progress and cloud"}</span>
            </h2>
            {(!critical || state.ready) && (
              <button
                type="button"
                className="auth-close"
                disabled={busy}
                onClick={() => {
                  if (critical) {
                    if (state.status === "peer") {
                      void action(async () => {
                        await browserCloud().reloadLocal()
                        setExpanded(false)
                      })
                      return
                    }
                    browserCloud().continueLocal()
                  }
                  setExpanded(false)
                }}
              >
                {vi ? "Đóng" : "Close"}
              </button>
            )}
          </div>

          <p role="status">{messages[state.status][i]}</p>

          <p className="text-sm text-muted-foreground">
            {state.scope === "guest"
              ? vi
                ? "Save Khách tách riêng khỏi mọi tài khoản."
                : "Guest progress is separate from every account."
              : vi
                ? "Save chỉ thuộc tài khoản đã mở. Không cộng dồn XP, thống kê hoặc vật phẩm giữa các bản."
                : "Progress belongs to the opened account. XP, stats and inventory are never added across copies."}
          </p>

          {/* Side-by-Side Comparison Cards */}
          <div className="cloud-compare-grid">
            <div className="cloud-copy-card">
              <strong>
                <Smartphone size={16} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <span>{vi ? "Trên thiết bị" : "On this device"}</span>
              </strong>
              <span className="text-sm font-medium">{saveSummary(local, vi)}</span>
            </div>

            {state.remote && state.remote.payload !== null && (
              <div className="cloud-copy-card">
                <strong>
                  <Cloud size={16} className="text-amber-500" aria-hidden="true" />
                  <span>{vi ? "Trên đám mây" : "In cloud"}</span>
                </strong>
                <span className="text-sm font-medium">{saveSummary(remote, vi)}</span>
                <span className="cloud-copy-meta">
                  {vi ? "Sửa đổi" : "Revision"}: {state.remote.revision} ·{" "}
                  {state.remote.updatedAt
                    ? new Date(state.remote.updatedAt).toLocaleString(locale)
                    : "–"}
                </span>
              </div>
            )}
          </div>

          {/* Primary Resolution Actions */}
          {state.status === "review" && (
            <button
              className="game-btn-gold"
              disabled={busy}
              onClick={() => void action(() => browserCloud().acceptIdentity())}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                {vi ? "Mở tiến trình của tài khoản hiện tại" : "Open the current account's progress"}
              </span>
            </button>
          )}

          {state.remote && state.remote.payload !== null && state.remote.compatibility !== "incompatible" && (
            <div className="cloud-copy-card">
              <p className="text-xs text-muted-foreground">
                {vi
                  ? "Hai bản sẽ được sao lưu trước khi chọn. City và Daily đang dở được giữ nguyên theo bản được chọn."
                  : "Both copies are backed up before selection. Unfinished City and Daily towers stay with the selected copy."}
              </p>
              <div className="cloud-actions-primary">
                <button
                  disabled={busy || !local}
                  onClick={() => void action(() => browserCloud().choose("local"))}
                >
                  <Smartphone size={15} aria-hidden="true" />
                  <span>{vi ? "Giữ bản trên thiết bị" : "Keep this device's copy"}</span>
                </button>
                <button
                  className="game-btn-gold"
                  disabled={busy || !remote}
                  onClick={() => void action(() => browserCloud().choose("cloud"))}
                >
                  <Cloud size={15} aria-hidden="true" />
                  <span>{vi ? "Dùng bản trên đám mây" : "Use the cloud copy"}</span>
                </button>
              </div>
            </div>
          )}

          {state.status === "peer" && (
            <button
              className="game-btn-gold"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await browserCloud().reloadLocal()
                  setExpanded(false)
                })
              }
            >
              <RefreshCw size={15} aria-hidden="true" />
              <span>{vi ? "Mở bản tài khoản vừa được lưu" : "Open the saved account copy"}</span>
            </button>
          )}

          {state.ready && !["review", "peer"].includes(state.status) && (
            <button
              className="game-btn-gold"
              onClick={() => {
                browserCloud().continueLocal()
                setExpanded(false)
              }}
            >
              <span>
                {vi ? "Tiếp tục với bản hiện tại trên thiết bị" : "Continue with this device's copy"}
              </span>
            </button>
          )}

          {/* Secondary & Advanced Backup / Import Section */}
          <div className="cloud-advanced-details">
            <strong className="text-xs uppercase tracking-wider text-muted-foreground">
              <HardDrive size={13} className="inline mr-1" aria-hidden="true" />
              {vi ? "Đồng bộ & Sao lưu nâng cao" : "Sync & Advanced Backups"}
            </strong>
            <div className="cloud-advanced-actions">
              {state.scope && state.scope !== "guest" && state.status !== "review" && (
                <>
                  <button
                    className="game-btn-secondary"
                    disabled={busy}
                    onClick={() => void action(() => browserCloud().retry())}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>{vi ? "Thử đồng bộ lại" : "Retry cloud sync"}</span>
                  </button>
                  <button
                    className="game-btn-secondary"
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
                    <Upload size={14} aria-hidden="true" />
                    <span>{vi ? "Nhập tiến trình Khách…" : "Import Guest progress…"}</span>
                  </button>
                  <button
                    className="game-btn-secondary"
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
                    <Download size={14} aria-hidden="true" />
                    <span>{vi ? "Tải các bản sao lưu" : "Download backups"}</span>
                  </button>
                </>
              )}
              {local && (
                <button
                  className="game-btn-secondary"
                  onClick={() => download(local, "city-bloxx-local.json")}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>{vi ? "Tải bản gốc trên thiết bị" : "Download device original"}</span>
                </button>
              )}
              {remote && (
                <button
                  className="game-btn-secondary"
                  onClick={() => download(remote, "city-bloxx-cloud.json")}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>{vi ? "Tải bản gốc đám mây" : "Download cloud original"}</span>
                </button>
              )}
            </div>
          </div>

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
      <Cloud className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      <span className="cloud-label">{label}</span>
    </button>
  )
}
