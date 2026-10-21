"use client"

import { useMemo } from "react"
import { Cloud, Sparkles, Trophy, Users } from "lucide-react"
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
        <Cloud size={20} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <span>
          {state.scope === "guest"
            ? vi
              ? "Tiến trình Khách trên thiết bị"
              : "Guest progress on this device"
            : vi
              ? "Tiến trình tài khoản đang mở"
              : "Opened account progress"}
        </span>
      </h2>
      {save ? (
        <dl className="web-values">
          <div>
            <dt>
              <Trophy size={14} className="text-amber-500" aria-hidden="true" />
              <span>{vi ? "Kỷ lục Standard" : "Standard best"}</span>
            </dt>
            <dd>{save.standardQuickBest}</dd>
          </div>
          <div>
            <dt>
              <Users size={14} className="text-sky-500" aria-hidden="true" />
              <span>{vi ? "Dân số thành phố" : "City population"}</span>
            </dt>
            <dd>{save.city.lots.reduce((n, b) => n + (b?.population ?? 0), 0)}</dd>
          </div>
          <div>
            <dt>
              <Sparkles size={14} className="text-purple-500" aria-hidden="true" />
              <span>XP</span>
            </dt>
            <dd>{save.progression.xp}</dd>
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
