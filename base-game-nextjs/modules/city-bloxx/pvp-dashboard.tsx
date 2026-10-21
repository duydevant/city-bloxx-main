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
    <div
      className="pvp-dashboard"
      data-pvp-dashboard="true"
      style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}
    >
      <div
        className="web-card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          background:
            "linear-gradient(135deg, var(--game-surface) 0%, var(--game-surface-muted) 100%)",
          borderColor: "var(--game-border-strong)",
        }}
      >
        <div>
          <strong
            style={{
              color: "var(--game-primary)",
              fontSize: "1.02rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: 850,
            }}
          >
            <span className="web-card-icon" aria-hidden="true">
              <Zap size={18} />
            </span>
            <Copy
              en="Google Firebase Realtime Database · Live 1v1 Telemetry"
              vi="Google Firebase Realtime Database · Thống kê Solo 1v1 Trực tiếp"
            />
          </strong>
          <small
            style={{
              color: "var(--game-text-muted)",
              fontSize: "0.86rem",
              display: "block",
              marginTop: "6px",
              fontWeight: 600,
            }}
          >
            <Copy
              en="Winner-Takes-All Coin Wager · Both players build until all 3 lives are exhausted."
              vi="Cược Xu Winner-Takes-All · Cả 2 cùng xây đến khi hết sạch 3 mạng, ai cao tầng hơn ăn trọn quỹ cược."
            />
          </small>
        </div>
        <Link
          href="/play?screen=pvp"
          data-pvp-enter-lobby="true"
          className="web-cta"
          style={{ margin: 0, padding: "10px 18px", fontSize: "0.92rem" }}
        >
          <Swords size={17} aria-hidden="true" />
          <Copy en="Enter Solo PvP 1v1 Lobby" vi="Vào Sảnh Đấu Solo PvP 1v1" />
        </Link>
      </div>

      <section
        aria-label="Global PvP Realtime Metrics"
        data-pvp-global-stats="true"
        className="web-stats"
      >
        {statCards.map(({ key, Icon, en, vi, value }) => (
          <div key={key} data-pvp-stat={key} className="web-stat-card">
            <div className="web-stat-label">
              <Icon size={15} aria-hidden="true" style={{ color: "var(--game-primary)" }} />
              <Copy en={en} vi={vi} />
            </div>
            <strong className="web-stat-value">{value}</strong>
          </div>
        ))}
      </section>

      <div className="web-grid">
        <section data-pvp-waiting-rooms="true" className="web-card">
          <div className="web-card-header">
            <span className="web-card-icon" aria-hidden="true">
              <DoorOpen size={18} />
            </span>
            <h2>
              <Copy
                en="Open Waiting Rooms (1-Click Join)"
                vi="Phòng Đang Chờ Đối Thủ (Vào Ngay)"
              />
            </h2>
          </div>
          {waitingRooms.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              <Copy
                en="No rooms waiting right now. Click 'Enter Solo PvP 1v1 Lobby' above to create a wager room!"
                vi="Hiện chưa có phòng đang chờ. Nhấn 'Vào Sảnh Đấu Solo PvP 1v1' ở trên để tạo phòng cược mới!"
              />
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {waitingRooms.map((room) => (
                <li
                  key={room.roomId}
                  data-pvp-waiting-room={room.roomCode}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                    background: "var(--game-surface-muted)",
                    border: "1px solid var(--game-border)",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    fontSize: "0.88rem",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      flexWrap: "wrap",
                      color: "var(--game-text)",
                    }}
                  >
                    <strong>#{room.roomCode}</strong> · {room.players.p1.name} ·{" "}
                    <Coins size={13} aria-hidden="true" style={{ color: "var(--game-gold-deep)" }} /> Pot{" "}
                    <strong>{room.totalPot}</strong> ({room.stakePerPlayer}/player)
                  </span>
                  <Link
                    href={`/play?screen=pvp&room=${encodeURIComponent(room.roomCode)}`}
                    className="web-badge web-badge-gold"
                    style={{ textDecoration: "none", padding: "6px 12px" }}
                  >
                    <Copy en="Join" vi="Vào Phòng" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-pvp-leaderboard="true" className="web-card">
          <div className="web-card-header">
            <span className="web-card-icon web-card-icon-gold" aria-hidden="true">
              <Trophy size={18} />
            </span>
            <h2>
              <Copy
                en="Top PvP Coin Winners & Elo"
                vi="Bảng Xếp Hạng Đại Gia Thắng Cược & Elo"
              />
            </h2>
          </div>
          {leaderboard.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              <Copy
                en="Complete a Solo PvP 1v1 match to appear on the live Firebase leaderboard."
                vi="Hoàn thành một trận Solo PvP 1v1 để ghi danh lên bảng xếp hạng Firebase trực tiếp."
              />
            </p>
          ) : (
            <ol
              style={{
                margin: 0,
                paddingLeft: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "0.9rem",
              }}
            >
              {leaderboard.map((entry) => (
                <li key={entry.id} data-pvp-leader={entry.id}>
                  <strong>{entry.name}</strong> —{" "}
                  <span style={{ color: "var(--game-primary)", fontWeight: 800 }}>
                    {entry.netCoinsWon >= 0 ? `+${entry.netCoinsWon}` : entry.netCoinsWon} Coins
                  </span>{" "}
                  · {entry.wins}W-{entry.losses}L · {entry.bestHeight}F · Elo {entry.elo}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section data-pvp-recent-matches="true" className="web-card">
        <div className="web-card-header">
          <span className="web-card-icon" aria-hidden="true">
            <History size={18} />
          </span>
          <h2>
            <Copy
              en="Recent 1v1 Matches (Realtime Feed)"
              vi="Lịch Sử Trận Đấu 1v1 Gần Đây (Trực Tiếp)"
            />
          </h2>
        </div>
        {recentMatches.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            <Copy
              en="No completed matches recorded in this session yet."
              vi="Chưa có trận đấu hoàn tất nào được ghi nhận."
            />
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
                  background: "var(--game-surface-muted)",
                  border: "1px solid var(--game-border)",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  fontSize: "0.88rem",
                }}
              >
                <span>
                  <strong>#{match.roomCode}</strong> ·{" "}
                  <strong
                    style={{
                      color:
                        match.winnerSlot === "p1"
                          ? "var(--game-success)"
                          : "var(--game-text)",
                    }}
                  >
                    {match.p1.name} ({match.p1.height}F)
                  </strong>{" "}
                  vs{" "}
                  <strong
                    style={{
                      color:
                        match.winnerSlot === "p2"
                          ? "var(--game-success)"
                          : "var(--game-text)",
                    }}
                  >
                    {match.p2.name} ({match.p2.height}F)
                  </strong>
                </span>
                <span
                  style={{
                    color: "var(--game-primary)",
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Crown size={14} aria-hidden="true" style={{ color: "var(--game-gold-deep)" }} />
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
