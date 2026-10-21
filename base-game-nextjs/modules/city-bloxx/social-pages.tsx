"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Download,
  Flag,
  ShieldAlert,
  Swords,
  Ticket,
  Trophy,
  UserCheck,
  Share2,
} from "lucide-react";
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
      <section data-public-tower-status="unavailable" className="web-card auth-stack">
        <div className="web-card-header">
          <span className="web-card-icon" aria-hidden="true">
            <Building2 size={18} />
          </span>
          <h2>{vi ? "Tháp không khả dụng" : "Tower unavailable"}</h2>
        </div>
        <p>
          {vi
            ? "Tháp này không tồn tại, đã được chủ sở hữu thu hồi hoặc bị ẩn bởi kiểm duyệt."
            : "This published tower was not found, was revoked by its owner, or was hidden by moderation."}
        </p>
        <p style={{ margin: 0 }}>
          <Link href="/leaderboards" className="web-badge web-badge-primary" style={{ textDecoration: "none", padding: "8px 14px" }}>
            <Trophy size={14} aria-hidden="true" />
            <span>{vi ? "Về Bảng xếp hạng" : "Back to Leaderboards"}</span>
          </Link>
        </p>
      </section>
    );
  }

  const sharePngDataUrl = shareCard
    ? `data:image/png;base64,${typeof Buffer !== "undefined" ? Buffer.from(shareCard.png).toString("base64") : btoa(Array.from(shareCard.png, (b) => String.fromCharCode(b)).join(""))}`
    : null;

  return (
    <section data-public-tower={tower.id} data-public-tower-status="ready">
      <div className="auth-stack" style={{ maxWidth: "780px" }}>
        <div className="web-card">
          <div className="web-card-header">
            <span className="web-card-icon" aria-hidden="true">
              <Building2 size={18} />
            </span>
            <h2>
              {tower.kind === "daily"
                ? vi
                  ? "Tháp Hằng Ngày Đã Xác Minh"
                  : "Verified Daily Tower"
                : vi
                  ? "Tháp Nhanh Tiêu Chuẩn Đã Xác Minh"
                  : "Verified Quick Standard Tower"}
            </h2>
          </div>
          <p style={{ margin: "0 0 12px" }}>
            {vi ? "Kiến trúc sư" : "Architect"}:{" "}
            <Link href={`/players/${tower.ownerId}`} data-tower-owner-link={tower.ownerId}>
              <strong>{tower.ownerDisplayName}</strong>
            </Link>{" "}
            <span>({tower.ownerHandle})</span>
          </p>
          <dl
            data-tower-verified-stats
            className="web-stats"
            style={{ margin: 0 }}
          >
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Dân số" : "Population"}</dt>
              <dd data-tower-population className="web-stat-value" style={{ margin: 0 }}>
                {tower.result.population}
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Số tầng" : "Floors"}</dt>
              <dd data-tower-height className="web-stat-value" style={{ margin: 0 }}>
                {tower.result.height}
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Độ chính xác" : "Accuracy"}</dt>
              <dd data-tower-accuracy className="web-stat-value" style={{ margin: 0 }}>
                {tower.result.accuracy.toFixed(1)}%
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Hạng" : "Rating"}</dt>
              <dd data-tower-rating className="web-stat-value" style={{ margin: 0 }}>
                {tower.result.rating}
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Phiên bản" : "Version"}</dt>
              <dd data-tower-version className="web-stat-value" style={{ margin: 0, fontSize: "0.95rem" }}>
                {tower.physicsVersion} · {tower.rulesetVersion}
              </dd>
            </div>
          </dl>
        </div>

        {shareCard && sharePngDataUrl && (
          <div data-share-card-preview className="web-card">
            <div className="web-card-header">
              <span className="web-card-icon" aria-hidden="true">
                <Share2 size={18} />
              </span>
              <h2>
                {vi
                  ? `Thẻ chia sẻ PNG (${shareCard.width}×${shareCard.height})`
                  : `Share Card PNG (${shareCard.width}×${shareCard.height})`}
              </h2>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sharePngDataUrl}
              width={shareCard.width}
              height={shareCard.height}
              alt={shareCard.lines.join(" · ")}
              data-share-card-img
              style={{
                width: "100%",
                maxWidth: "600px",
                height: "auto",
                borderRadius: "12px",
                display: "block",
                border: "1px solid var(--game-border)",
              }}
            />
          </div>
        )}

        <div className="auth-actions">
          {tower.challengeId && (
            <Link
              href={`/challenges/${tower.challengeId}`}
              data-beat-this-tower-link={tower.challengeId}
              className="web-cta"
              style={{ margin: 0, padding: "10px 18px", fontSize: "0.92rem" }}
            >
              <Swords size={16} aria-hidden="true" />
              <span>{vi ? "Vượt Qua Tháp Này (Beat This Tower)" : "Beat This Tower"}</span>
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
                  setStatusMessage(
                    vi
                      ? "Vượt giới hạn tải replay, vui lòng thử lại sau."
                      : "Replay download rate limit reached.",
                  );
                }
              }}
            >
              <Download size={15} aria-hidden="true" />
              <span>{vi ? "Tải Replay Xác Minh" : "Download Verified Replay"}</span>
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
              setStatusMessage(
                vi ? "Đã ghi nhận báo cáo kiểm duyệt." : "Moderation report submitted.",
              );
            }}
          >
            <Flag size={15} aria-hidden="true" />
            <span>{vi ? "Báo cáo" : "Report"}</span>
          </button>
          <button
            type="button"
            data-revoke-tower={tower.id}
            onClick={() => {
              revokeTower(store, {
                towerId: tower.id,
                actorId: tower.ownerId,
                now: Date.now(),
              });
              setStoreVersion((v) => v + 1);
            }}
          >
            <ShieldAlert size={15} aria-hidden="true" />
            <span>{vi ? "Thu hồi công khai (Chủ sở hữu)" : "Revoke Public Access (Owner)"}</span>
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
      <section data-public-player-status="unavailable" className="web-card auth-stack">
        <div className="web-card-header">
          <span className="web-card-icon" aria-hidden="true">
            <UserCheck size={18} />
          </span>
          <h2>
            {vi
              ? "Hồ sơ công khai chưa bật hoặc không tồn tại"
              : "Public profile unavailable or not opted in"}
          </h2>
        </div>
        <p style={{ margin: 0 }}>
          {vi
            ? "Người chơi cần chủ động bật hiển thị hồ sơ công khai. Email và dữ liệu lưu trữ đám mây luôn được bảo mật."
            : "Players must explicitly opt in to a public profile. Email addresses and cloud save payloads are never public."}
        </p>
      </section>
    );
  }

  return (
    <section data-public-player={profile.playerId} data-public-player-status="ready">
      <div className="auth-stack" style={{ maxWidth: "780px" }}>
        <div className="web-card">
          <div className="web-card-header">
            <span className="web-card-icon" aria-hidden="true">
              <UserCheck size={18} />
            </span>
            <h2 data-player-display-name>{profile.displayName}</h2>
          </div>
          <p data-player-handle style={{ margin: "0 0 8px" }}>
            {vi ? "Định danh mặc định" : "Default handle"}: <code>{profile.handle}</code>
          </p>
          <p style={{ margin: 0, fontSize: "0.88rem" }}>
            {vi
              ? "Hồ sơ công khai đã chọn tham gia (opt-in) · Không hiển thị email hoặc dữ liệu cloud."
              : "Opt-in public architect profile · Email and cloud save payloads are excluded."}
          </p>
        </div>

        <div className="web-card">
          <div className="web-card-header">
            <span className="web-card-icon" aria-hidden="true">
              <Building2 size={18} />
            </span>
            <h2>{vi ? "Tháp đã xuất bản" : "Published Towers"}</h2>
          </div>
          {profile.publishedTowers.length === 0 ? (
            <p style={{ margin: 0 }}>{vi ? "Chưa có tháp công khai nào." : "No published towers yet."}</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "20px", display: "grid", gap: "8px" }}>
              {profile.publishedTowers.map((t) => (
                <li key={t.id}>
                  <Link href={`/towers/${t.id}`}>
                    <strong>{t.kind.toUpperCase()}</strong> · {t.result.population}{" "}
                    {vi ? "dân" : "pop"} · {t.result.height} {vi ? "tầng" : "floors"} ({t.result.rating})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="web-card auth-stack">
          <label>
            <span>
              {vi
                ? "Kiểm tra tên hiển thị (3–24 ký tự, có kiểm duyệt):"
                : "Check display name rules (3–24 chars, moderated):"}
            </span>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={vi ? "Nhập tên hiển thị..." : "Enter display name..."}
              data-display-name-input
            />
          </label>
          <div className="auth-actions">
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
              <UserCheck size={15} aria-hidden="true" />
              <span>{vi ? "Kiểm tra" : "Validate"}</span>
            </button>
          </div>
          {validationMsg && (
            <p role="status" data-display-name-status style={{ margin: 0 }}>
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
      <section data-public-challenge-status="unavailable" className="web-card auth-stack">
        <div className="web-card-header">
          <span className="web-card-icon" aria-hidden="true">
            <Swords size={18} />
          </span>
          <h2>{vi ? "Thử thách không khả dụng" : "Challenge unavailable"}</h2>
        </div>
        <p style={{ margin: 0 }}>
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
    >
      <div className="auth-stack" style={{ maxWidth: "780px" }}>
        <div className="web-card">
          <div className="web-card-header">
            <span className="web-card-icon web-card-icon-gold" aria-hidden="true">
              <Swords size={18} />
            </span>
            <h2>
              {vi
                ? "Beat This Tower · Thử Thách Cùng Hạt Giống"
                : "Beat This Tower · Same-Seed Challenge"}
            </h2>
          </div>
          <p style={{ margin: "0 0 12px" }}>
            {vi ? "Tạo bởi" : "Created by"}: <strong>{challenge.ownerDisplayName}</strong> ·{" "}
            <Link href={`/towers/${challenge.towerId}`}>
              {vi ? "Xem tháp gốc" : "View source tower"}
            </Link>
          </p>
          <dl className="web-stats" style={{ margin: 0 }}>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Dân số mục tiêu" : "Target Population"}</dt>
              <dd data-challenge-target-pop className="web-stat-value" style={{ margin: 0 }}>
                {challenge.targetResult.population}
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Số tầng mục tiêu" : "Target Floors"}</dt>
              <dd data-challenge-target-height className="web-stat-value" style={{ margin: 0 }}>
                {challenge.targetResult.height}
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Độ chính xác" : "Target Accuracy"}</dt>
              <dd data-challenge-target-accuracy className="web-stat-value" style={{ margin: 0 }}>
                {challenge.targetResult.accuracy.toFixed(1)}%
              </dd>
            </div>
            <div className="web-stat-card">
              <dt className="web-stat-label">{vi ? "Phiên bản" : "Version"}</dt>
              <dd data-challenge-version className="web-stat-value" style={{ margin: 0, fontSize: "0.95rem" }}>
                {challenge.physicsVersion} · {challenge.rulesetVersion}
              </dd>
            </div>
          </dl>
        </div>

        {!challenge.versionCompatible ? (
          <p role="alert" data-challenge-retired-banner>
            {vi
              ? "Phiên bản thử thách này đã ngừng hỗ trợ (retired). Hệ thống giữ nguyên thông tin lịch sử và không chạy bằng bộ luật mới khác biệt."
              : "This challenge targets a retired ruleset/physics version and is unavailable for live play."}
          </p>
        ) : (
          <div className="auth-actions">
            <button
              type="button"
              data-start-challenge={challenge.id}
              onClick={() => startChallengeFlow(false)}
              className="web-cta"
              style={{ margin: 0, padding: "10px 18px", fontSize: "0.92rem" }}
            >
              <Ticket size={16} aria-hidden="true" />
              <span>{vi ? "Nhận vé & Chơi cùng hạt giống" : "Claim Ticket & Play Same Seed"}</span>
            </button>
          </div>
        )}

        {confirmPending && (
          <div
            role="dialog"
            aria-label={vi ? "Xác nhận giữ lượt đang dở" : "Confirm pending construction"}
            data-challenge-pending-confirm
            className="web-card"
            style={{ borderColor: "var(--game-warning)" }}
          >
            <p style={{ margin: "0 0 12px" }}>
              {vi
                ? "Bạn đang có công trình City hoặc Daily đang dở. Mở thử thách này sẽ không xoá tiến trình đã lưu của bạn."
                : "You have a pending City or Daily tower saved. Starting this challenge will not erase your pending progress, but please confirm before switching."}
            </p>
            <div className="auth-actions">
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
                className="cloud-btn-secondary"
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

