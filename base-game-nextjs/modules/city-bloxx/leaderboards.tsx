"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requestJson } from "@/lib/api/api-client";
import { browserAuth } from "@/lib/auth/session";
import { useAuthStore } from "@/lib/store/auth.store";
import { useI18n } from "@/lib/i18n";
interface Entry {
  publicId: string;
  alias: string;
  rank: string;
  population: string;
  height: number;
  perfectBody: number;
  bodyPlacements: number;
  misses: number;
  simulationTicks: number;
}
interface Page {
  entries: Entry[];
  nextCursor: string | null;
  boardKey: string;
  live: true;
}
export function Leaderboards() {
  const { locale } = useI18n(),
    vi = locale === "vi",
    auth = useAuthStore();
  const [mode, setMode] = useState<"quick" | "daily">("quick"),
    [date, setDate] = useState(""),
    [serverDate, setServerDate] = useState("");
  const [page, setPage] = useState<Page | null>(null),
    [own, setOwn] = useState<Entry | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    let active = true;
    void requestJson<{ dateUTC: string }>("/city-bloxx/daily/today")
      .then((d) => {
        if (active) {
          setServerDate(d.dateUTC);
          setDate(d.dateUTC);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const load = async (cursor?: string) => {
    const generation = ++epoch.current,
      owner = auth.status === "authenticated" ? auth.user?.id : null;
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({
      limit: "20",
      ...(mode === "daily" ? { dateUTC: date || serverDate } : {}),
      ...(cursor ? { cursor } : {}),
    });
    try {
      const result = await requestJson<Page>(
        `/city-bloxx/leaderboards/${mode}?${query}`,
      );
      if (generation !== epoch.current) return;
      setPage(result);
      setOwn(null);
      if (owner && browserAuth().snapshot().user?.id === owner) {
        const mine = await browserAuth().request<{ entry: Entry | null }>(
          `/city-bloxx/leaderboards/${mode}/me?${new URLSearchParams(mode === "daily" ? { dateUTC: date || serverDate } : {})}`,
        );
        if (
          generation === epoch.current &&
          browserAuth().snapshot().user?.id === owner
        )
          setOwn(mine.entry);
      }
    } catch {
      if (generation === epoch.current) setError(true);
    } finally {
      if (generation === epoch.current) setLoading(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(null);
      setOwn(null);
      if (mode !== "daily" || date || serverDate) void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      // This numeric ref invalidates in-flight requests; it is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
    };
  }, [mode, date, serverDate, auth.user?.id, auth.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section
      className="leaderboards"
      aria-label={vi ? "Bảng xếp hạng đã xác minh" : "Verified leaderboards"}
    >
      <p>
        {vi
          ? "Chỉ kết quả do server xác minh. Bảng cập nhật trực tiếp; làm mới từ trang đầu khi thứ hạng thay đổi."
          : "Server-verified results only. Boards are live; refresh from page one when standings change."}
      </p>
      <div className="board-controls">
        <label>
          {vi ? "Chế độ" : "Mode"}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "quick" | "daily")}
          >
            <option value="quick">Quick Standard</option>
            <option value="daily">Daily UTC</option>
          </select>
        </label>
        {mode === "daily" && (
          <label>
            {vi ? "Ngày UTC" : "UTC date"}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void load();
          }}
        >
          {vi ? "Làm mới từ đầu" : "Refresh from start"}
        </button>
      </div>
      {loading && (
        <p role="status">{vi ? "Đang đọc bảng…" : "Loading standings…"}</p>
      )}
      {error && (
        <p role="alert">
          {vi
            ? "Chưa tải được. Kiểm tra kết nối hoặc đợi rồi thử lại; hàng đợi ranked vẫn được giữ."
            : "Could not load. Check the connection or wait and retry; your ranked queue is kept."}
        </p>
      )}
      {auth.status === "authenticated" && (
        <p>
          {vi ? "Của bạn" : "Your standing"}:{" "}
          {own
            ? `#${own.rank} · ${own.population}`
            : vi
              ? "Chưa có kết quả đủ điều kiện"
              : "No eligible result"}
        </p>
      )}
      {page && (
        <>
          <div className="board-scroll">
            <table>
              <caption>
                {mode === "daily" ? `Daily · ${date} UTC` : "Quick Standard"}
              </caption>
              <thead>
                <tr>
                  <th>{vi ? "Hạng" : "Rank"}</th>
                  <th>{vi ? "Tên" : "Alias"}</th>
                  <th>{vi ? "Dân số" : "Population"}</th>
                  <th>{vi ? "Tầng" : "Floors"}</th>
                  <th>Perfect</th>
                  <th>Miss</th>
                  <th>{vi ? "Thời gian" : "Time"}</th>
                </tr>
              </thead>
              <tbody>
                {page.entries.map((e) => (
                  <tr
                    key={e.publicId}
                    aria-current={
                      own?.publicId === e.publicId ? "true" : undefined
                    }
                  >
                    <td>{e.rank}</td>
                    <th scope="row">{e.alias}</th>
                    <td>{e.population}</td>
                    <td>{e.height}</td>
                    <td>
                      {e.perfectBody}/{e.bodyPlacements}
                    </td>
                    <td>{e.misses}</td>
                    <td>{(e.simulationTicks / 60).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!page.entries.length && (
            <p>
              {vi
                ? "Chưa có kết quả đủ điều kiện cho bảng này."
                : "No eligible results for this board yet."}
            </p>
          )}
          {page.nextCursor && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                void load(page.nextCursor!);
              }}
            >
              {vi ? "Trang tiếp" : "Next page"}
            </button>
          )}
        </>
      )}
      <p>
        <Link href="/play">
          {vi
            ? "Chơi xếp hạng trong menu Quick/Daily"
            : "Choose ranked Quick/Daily in the game menu"}
        </Link>
      </p>
    </section>
  );
}
