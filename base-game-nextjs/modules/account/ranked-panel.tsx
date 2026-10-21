"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Play, RefreshCw, Trophy } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useAuthStore } from "@/lib/store/auth.store"
import { useRanked } from "@/lib/ranked/use-ranked"
import { browserRanked } from "@/lib/ranked/browser"
import { checkpointProgress } from "@/lib/cloud/browser"
import type { PublicRun } from "@/lib/ranked/coordinator"

const labels: Record<PublicRun["state"], [string, string]> = {
  starting: ["Waiting for a start ticket", "Đang chờ vé bắt đầu"],
  active: ["Online attempt in progress", "Lượt online đang diễn ra"],
  queued: [
    "Saved on this device · waiting to send",
    "Đã lưu trên thiết bị · chờ gửi",
  ],
  processing: ["Server verification pending", "Đang chờ server xác minh"],
  accepted: ["Server verified", "Server đã xác minh"],
  rejected: [
    "Not verified · personal result kept",
    "Chưa xác minh · giữ kết quả cá nhân",
  ],
  expired: [
    "Ticket expired · personal result kept",
    "Vé hết hạn · giữ kết quả cá nhân",
  ],
  abandoned: [
    "Attempt ended without a submission",
    "Lượt đã dừng, không gửi kết quả",
  ],
}

