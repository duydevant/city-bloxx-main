"use client"
import { useMemo } from "react"
import { useI18n } from "@/lib/i18n"
import { useCloud } from "@/lib/cloud/use-cloud"
import { parseSave } from "@/lib/cloud/guest"
export function PersonalPreview() {
  const { locale } = useI18n(),
    vi = locale === "vi",
    state = useCloud()
  const save = useMemo(() => {
    try {
      return state.raw ? parseSave(state.raw) : null
    } catch {
      return null
    }
  }, [state.raw])
  return (
    <section className="web-card" aria-label={vi ? "Tiến trình cá nhân" : "Personal progress"}>
      <h2>
        {state.scope === "guest"
          ? vi
            ? "Tiến trình Khách trên thiết bị"
            : "Guest progress on this device"
          : vi
            ? "Tiến trình tài khoản đang mở"
            : "Opened account progress"}
      </h2>
      {save ? (
        <dl className="web-values">
          <div>
            <dt>{vi ? "Kỷ lục Standard" : "Standard best"}</dt>
            <dd>{save.standardQuickBest}</dd>
          </div>
          <div>
            <dt>{vi ? "Dân số thành phố" : "City population"}</dt>
            <dd>{save.city.lots.reduce((n, b) => n + (b?.population ?? 0), 0)}</dd>
          </div>
        </dl>
      ) : (
        <p>
          {vi
            ? "Chưa mở được tiến trình. Các bản gốc được giữ; dùng bảng lưu để thử lại hoặc tải xuống."
            : "Progress is not open yet. Originals are kept; use the save panel to retry or download."}
        </p>
      )}
    </section>
  )
}
