"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  checkPendingRunGuard,
  createDemoSocialStore,
  downloadPublicReplay,
  getPublicChallenge,
  getPublicProfile,
  getPublicTower,
  getTowerShareCard,
  issueChallengeTicket,
  reportPublicEntity,
  revokeTower,
  validateDisplayName,
} from "@/lib/social";
import { emptySave, type GameSave } from "../../../packages/city-bloxx-core/src/index";

function readLocalSave(): GameSave {
  if (typeof window === "undefined") return emptySave();
  try {
    const raw = window.localStorage.getItem("city-bloxx.quick-save.v2");
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as GameSave;
    return parsed && typeof parsed === "object" ? parsed : emptySave();
  } catch {
    return emptySave();
  }
}

export function PublicTowerPageView({ towerId }: { towerId: string }) {
  const { locale } = useI18n();
  const vi = locale === "vi";
  const [storeVersion, setStoreVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const store = useMemo(() => createDemoSocialStore(), []);

  void storeVersion;
  const tower = getPublicTower(store, towerId);
  const shareCard = tower ? getTowerShareCard(store, towerId, vi ? "vi" : "en") : null;

  if (!tower) {
    return (
      <section data-public-tower-status="unavailable" style={{ padding: "16px 0" }}>
        <h2>{vi ? "Tháp không khả dụng" : "Tower unavailable"}</h2>
        <p>
          {vi
            ? "Tháp này không tồn tại, đã được chủ sở hữu thu hồi hoặc bị ẩn bởi kiểm duyệt."
            : "This published tower was not found, was revoked by its owner, or was hidden by moderation."}
        </p>
        <p>
          <Link href="/leaderboards">{vi ? "Về Bảng xếp hạng" : "Back to Leaderboards"}</Link>
        </p>
      </section>
    );
  }

  const sharePngDataUrl = shareCard
    ? `data:image/png;base64,${typeof Buffer !== "undefined" ? Buffer.from(shareCard.png).toString("base64") : btoa(Array.from(shareCard.png, b => String.fromCharCode(b)).join(""))}`
    : null;

  return (
    <section data-public-tower={tower.id} data-public-tower-status="ready" style={{ padding: "12px 0" }}>
      <div style={{ display: "grid", gap: "12px", maxWidth: "720px" }}>
        <div style={{ padding: "14px", borderRadius: "12px", background: "rgba(15, 23, 42, 0.06)" }}>
          <h2 style={{ margin: "0 0 6px" }}>
            {tower.kind === "daily" ? (vi ? "Tháp Hằng Ngày Đã Xác Minh" : "Verified Daily Tower") : vi ? "Tháp Nhanh Tiêu Chuẩn Đã Xác Minh" : "Verified Quick Standard Tower"}
          </h2>
          <p style={{ margin: "0 0 8px" }}>
            {vi ? "Kiến trúc sư" : "Architect"}:{" "}
            <Link href={`/players/${tower.ownerId}`} data-tower-owner-link={tower.ownerId}>
              <strong>{tower.ownerDisplayName}</strong>
            </Link>{" "}
            <span>({tower.ownerHandle})</span>
          </p>
          <dl
            data-tower-verified-stats
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "8px",
              margin: 0,
            }}
          >
            <div>
              <dt>{vi ? "Dân số" : "Population"}</dt>
              <dd data-tower-population>{tower.result.population}</dd>
            </div>
            <div>
              <dt>{vi ? "Số tầng" : "Floors"}</dt>
              <dd data-tower-height>{tower.result.height}</dd>
            </div>
            <div>
              <dt>{vi ? "Độ chính xác" : "Accuracy"}</dt>
              <dd data-tower-accuracy>{tower.result.accuracy.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>{vi ? "Hạng" : "Rating"}</dt>
              <dd data-tower-rating>{tower.result.rating}</dd>
            </div>
            <div>
              <dt>{vi ? "Phiên bản" : "Version"}</dt>
              <dd data-tower-version>
                {tower.physicsVersion} · {tower.rulesetVersion}
              </dd>
            </div>
          </dl>
        </div>

        {shareCard && sharePngDataUrl && (
          <div data-share-card-preview style={{ padding: "12px", borderRadius: "12px", background: "rgba(15, 23, 42, 0.04)" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              {vi ? `Thẻ chia sẻ PNG (${shareCard.width}×${shareCard.height})` : `Share Card PNG (${shareCard.width}×${shareCard.height})`}
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sharePngDataUrl}
              width={shareCard.width}
              height={shareCard.height}
              alt={shareCard.lines.join(" · ")}
              data-share-card-img
              style={{ width: "100%", maxWidth: "600px", height: "auto", borderRadius: "8px", display: "block" }}
            />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {tower.challengeId && (
            <Link
              href={`/challenges/${tower.challengeId}`}
              data-beat-this-tower-link={tower.challengeId}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: "#f1c84b",
                color: "#1e293b",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {vi ? "Vượt Qua Tháp Này (Beat This Tower)" : "Beat This Tower"}
            </Link>
          )}
          {tower.replayAvailable && (
            <button
              type="button"
              data-download-replay={tower.id}
              onClick={() => {
                const res = downloadPublicReplay(store, {
                  towerId: tower.id,
                  clientKey: "web-viewer",
                  now: Date.now(),
                });
                if (res.ok) {
                  setStatusMessage(
                    vi
                      ? `Đã tải replay xác minh (${res.record.inputs.length} thao tác, ${res.record.endTick} ticks).`
                      : `Verified replay loaded (${res.record.inputs.length} inputs, ${res.record.endTick} ticks).`,
                  );
                } else {
                  setStatusMessage(vi ? "Vượt giới hạn tải replay, vui lòng thử lại sau." : "Replay download rate limit reached.");
                }
              }}
            >
              {vi ? "Tải Replay Xác Minh" : "Download Verified Replay"}
            </button>
          )}
          <button
            type="button"
            data-report-tower={tower.id}
            onClick={() => {
              reportPublicEntity(store, {
                reporterId: "web-visitor",
                targetType: "tower",
                targetId: tower.id,
                reason: "User reported tower from public page",
                now: Date.now(),
              });
              setStatusMessage(vi ? "Đã ghi nhận báo cáo kiểm duyệt." : "Moderation report submitted.");
            }}
          >
            {vi ? "Báo cáo" : "Report"}
          </button>
          <button
            type="button"
            data-revoke-tower={tower.id}
            onClick={() => {
              revokeTower(store, { towerId: tower.id, actorId: tower.ownerId, now: Date.now() });
              setStoreVersion(v => v + 1);
            }}
          >
            {vi ? "Thu hồi công khai (Chủ sở hữu)" : "Revoke Public Access (Owner)"}
          </button>
        </div>

        {statusMessage && (
          <p role="status" data-social-status>
            {statusMessage}
          </p>
        )}
      </div>
    </section>
  );
}

export function PublicPlayerPageView({ playerId }: { playerId: string }) {
  const { locale } = useI18n();
  const vi = locale === "vi";
  const [nameInput, setNameInput] = useState("");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const store = useMemo(() => createDemoSocialStore(), []);
  const profile = getPublicProfile(store, playerId);

  if (!profile) {
    return (
      <section data-public-player-status="unavailable" style={{ padding: "16px 0" }}>
        <h2>{vi ? "Hồ sơ công khai chưa bật hoặc không tồn tại" : "Public profile unavailable or not opted in"}</h2>
        <p>
          {vi
            ? "Người chơi cần chủ động bật hiển thị hồ sơ công khai. Email và dữ liệu lưu trữ đám mây luôn được bảo mật."
            : "Players must explicitly opt in to a public profile. Email addresses and cloud save payloads are never public."}
        </p>
      </section>
    );
  }

  return (
    <section data-public-player={profile.playerId} data-public-player-status="ready" style={{ padding: "12px 0" }}>
      <div style={{ display: "grid", gap: "12px", maxWidth: "720px" }}>
        <div style={{ padding: "14px", borderRadius: "12px", background: "rgba(15, 23, 42, 0.06)" }}>
          <h2 data-player-display-name style={{ margin: "0 0 4px" }}>
            {profile.displayName}
          </h2>
          <p data-player-handle style={{ margin: "0 0 8px", opacity: 0.8 }}>
            {vi ? "Định danh mặc định" : "Default handle"}: <code>{profile.handle}</code>
          </p>
          <p style={{ margin: 0, fontSize: "13px" }}>
            {vi
              ? "Hồ sơ công khai đã chọn tham gia (opt-in) · Không hiển thị email hoặc dữ liệu cloud."
              : "Opt-in public architect profile · Email and cloud save payloads are excluded."}
          </p>
        </div>

        <div>
          <h3>{vi ? "Tháp đã xuất bản" : "Published Towers"}</h3>
          {profile.publishedTowers.length === 0 ? (
            <p>{vi ? "Chưa có tháp công khai nào." : "No published towers yet."}</p>
          ) : (
            <ul style={{ paddingLeft: "18px" }}>
              {profile.publishedTowers.map(t => (
                <li key={t.id}>
                  <Link href={`/towers/${t.id}`}>
                    {t.kind.toUpperCase()} · {t.result.population} {vi ? "dân" : "pop"} · {t.result.height}{" "}
                    {vi ? "tầng" : "floors"} ({t.result.rating})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ padding: "12px", borderRadius: "10px", background: "rgba(15, 23, 42, 0.04)" }}>
          <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
            {vi ? "Kiểm tra tên hiển thị (3–24 ký tự, có kiểm duyệt):" : "Check display name rules (3–24 chars, moderated):"}
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder={vi ? "Nhập tên hiển thị..." : "Enter display name..."}
              data-display-name-input
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #94a3b8" }}
            />
            <button
              type="button"
              data-validate-display-name
              onClick={() => {
                const check = validateDisplayName(nameInput);
                setValidationMsg(
                  check.valid
                    ? vi
                      ? `Hợp lệ: "${check.normalized}"`
                      : `Valid: "${check.normalized}"`
                    : vi
                      ? `Từ chối (${check.reason})`
                      : `Rejected (${check.reason})`,
                );
              }}
            >
              {vi ? "Kiểm tra" : "Validate"}
            </button>
          </div>
          {validationMsg && (
            <p role="status" data-display-name-status style={{ marginTop: "6px" }}>
              {validationMsg}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function PublicChallengePageView({ challengeId }: { challengeId: string }) {
  const { locale } = useI18n();
  const vi = locale === "vi";
  const [confirmPending, setConfirmPending] = useState(false);
  const [ticketState, setTicketState] = useState<string | null>(null);
  const store = useMemo(() => createDemoSocialStore(), []);
  const challenge = getPublicChallenge(store, challengeId);

  if (!challenge) {
    return (
      <section data-public-challenge-status="unavailable" style={{ padding: "16px 0" }}>
        <h2>{vi ? "Thử thách không khả dụng" : "Challenge unavailable"}</h2>
        <p>
          {vi
            ? "Thử thách này không tồn tại hoặc tháp gốc đã bị thu hồi."
            : "This challenge does not exist or its source tower was revoked."}
        </p>
      </section>
    );
  }

  const startChallengeFlow = (confirmed = false) => {
    if (!challenge.versionCompatible) {
      setTicketState(
        vi
          ? "Phiên bản vật lý/luật của thử thách đã ngừng hỗ trợ (retired). Không tự chạy bằng luật khác."
          : "Challenge physics/ruleset version is retired and unavailable. It will not run under mismatched rules.",
      );
      return;
    }
    const localSave = readLocalSave();
    const guard = checkPendingRunGuard(localSave);
    if (guard.requiresConfirmation && !confirmed) {
      setConfirmPending(true);
      return;
    }
    setConfirmPending(false);
    const issued = issueChallengeTicket(store, {
      challengeId: challenge.id,
      challengerId: "challenger-guest",
    });
    if (issued.ok) {
      setTicketState(
        vi
          ? `Đã cấp vé thử thách cùng hạt giống (${issued.ticket.ticketId}) · Phiên bản ${issued.ticket.physicsVersion}.`
          : `Issued same-seed challenge ticket (${issued.ticket.ticketId}) · Version ${issued.ticket.physicsVersion}.`,
      );
    } else {
      setTicketState(`${vi ? "Không thể cấp vé" : "Could not issue ticket"}: ${issued.code}`);
    }
  };

  return (
    <section
      data-public-challenge={challenge.id}
      data-public-challenge-status={challenge.versionCompatible ? "ready" : "version-retired"}
      style={{ padding: "12px 0" }}
    >
      <div style={{ display: "grid", gap: "12px", maxWidth: "720px" }}>
        <div style={{ padding: "14px", borderRadius: "12px", background: "rgba(15, 23, 42, 0.06)" }}>
          <h2 style={{ margin: "0 0 6px" }}>
            {vi ? "Beat This Tower · Thử Thách Cùng Hạt Giống" : "Beat This Tower · Same-Seed Challenge"}
          </h2>
          <p style={{ margin: "0 0 8px" }}>
            {vi ? "Tạo bởi" : "Created by"}: <strong>{challenge.ownerDisplayName}</strong> ·{" "}
            <Link href={`/towers/${challenge.towerId}`}>{vi ? "Xem tháp gốc" : "View source tower"}</Link>
          </p>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "8px",
              margin: 0,
            }}
          >
            <div>
              <dt>{vi ? "Dân số mục tiêu" : "Target Population"}</dt>
              <dd data-challenge-target-pop>{challenge.targetResult.population}</dd>
            </div>
            <div>
              <dt>{vi ? "Số tầng mục tiêu" : "Target Floors"}</dt>
              <dd data-challenge-target-height>{challenge.targetResult.height}</dd>
            </div>
            <div>
              <dt>{vi ? "Độ chính xác" : "Target Accuracy"}</dt>
              <dd data-challenge-target-accuracy>{challenge.targetResult.accuracy.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>{vi ? "Phiên bản" : "Version"}</dt>
              <dd data-challenge-version>
                {challenge.physicsVersion} · {challenge.rulesetVersion}
              </dd>
            </div>
          </dl>
        </div>

        {!challenge.versionCompatible ? (
          <p role="alert" data-challenge-retired-banner style={{ color: "#b91c1c", fontWeight: 600 }}>
            {vi
              ? "Phiên bản thử thách này đã ngừng hỗ trợ (retired). Hệ thống giữ nguyên thông tin lịch sử và không chạy bằng bộ luật mới khác biệt."
              : "This challenge targets a retired ruleset/physics version and is unavailable for live play."}
          </p>
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              data-start-challenge={challenge.id}
              onClick={() => startChallengeFlow(false)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: "#f1c84b",
                color: "#1e293b",
                fontWeight: 700,
              }}
            >
              {vi ? "Nhận vé & Chơi cùng hạt giống" : "Claim Ticket & Play Same Seed"}
            </button>
          </div>
        )}

        {confirmPending && (
          <div
            role="dialog"
            aria-label={vi ? "Xác nhận giữ lượt đang dở" : "Confirm pending construction"}
            data-challenge-pending-confirm
            style={{ padding: "12px", borderRadius: "10px", border: "2px solid #f59e0b" }}
          >
            <p style={{ margin: "0 0 8px" }}>
              {vi
                ? "Bạn đang có công trình City hoặc Daily đang dở. Mở thử thách này sẽ không xoá tiến trình đã lưu của bạn."
                : "You have a pending City or Daily tower saved. Starting this challenge will not erase your pending progress, but please confirm before switching."}
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                data-confirm-challenge-start
                onClick={() => startChallengeFlow(true)}
              >
                {vi ? "Xác nhận bắt đầu thử thách" : "Confirm start challenge"}
              </button>
              <button
                type="button"
                data-cancel-challenge-start
                onClick={() => setConfirmPending(false)}
              >
                {vi ? "Huỷ, giữ nguyên màn hiện tại" : "Cancel"}
              </button>
            </div>
          </div>
        )}

        {ticketState && (
          <p role="status" data-challenge-ticket-status>
            {ticketState}
          </p>
        )}
      </div>
    </section>
  );
}