export function RankedPanel() {
  const state = useRanked(),
    auth = useAuthStore(),
    { locale } = useI18n(),
    i = locale === "vi" ? 1 : 0
  const [open, setOpen] = useState(false),
    [failed, setFailed] = useState(false),
    [now, setNow] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const show = () => {
      void checkpointProgress().finally(() => setOpen(true))
    }
    window.addEventListener("city-bloxx:open-ranked", show)
    return () => window.removeEventListener("city-bloxx:open-ranked", show)
  }, [])

  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      const timer = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(timer)
    }
    dialog.current?.close()
  }, [open])

  const active = state.runs.filter((r) =>
    ["starting", "active", "queued", "processing"].includes(r.state),
  ).length

  const retry = async () => {
    setFailed(false)
    try {
      await browserRanked().retry()
    } catch {
      setFailed(true)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="auth-dialog ranked-dialog"
      aria-labelledby="ranked-title"
      onCancel={() => setOpen(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="ranked-title" className="m-0">
          <Trophy size={22} className="text-amber-500" aria-hidden="true" />
          <span>{i ? "Kết quả xếp hạng" : "Ranked results"}</span>
        </h2>
        <button
          type="button"
          className="auth-close"
          onClick={() => setOpen(false)}
        >
          {i ? "Đóng" : "Close"}
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        {i
          ? "Chọn Quick/Daily xếp hạng trong menu để lấy vé trước khi chơi. Chơi cá nhân, Assist, City và replay không gửi kết quả lên bảng."
          : "Choose Ranked Quick/Daily in the game menu to get a ticket before play. Personal play, Assist, City and replays never submit to boards."}
      </p>
      <p className="text-sm text-muted-foreground">
        {i
          ? "XP, nhiệm vụ và thống kê cá nhân chỉ nhận một lần. Xác minh server chỉ cập nhật kết quả online và bảng xếp hạng."
          : "Personal XP, missions and statistics settle once. Server verification only updates online results and boards."}
      </p>

      <div className="flex flex-wrap items-center gap-3 my-2">
        <Link
          href="/leaderboards"
          className="game-header-pill"
          onClick={() => setOpen(false)}
        >
          <Trophy size={14} aria-hidden="true" />
          <span>{i ? "Xem bảng xếp hạng" : "View leaderboards"}</span>
        </Link>
        <Link
          href="/play"
          className="game-header-play-btn"
          onClick={() => setOpen(false)}
        >
          <Play size={14} aria-hidden="true" />
          <span>{i ? "Chơi" : "Play"}</span>
        </Link>
      </div>

      {(!state.owner ||
        auth.status !== "authenticated" ||
        auth.user?.id !== state.owner) && (
        <p role="status">
          {i
            ? "Đăng nhập tài khoản chủ để gửi hàng đợi đã lưu. Bạn vẫn chơi cá nhân được."
            : "Sign in to the owning account to send its saved queue. Personal play remains available."}{" "}
          <Link href="/sign-in" onClick={() => setOpen(false)}>
            {i ? "Đăng nhập" : "Sign in"}
          </Link>
        </p>
      )}

      {auth.user && !auth.user.emailVerifiedAt && (
        <p>
          <Link href="/resend-verification" onClick={() => setOpen(false)}>
            {i
              ? "Xác minh email để chơi xếp hạng"
              : "Verify email for ranked play"}
          </Link>
        </p>
      )}

      <p role="status">
        {state.issue === "storage" || failed
          ? i
            ? "Chưa ghi được hàng đợi. Giữ trang này và thử lưu lại; kết quả cá nhân vẫn được giữ."
            : "Queue could not be saved. Keep this page open and retry saving; personal results are kept."
          : state.issue === "network"
            ? i
              ? "Mất kết nối · giữ hàng đợi trên thiết bị"
              : "Offline · queue kept on this device"
            : state.issue === "full"
              ? i
                ? "Đã đủ 16 lượt đang chờ/đang chơi. Gửi hoặc kết thúc lượt cũ trước khi bắt đầu."
                : "All 16 pending/active slots are occupied. Send or end an existing attempt before starting."
              : state.issue
                ? i
                  ? "Chưa gửi được. Kiểm tra phiên đăng nhập, kết nối và thời gian thử lại."
                  : "Sending paused. Check sign-in, connection and retry time."
                : `${active}/16 ${i ? "lượt đang chờ/đang chơi" : "pending/active attempts"}`}
      </p>

      {state.owner && (
        <button
          type="button"
          onClick={() => {
            void retry()
          }}
        >
          <RefreshCw size={15} aria-hidden="true" />
          <span>{i ? "Thử lưu/gửi lại" : "Retry saving/sending"}</span>
        </button>
      )}

      <ul className="ranked-list">
        {[...state.runs]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => (
            <li key={r.id} data-ranked-state={r.state}>
              <strong>
                {r.mode === "daily" ? "Daily" : "Quick"} · {labels[r.state][i]}
              </strong>
              {r.localResult && (
                <p>
                  {i ? "Cá nhân" : "Personal"}: {r.localResult.population} ·{" "}
                  {r.localResult.height} {i ? "tầng" : "floors"}
                </p>
              )}
              {r.state === "accepted" && r.verifiedResult && (
                <p>
                  {i ? "Server" : "Server"}: {r.verifiedResult.population} ·{" "}
                  {r.verifiedResult.height} {i ? "tầng" : "floors"} ·{" "}
                  {r.boardEligible
                    ? i
                      ? "Đủ điều kiện bảng"
                      : "Board eligible"
                    : i
                      ? "Ngoài bảng · Daily chưa hoàn tất"
                      : "Outside board · incomplete Daily"}
                </p>
              )}
              {["queued", "processing", "starting"].includes(r.state) &&
                r.retryAt > now &&
                now > 0 && (
                  <p>
                    {i ? "Thử lại sau" : "Retry in"}{" "}
                    {Math.ceil((r.retryAt - now) / 1000)}s
                  </p>
                )}
            </li>
          ))}
      </ul>

      {state.ready && state.runs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {i
            ? "Chưa có lượt xếp hạng trên thiết bị này cho tài khoản hiện tại."
            : "No ranked attempts on this device for the current account."}
        </p>
      )}
    </dialog>
  )
}

export function RankedTrigger() {
  const state = useRanked(),
    { locale } = useI18n(),
    count = state.runs.filter((r) =>
      ["queued", "processing"].includes(r.state),
    ).length
  const label = `${locale === "vi" ? "Xếp hạng" : "Ranked"}${count ? ` · ${count}` : ""}`
  return (
    <button
      className="cloud-status ranked-status"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => window.dispatchEvent(new Event("city-bloxx:open-ranked"))}
    >
      <Trophy className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
      <span className="cloud-label">{label}</span>
    </button>
  )
}
