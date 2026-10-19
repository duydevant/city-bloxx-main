import type { ClassId, Difficulty } from "./progression";

export type WeeklyContractKind = "landed" | "perfect" | "finite-complete" | "city-accepted";

export interface WeeklyContractDefinition {
  id: string;
  version: "weekly-contracts-1";
  slot: Difficulty;
  kind: WeeklyContractKind;
  target: number;
  xp: number;
  nonAssist: boolean;
  cityClass: ClassId | null;
  title: { en: string; vi: string };
}

export const WEEKLY_CONTRACT_CATALOG: readonly WeeklyContractDefinition[] = Object.freeze([
  {
    id: "weekly-land-200",
    version: "weekly-contracts-1",
    slot: "easy",
    kind: "landed",
    target: 200,
    xp: 200,
    nonAssist: false,
    cityClass: null,
    title: {
      en: "Land 200 scored body floors this week",
      vi: "Đáp 200 tầng thân được chấm trong tuần",
    },
  },
  {
    id: "weekly-perfect-50",
    version: "weekly-contracts-1",
    slot: "medium",
    kind: "perfect",
    target: 50,
    xp: 300,
    nonAssist: true,
    cityClass: null,
    title: {
      en: "Place 50 Perfect body floors (Non-Assist)",
      vi: "Đặt 50 tầng thân Hoàn hảo (Không Hỗ trợ)",
    },
  },
  {
    id: "weekly-finite-5",
    version: "weekly-contracts-1",
    slot: "hard",
    kind: "finite-complete",
    target: 5,
    xp: 400,
    nonAssist: false,
    cityClass: null,
    title: {
      en: "Complete 5 finite towers (Daily, City or Sprint)",
      vi: "Hoàn thành 5 tháp hữu hạn (Daily, City hoặc Sprint)",
    },
  },
]);

export const PERFECT_RUSH_RECIPE = Object.freeze({
  presetId: "perfect-rush-v1",
  rulesetVersion: "perfect-rush-1",
  classId: "residential",
  roofEnabled: false,
  lives: 3,
  deadlineTick: 3600,
  maxGraceTicks: 180,
  maxEndTick: 3780,
  objective: "perfect-count",
} as const);

export const SKYLINE_SPRINT_RECIPE = Object.freeze({
  presetId: "skyline-sprint-v1",
  rulesetVersion: "skyline-sprint-1",
  classId: "residential",
  targetBodyFloors: 20,
  roofEnabled: false,
  lives: 3,
  missPenaltyTicks: 300,
  objective: "time",
} as const);

export type EventGoalKind = "landed" | "perfect" | "daily-complete";

export interface EventGoalDefinition {
  id: string;
  kind: EventGoalKind;
  target: number;
  nonAssist: boolean;
  xp: number;
  rewardCosmeticId: string;
  title: { en: string; vi: string };
}

export interface WinterEventManifest {
  id: string;
  version: "event-1";
  startsAtUTC: string;
  endsAtUTC: string;
  runGraceHours: number;
  claimGraceDays: number;
  title: { en: string; vi: string };
  goals: readonly EventGoalDefinition[];
}

export interface SeasonTierDefinition {
  tier: number;
  spRequired: number;
  xp: number;
  cosmeticId: string | null;
  title: { en: string; vi: string };
}

export interface FreeSeasonManifest {
  id: string;
  version: "season-1";
  startsAtUTC: string;
  endsAtUTC: string;
  runGraceHours: number;
  claimGraceDays: number;
  tierCount: 20;
  spPerTier: 100;
  spSources: {
    firstDailyCompletePerDay: 20;
    dailyMissionClaim: 10;
    weeklyContractClaim: 50;
  };
  title: { en: string; vi: string };
  tiers: readonly SeasonTierDefinition[];
}

export interface LiveOpsKillSwitch {
  weeklyDisabled: boolean;
  rushDisabled: boolean;
  sprintDisabled: boolean;
  eventsDisabled: boolean;
  seasonDisabled: boolean;
}

