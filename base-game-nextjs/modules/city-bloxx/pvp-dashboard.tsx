"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Award,
  Building2,
  Coins,
  Crown,
  DoorOpen,
  Flag,
  History,
  Layers,
  Swords,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { createFirebasePvpPort } from "@/lib/pvp/firebase-rtdb"
import {
  emptyPvpGlobalStats,
  type PvpGlobalStats,
  type PvpLeaderboardEntry,
  type PvpRecentMatch,
  type PvpRoomState,
} from "../../../packages/city-bloxx-core/src/pvp"
import { Copy } from "./web-content"

export function PvpDashboard() {
  const [stats, setStats] = useState<PvpGlobalStats>(() => emptyPvpGlobalStats(0))
  const [recentMatches, setRecentMatches] = useState<PvpRecentMatch[]>([])
  const [leaderboard, setLeaderboard] = useState<PvpLeaderboardEntry[]>([])
  const [waitingRooms, setWaitingRooms] = useState<PvpRoomState[]>([])

  useEffect(() => {
    const port = createFirebasePvpPort()
    const unsubscribe = port.subscribeStats
      ? port.subscribeStats((next) => {
          setStats(next.global)
          setRecentMatches(next.recentMatches)
          setLeaderboard(next.leaderboard)
        })
      : () => {}

    const refreshRooms = () => {
      if (port.listWaitingRooms) {
        void port.listWaitingRooms().then(setWaitingRooms).catch(() => {})
      }
    }
    refreshRooms()
    const timer = window.setInterval(refreshRooms, 2000)

    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [])

  const statCards: {
    key: string
    Icon: LucideIcon
    en: string
    vi: string
    value: string
  }[] = [
    {
      key: "online",
      Icon: Users,
      en: "Online Builders",
      vi: "Người chơi Online",
      value: String(stats.onlinePlayers),
    },
    {
      key: "active",
      Icon: Swords,
      en: "Active 1v1 Rooms",
      vi: "Trận 1v1 Đang Đấu",
      value: String(stats.activeMatches),
    },
    {
      key: "completed",
      Icon: Flag,
      en: "Completed Matches",
      vi: "Tổng Trận Hoàn Tất",
      value: String(stats.totalMatchesCompleted),
    },
    {
      key: "wagered",
      Icon: Coins,
      en: "Total Coins Wagered",
      vi: "Tổng Xu Đã Cược",
      value: `${stats.totalCoinsWagered} Coins`,
    },
    {
      key: "biggestPot",
      Icon: Award,
      en: "Biggest Pot Won",
      vi: "Quỹ Cược Lớn Nhất",
      value: `${stats.biggestPotWon} Coins`,
    },
    {
      key: "highestTower",
      Icon: Building2,
      en: "Highest PvP Tower",
      vi: "Tháp PvP Cao Nhất",
      value: `${stats.highestPvpTower}F`,
    },
    {
      key: "totalFloors",
      Icon: Layers,
      en: "Total PvP Floors",
      vi: "Tổng Tầng Đã Xây",
      value: String(stats.totalFloorsBuiltInPvp),
    },
  ]

  return (
    <div className="pvp-dashboard" data-pvp-dashboard="true" style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "12px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "14px 18px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #102433 0%, #1d3b52 100%)",
          color: "#fff",
          border: "1px solid rgba(255, 223, 120, 0.35)",
        }}
      >
        <div>
          <strong style={{ color: "#ffdf78", fontSize: "16px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Zap size={18} aria-hidden="true" />
            <Copy
              en="Google Firebase Realtime Database · Live 1v1 Telemetry"
              vi="Google Firebase Realtime Database · Thống kê Solo 1v1 Trực tiếp"
            />
          </strong>
          <small style={{ color: "#c9dceb", fontSize: "13px", display: "block", marginTop: "3px" }}>
            <Copy
              en="Winner-Takes-All Coin Wager · Both players build until all 3 lives are exhausted."
              vi="Cược Xu Winner-Takes-All · Cả 2 cùng xây đến khi hết sạch 3 mạng, ai cao tầng hơn ăn trọn quỹ cược."
            />
          </small>
        </div>
        <Link
          href="/play?screen=pvp"
          data-pvp-enter-lobby="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            background: "linear-gradient(180deg, #fde047 0%, #f59e0b 100%)",
            color: "#0f172a",
            padding: "10px 18px",
            borderRadius: "11px",
            fontWeight: 800,
            textDecoration: "none",
            fontSize: "14px",
            boxShadow: "0 3px 0 #b45309",
          }}
        >
          <Swords size={17} aria-hidden="true" />
          <Copy en="Enter Solo PvP 1v1 Lobby" vi="Vào Sảnh Đấu Solo PvP 1v1" />
        </Link>
      </div>

      <section
        aria-label="Global PvP Realtime Metrics"
        data-pvp-global-stats="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
          gap: "10px",
        }}
      >
        {statCards.map(({ key, Icon, en, vi, value }) => (
          <div
            key={key}
            data-pvp-stat={key}
            style={{
              background: "#132838",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "12px",
              color: "#fff",
            }}
          >
            <div style={{ fontSize: "12px", color: "#b8cde0", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Icon size={14} aria-hidden="true" style={{ color: "#38bdf8" }} />
              <Copy en={en} vi={vi} />
            </div>
            <strong style={{ fontSize: "22px", color: "#ffdf78", display: "block", marginTop: "4px" }}>
              {value}
            </strong>
          </div>
        ))}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
        <section
          data-pvp-waiting-rooms="true"
          style={{
            background: "#132838",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            padding: "14px",
            color: "#fff",
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontSize: "16px", color: "#ffdf78", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <DoorOpen size={17} aria-hidden="true" />
            <Copy en="Open Waiting Rooms (1-Click Join)" vi="Phòng Đang Chờ Đối Thủ (Vào Ngay)" />
          </h2>
          {waitingRooms.length === 0 ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#b8cde0" }}>
              <Copy
                en="No rooms waiting right now. Click 'Enter Solo PvP 1v1 Lobby' above to create a wager room!"
                vi="Hiện chưa có phòng đang chờ. Nhấn 'Vào Sảnh Đấu Solo PvP 1v1' ở trên để tạo phòng cược mới!"
              />
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {waitingRooms.map((room) => (
                <li
                  key={room.roomId}
                  data-pvp-waiting-room={room.roomCode}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.06)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                    <strong>#{room.roomCode}</strong> · {room.players.p1.name} · <Coins size={13} aria-hidden="true" /> Pot <strong>{room.totalPot}</strong> ({room.stakePerPlayer}/player)
                  </span>
                  <Link
                    href={`/play?screen=pvp&room=${encodeURIComponent(room.roomCode)}`}
                    style={{
                      background: "#f1c84b",
                      color: "#162633",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    <Copy en="Join" vi="Vào Phòng" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          data-pvp-leaderboard="true"
          style={{
            background: "#132838",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            padding: "14px",
            color: "#fff",
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontSize: "16px", color: "#ffdf78", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Trophy size={17} aria-hidden="true" />
            <Copy en="Top PvP Coin Winners & Elo" vi="Bảng Xếp Hạng Đại Gia Thắng Cược & Elo" />
          </h2>
          {leaderboard.length === 0 ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#b8cde0" }}>
              <Copy
                en="Complete a Solo PvP 1v1 match to appear on the live Firebase leaderboard."
                vi="Hoàn thành một trận Solo PvP 1v1 để ghi danh lên bảng xếp hạng Firebase trực tiếp."
              />
            </p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px" }}>
              {leaderboard.map((entry) => (
                <li key={entry.id} data-pvp-leader={entry.id}>
                  <strong>{entry.name}</strong> — <span style={{ color: "#ffdf78" }}>{entry.netCoinsWon >= 0 ? `+${entry.netCoinsWon}` : entry.netCoinsWon} Coins</span> ·{" "}
                  {entry.wins}W-{entry.losses}L · {entry.bestHeight}F · Elo {entry.elo}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section
        data-pvp-recent-matches="true"
        style={{
          background: "#132838",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          padding: "14px",
          color: "#fff",
        }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: "16px", color: "#ffdf78", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <History size={17} aria-hidden="true" />
          <Copy en="Recent 1v1 Matches (Realtime Feed)" vi="Lịch Sử Trận Đấu 1v1 Gần Đây (Trực Tiếp)" />
        </h2>
        {recentMatches.length === 0 ? (
          <p style={{ margin: 0, fontSize: "13px", color: "#b8cde0" }}>
            <Copy en="No completed matches recorded in this session yet." vi="Chưa có trận đấu hoàn tất nào được ghi nhận." />
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentMatches.map((match) => (
              <div
                key={match.id}
                data-pvp-recent-match={match.roomCode}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(255,255,255,0.06)",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                <span>
                  <strong>#{match.roomCode}</strong> ·{" "}
                  <strong style={{ color: match.winnerSlot === "p1" ? "#7ef29d" : "#fff" }}>
                    {match.p1.name} ({match.p1.height}F)
                  </strong>{" "}
                  vs{" "}
                  <strong style={{ color: match.winnerSlot === "p2" ? "#7ef29d" : "#fff" }}>
                    {match.p2.name} ({match.p2.height}F)
                  </strong>
                </span>
                <span style={{ color: "#ffdf78", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <Crown size={14} aria-hidden="true" />
                  {match.winnerSlot === "draw"
                    ? `Draw (Pot ${match.totalPot} Coins)`
                    : `${match.winnerSlot === "p1" ? match.p1.name : match.p2.name} won +${match.totalPot} Coins`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