export interface LiveOpsManifest {
  version: "liveops-1";
  revision: string;
  publishedAtUTC: string;
  ttlSeconds: number;
  killSwitch: LiveOpsKillSwitch;
  winterEvent: WinterEventManifest;
  freeSeason: FreeSeasonManifest;
}

const SEASON_TIERS: readonly SeasonTierDefinition[] = Object.freeze(
  Array.from({ length: 20 }, (_, index) => {
    const tier = index + 1;
    const isEven = tier % 2 === 0;
    const xp = isEven ? 100 : 50;
    const cosmeticId = tier === 10 ? "season-badge" : tier === 20 ? "season-crane" : null;
    return Object.freeze({
      tier,
      spRequired: tier * 100,
      xp,
      cosmeticId,
      title: {
        en: cosmeticId === "season-badge"
          ? `Tier ${tier} · +${xp} XP & Season 1 Badge`
          : cosmeticId === "season-crane"
            ? `Tier ${tier} · +${xp} XP & Golden Crane`
            : `Tier ${tier} · +${xp} XP`,
        vi: cosmeticId === "season-badge"
          ? `Bậc ${tier} · +${xp} XP & Huy hiệu Mùa 1`
          : cosmeticId === "season-crane"
            ? `Bậc ${tier} · +${xp} XP & Cần cẩu Vàng`
            : `Bậc ${tier} · +${xp} XP`,
      },
    });
  }),
);

export const BUNDLED_LIVEOPS_MANIFEST: LiveOpsManifest = Object.freeze({
  version: "liveops-1",
  revision: "rev-2026-10-15-v1",
  publishedAtUTC: "2026-10-15T00:00:00.000Z",
  ttlSeconds: 900,
  killSwitch: Object.freeze({
    weeklyDisabled: false,
    rushDisabled: false,
    sprintDisabled: false,
    eventsDisabled: false,
    seasonDisabled: false,
  }),
  winterEvent: Object.freeze({
    id: "winter-2026",
    version: "event-1",
    startsAtUTC: "2026-10-12T00:00:00.000Z",
    endsAtUTC: "2026-10-26T00:00:00.000Z",
    runGraceHours: 24,
    claimGraceDays: 7,
    title: {
      en: "Winter Frost Event (14 Days)",
      vi: "Sự kiện Sương giá Mùa đông (14 Ngày)",
    },
    goals: Object.freeze<EventGoalDefinition[]>([
      {
        id: "winter-land-500",
        kind: "landed",
        target: 500,
        nonAssist: false,
        xp: 100,
        rewardCosmeticId: "winter-roof-residential",
        title: {
          en: "Land 500 scored body floors",
          vi: "Đáp 500 tầng thân được chấm",
        },
      },
      {
        id: "winter-perfect-100",
        kind: "perfect",
        target: 100,
        nonAssist: true,
        xp: 150,
        rewardCosmeticId: "winter-crane",
        title: {
          en: "Place 100 Perfect body floors (Non-Assist)",
          vi: "Đặt 100 tầng thân Hoàn hảo (Không Hỗ trợ)",
        },
      },
      {
        id: "winter-daily-7",
        kind: "daily-complete",
        target: 7,
        nonAssist: false,
        xp: 200,
        rewardCosmeticId: "winter-badge",
        title: {
          en: "Complete 7 Daily towers",
          vi: "Hoàn thành 7 tháp Daily",
        },
      },
    ]),
  }),
  freeSeason: Object.freeze({
    id: "season-1",
    version: "season-1",
    startsAtUTC: "2026-10-01T00:00:00.000Z",
    endsAtUTC: "2026-11-12T00:00:00.000Z",
    runGraceHours: 24,
    claimGraceDays: 7,
    tierCount: 20,
    spPerTier: 100,
    spSources: Object.freeze({
      firstDailyCompletePerDay: 20,
      dailyMissionClaim: 10,
      weeklyContractClaim: 50,
    }),
    title: {
      en: "Skyline Free Season 1 (42 Days)",
      vi: "Mùa Giải Miễn Phí 1 (42 Ngày)",
    },
    tiers: SEASON_TIERS,
  }),
});
