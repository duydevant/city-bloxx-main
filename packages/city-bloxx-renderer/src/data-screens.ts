import { type SessionTextKey } from "../../city-bloxx-content/session-locales";
import {
  BUILDING_IDS,
  BUILDINGS,
  captureSkylineSnapshot,
  computePlacementHeatmap,
  deleteSkylineSnapshot,
  HALL_OF_FAME_LIMIT,
  perfectRate,
  renderCosmetic,
  SKYLINE_ALBUM_LIMIT,
  totalCityPopulation,
  type BuildingId,
  type GameSave,
  type HeatmapFilter,
  type RunRecord,
  type RunSummary,
  type StatTotals,
  type StatsGroup,
} from "../../city-bloxx-core/src/index";

interface DataScreenOptions {
  panel: HTMLElement;
  assets?: string;
  now?: () => number;
  save(): GameSave;
  t(en: SessionTextKey): string;
  className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  showStats(stats: [string, string][]): void;
  button(label: string, action: () => void): HTMLButtonElement;
  home(): void;
  replay(record: RunRecord): void;
  pin(id: string | null): void;
  toggleHallOfFame?(id: string): void;
  updateSave?(next: GameSave): void;
}
export function createDataScreens(o: DataScreenOptions) {
  const { t, button } = o;
  let refresh: (() => void) | null = null;
  let statsPage = 0,
    statsGroup: "all" | StatsGroup = "all",
    statsClass: BuildingId = "residential",
    historyPage = 0,
    historyFilter: HeatmapFilter = "all",
    heatmapFilter: HeatmapFilter = "all";
  const locale = () => o.panel.closest(".cb-game")?.getAttribute("lang") ?? "en";
  const isVi = () => locale().startsWith("vi");
  const tr = (en: string, vi: string) => (isVi() ? vi : en);
  const number = (n: number) => n.toLocaleString(locale());
  const percent = (totals: StatTotals) => (perfectRate(totals) === null ? t("No scored drops") : `${perfectRate(totals)}%`);
  const date = (stamp: number) =>
    stamp ? new Intl.DateTimeFormat(locale(), { dateStyle: "short", timeStyle: "short" }).format(stamp) : t("Time unavailable");
  const qualityName = (quality: string | null) =>
    quality === null ? "—" : { perfect: t("Perfect"), great: t("Great"), good: t("Good"), risky: t("Risky"), miss: t("Miss") }[quality as "perfect"];
  const modeName = (s: RunSummary) =>
    s.mode === "one-drop"
      ? `One Drop · ${s.oneDrop!.dateUTC} UTC`
      : s.mode === "daily"
        ? `${t("Daily Tower")} · ${s.daily!.dateUTC} UTC`
        : s.mode === "city"
          ? t("Build City")
          : s.assist
            ? t("Assist")
            : t("Standard");
  const label = (page: number) => [t("Overview"), t("Skill"), t("Class")][page];
  function selector<T extends string>(choices: [T, string][], selected: T, change: (value: T) => void): void {
    const select = document.createElement("select");
    select.className = "cb-data-select";
    select.setAttribute("aria-label", t("Filter statistics and history"));
    for (const [value, name] of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      select.append(option);
    }
    select.value = selected;
    select.addEventListener("change", () => change(select.value as T));
    o.panel.querySelector("p")!.append(document.createElement("br"), select);
  }
  function statistics(page = statsPage, group: "all" | StatsGroup = statsGroup, building: BuildingId = statsClass): void {
    statsPage = page;
    statsGroup = group;
    statsClass = building;
    const save = o.save(),
      totals = page === 2 ? save.stats.byClass[building] : group === "all" ? save.stats.totals : save.stats.byMode[group];
    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(button(t("Previous"), () => statistics(page - 1, group, building)));
    if (page < 2) actions.push(button(t("Next"), () => statistics(page + 1, group, building)));
    if (page !== 1) {
      const hmBtn = button(tr("Heatmap", "Độ lệch"), () => heatmap());
      hmBtn.dataset.openHeatmap = "true";
      actions.push(hmBtn);
    }
    actions.push(button(t("History"), () => history()), button(t("Home"), o.home));
    o.showPanel(`${t("Statistics")} · ${label(page)} · ${page + 1}/3`, `${t("Tracking since")}: ${date(save.stats.trackedSince)}\n${t("Older totals are not reconstructed.")}`, actions);
    if (page === 2) selector(BUILDING_IDS.map(id => [id, o.className(id)]), building, next => statistics(page, group, next));
    else
      selector(
        [
          ["all", t("All tracked runs")],
          ["quick-standard", t("Quick Standard")],
          ["quick-assist", t("Quick Assist")],
          ["city", t("Build City")],
          ["daily", t("Daily Tower")],
        ],
        group,
        next => statistics(page, next, building),
      );
    const quality = totals.quality;
    const acceptedClassBuilds = save.districts.downtown.stats.byClass[building] + save.districts.harbor.stats.byClass[building];
    const acceptedTotalBuilds = save.districts.downtown.stats.builds + save.districts.harbor.stats.builds;
    o.showStats(
      page === 1
        ? [
            [t("Perfect rate"), percent(totals)],
            [t("Scored body drops"), number(totals.scoredBody)],
            [t("Great / Good / Risky"), `${quality.great} / ${quality.good} / ${quality.risky}`],
            [t("Body misses"), number(quality.miss)],
            [t("Perfect roofs"), number(totals.roof.perfect)],
            [t("Best combo / streak"), `${totals.maxCombo} / ${totals.bestStreak}`],
          ]
        : [
            [t("Tracked attempts"), number(totals.attempts)],
            [t("Best height"), number(totals.bestHeight)],
            [t("Earned population"), number(totals.population)],
            [t("Complete bodies"), number(totals.completed)],
            [page === 2 ? t("Accepted complete City builds") : t("Accepted City builds"), number(page === 2 ? acceptedClassBuilds : acceptedTotalBuilds)],
            [t("Current city population"), number(totalCityPopulation(save))],
          ],
    );
    o.panel.classList.add("cb-data-panel");
    refresh = () => statistics(page, group, building);
  }
  function heatmap(filter: HeatmapFilter = heatmapFilter): void {
    heatmapFilter = filter;
    const save = o.save();
    const hm = computePlacementHeatmap(save.history, filter);
    const actions: HTMLButtonElement[] = [
      button(t("Statistics"), () => statistics()),
      button(t("History"), () => history()),
      button(t("Home"), o.home),
    ];
    const sampleNotice = tr(
      `50-run window sample (${hm.sampleCount} drops, foundation & roof excluded).`,
      `Mẫu 50 lượt gần nhất (${hm.sampleCount} thả, không tính móng & mái).`,
    );
    o.showPanel(tr("Statistics · Heatmap", "Thống kê · Độ lệch"), sampleNotice, actions);
    selector<HeatmapFilter>(
      [
        ["all", t("All tracked runs")],
        ["quick-standard", t("Quick Standard")],
        ["quick-assist", t("Quick Assist")],
        ["city", t("Build City")],
        ["daily", t("Daily Tower")],
        ["one-drop", "One Drop"],
      ],
      filter,
      next => heatmap(next),
    );
    o.showStats([
      [tr("Sample / Lifetime", "Mẫu / Trọn đời"), `${number(hm.sampleCount)} / ${number(save.stats.totals.scoredBody)}`],
      [t("Signed error mean"), hm.meanSignedPercent === null ? "—" : `${hm.meanSignedPercent > 0 ? "+" : ""}${hm.meanSignedPercent.toFixed(1)}%`],
      [tr("Left / Center / Right", "Trái / Giữa / Phải"), `${hm.leftCount} / ${hm.centerCount} / ${hm.rightCount}`],
      [tr("Overflow Miss (L/R)", "Tràn Miss (T/P)"), `${hm.leftOverflowMiss} / ${hm.rightOverflowMiss}`],
    ]);
    const container = document.createElement("div");
    container.className = "cb-heatmap";
    container.dataset.heatmap = filter;
    container.dataset.sampleCount = String(hm.sampleCount);
    container.dataset.leftOverflow = String(hm.leftOverflowMiss);
    container.dataset.rightOverflow = String(hm.rightOverflowMiss);
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(40, minmax(2px, 1fr))";
    container.style.gap = "1px";
    container.style.alignItems = "end";
    container.style.height = "26px";
    container.style.margin = "4px 0";
    container.style.padding = "3px";
    container.style.background = "rgba(15, 23, 42, 0.55)";
    container.style.borderRadius = "6px";
    const maxCount = Math.max(1, ...hm.bins.map(b => b.count));
    for (const bin of hm.bins) {
      const bar = document.createElement("div");
      bar.dataset.binIndex = String(bin.index);
      bar.dataset.binRange = `${bin.minPercent}..${bin.maxPercent}`;
      bar.dataset.binCount = String(bin.count);
      bar.dataset.binMiss = String(bin.missCount);
      const ratio = bin.count / maxCount;
      bar.style.height = `${Math.max(2, Math.round(ratio * 20))}px`;
      bar.style.background =
        bin.missCount > 0 ? "#ef4444" : Math.abs(bin.minPercent + 2.5) <= 5 ? "#fbbf24" : "#38bdf8";
      bar.title = `${bin.minPercent}%..${bin.maxPercent}%: ${bin.count}`;
      container.append(bar);
    }
    o.panel.querySelector("p")!.append(container);
    o.panel.classList.add("cb-data-panel");
    refresh = () => heatmap(filter);
  }
  function history(page = historyPage, filter: HeatmapFilter = historyFilter): void {
    const save = o.save();
    const rows = save.history.filter(
      s =>
        filter === "all" ||
        (filter === "city" || filter === "daily" || filter === "one-drop"
          ? s.mode === filter
          : s.mode === "quick" && s.assist === (filter === "quick-assist")),
    );
    const pages = Math.max(1, Math.ceil(rows.length / 3));
    page = Math.max(0, Math.min(page, pages - 1));
    historyPage = page;
    historyFilter = filter;
    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(button(t("Previous"), () => history(page - 1, filter)));
    if (page < pages - 1) actions.push(button(t("Next"), () => history(page + 1, filter)));
    const hofBtn = button(tr("Hall", "Ghim"), () => hallOfFame());
    hofBtn.dataset.openHallOfFame = "true";
    const albumBtn = button("Album", () => album());
    albumBtn.dataset.openAlbum = "true";
    actions.push(hofBtn, albumBtn, button(t("Statistics"), () => statistics()), button(t("Home"), o.home));
    o.showPanel(
      `${t("History")} · ${page + 1}/${pages}`,
      rows.length
        ? t("Up to 50 recent summaries; retained Quick and Daily replays can be played.")
        : t("No tracked runs yet. Play a tower to add its result here."),
      actions,
    );
    selector<HeatmapFilter>(
      [
        ["all", t("All modes")],
        ["quick-standard", t("Quick Standard")],
        ["quick-assist", t("Quick Assist")],
        ["city", t("Build City")],
        ["daily", t("Daily Tower")],
        ["one-drop", "One Drop"],
      ],
      filter,
      next => history(0, next),
    );
    const list = document.createElement("div");
    list.className = "cb-history-list";
    for (const s of rows.slice(page * 3, page * 3 + 3)) {
      const pinnedBadge = save.hallOfFame.includes(s.identity.id) ? " ★" : "";
      const b = button(
        `${modeName(s)} · ${o.className(s.building)}${pinnedBadge}\n${s.result.height} ${t("floors")} · ${number(s.result.population)} ${t("people")} · ${s.outcome === "abandoned" ? t("Stopped") : s.result.rating}`,
        () => details(s.identity.id, () => history(page, filter)),
      );
      b.dataset.historyId = s.identity.id;
      list.append(b);
    }
    o.panel.querySelector(".cb-actions")!.before(list);
    o.panel.classList.add("cb-data-panel", "cb-history-panel");
    refresh = () => history(page, filter);
  }
  function hallOfFame(): void {
    const save = o.save();
    const pinnedSummaries = save.hallOfFame
      .map(id => save.history.find(h => h.identity.id === id))
      .filter((s): s is RunSummary => !!s);
    const actions: HTMLButtonElement[] = [
      button(tr("Skyline Album", "Album Đường chân trời"), () => album()),
      button(t("History"), () => history()),
      button(t("Home"), o.home),
    ];
    o.showPanel(
      `${tr("Hall of Fame", "Phòng truyền thống")} · ${pinnedSummaries.length}/${HALL_OF_FAME_LIMIT}`,
      tr(
        "Up to 5 pinned summaries are protected when history is pruned. Up to 3 full replays are retained.",
        "Tối đa 5 bản tóm tắt ghim được bảo vệ khi dọn lịch sử. Tối đa 3 replay đầy đủ được giữ lại.",
      ),
      actions,
    );
    const list = document.createElement("div");
    list.className = "cb-history-list";
    list.dataset.hallOfFameList = "true";
    for (const s of pinnedSummaries) {
      const hasReplay = save.replays.some(r => r.id === s.identity.id);
      const replayTag = hasReplay ? tr("Replay ready", "Có replay") : tr("Summary only", "Chỉ lưu tóm tắt");
      const b = button(
        `★ ${modeName(s)} · ${o.className(s.building)} (${replayTag})\n${s.result.height} ${t("floors")} · ${number(s.result.population)} ${t("people")} · ${s.result.rating}`,
        () => details(s.identity.id, () => hallOfFame()),
      );
      b.dataset.hofId = s.identity.id;
      list.append(b);
    }
    o.panel.querySelector(".cb-actions")!.before(list);
    o.panel.classList.add("cb-data-panel", "cb-history-panel");
    refresh = () => hallOfFame();
  }
  function album(confirmSlot: 0 | 1 | 2 | null = null): void {
    const save = o.save();
    const activeDistrict = save.districts.activeDistrict;
    const nowStamp = o.now ? o.now() : 0;
    if (confirmSlot !== null && save.album[confirmSlot]) {
      const existing = save.album[confirmSlot]!;
      o.showPanel(
        tr("Replace Skyline Album slot?", "Ghi đè ô Album Đường chân trời?"),
        tr(
          `Slot ${confirmSlot + 1} already holds a ${existing.districtId} snapshot (${existing.population} pop). Replace it with current ${activeDistrict}?`,
          `Ô ${confirmSlot + 1} đang lưu ảnh chụp ${existing.districtId} (${existing.population} dân). Thay bằng ${activeDistrict} hiện tại?`,
        ),
        [
          button(tr("Confirm replace", "Xác nhận ghi đè"), () => {
            o.updateSave?.(captureSkylineSnapshot(o.save(), confirmSlot, nowStamp, activeDistrict));
            album(null);
          }),
          button(t("Back"), () => album(null)),
        ],
      );
      o.panel.classList.add("cb-data-panel");
      refresh = () => album(confirmSlot);
      return;
    }
    const actions: HTMLButtonElement[] = [];
    for (let i = 0; i < SKYLINE_ALBUM_LIMIT; i++) {
      const slotIndex = i as 0 | 1 | 2;
      const snap = save.album[slotIndex];
      const captureBtn = button(
        snap
          ? tr(`Replace #${i + 1}`, `Đổi #${i + 1}`)
          : tr(`Capture #${i + 1}`, `Chụp #${i + 1}`),
        () => {
          if (o.save().album[slotIndex]) {
            album(slotIndex);
          } else {
            o.updateSave?.(captureSkylineSnapshot(o.save(), slotIndex, nowStamp, activeDistrict));
            album(null);
          }
        },
      );
      captureBtn.dataset.albumCapture = String(i);
      actions.push(captureBtn);
    }
    actions.push(button(t("History"), () => history()), button(t("Home"), o.home));
    o.showPanel(
      `${tr("Skyline Album", "Album Đường chân trời")} · ${save.album.filter(Boolean).length}/${SKYLINE_ALBUM_LIMIT}`,
      tr(
        "Up to 3 district snapshots · 0 XP · no base64.",
        "Tối đa 3 bản chụp quận · 0 XP · không base64.",
      ),
      actions,
    );
    const list = document.createElement("div");
    list.className = "cb-album-list";
    list.dataset.albumList = "true";
    list.style.display = "grid";
    list.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    list.style.gap = "5px";
    list.style.width = "min(100%, 420px)";
    list.style.margin = "4px 0";
    for (let i = 0; i < SKYLINE_ALBUM_LIMIT; i++) {
      const slotIndex = i as 0 | 1 | 2;
      const snap = save.album[slotIndex];
      const card = document.createElement("div");
      card.dataset.albumSlot = String(i);
      card.dataset.occupied = String(!!snap);
      card.style.padding = "5px";
      card.style.borderRadius = "6px";
      card.style.background = "rgba(15, 23, 42, 0.55)";
      card.style.fontSize = "10px";
      const title = document.createElement("strong");
      title.textContent = snap
        ? `#${i + 1} · ${snap.districtId === "harbor" ? tr("Harbor", "Bến cảng") : t("Downtown")}`
        : `#${i + 1} · ${tr("Empty", "Trống")}`;
      card.append(title);
      if (snap) {
        const meta = document.createElement("div");
        meta.textContent = `${snap.lots.filter(Boolean).length}/25 · ${number(snap.population)}p${snap.landmarkId ? " ★" : ""}`;
        card.append(meta);
        const miniGrid = document.createElement("div");
        miniGrid.style.display = "grid";
        miniGrid.style.gridTemplateColumns = "repeat(5, 1fr)";
        miniGrid.style.gap = "1px";
        miniGrid.style.marginTop = "3px";
        for (const lot of snap.lots) {
          const cell = document.createElement("span");
          cell.style.height = "6px";
          cell.style.borderRadius = "1px";
          if (lot) {
            const set = renderCosmetic(lot.skin, "building", lot.classId).set;
            cell.dataset.skinSet = set;
            cell.style.backgroundColor = BUILDINGS[lot.classId].color;
          } else {
            cell.style.backgroundColor = "rgba(255,255,255,0.12)";
          }
          miniGrid.append(cell);
        }
        card.append(miniGrid);
        if (o.updateSave) {
          const del = button(tr("Clear", "Xoá"), () => {
            o.updateSave?.(deleteSkylineSnapshot(o.save(), slotIndex));
            album(null);
          });
          del.dataset.albumClear = String(i);
          del.style.marginTop = "3px";
          del.style.padding = "2px 6px";
          del.style.fontSize = "9px";
          card.append(del);
        }
      }
      list.append(card);
    }
    o.panel.querySelector(".cb-actions")!.before(list);
    o.panel.classList.add("cb-data-panel", "cb-result-panel");
    refresh = () => album(null);
  }
  function details(id: string, back: () => void, qualityPage = false): void {
    const save = o.save(),
      summary = save.history.find(h => h.identity.id === id);
    if (!summary) {
      history();
      return;
    }
    const archive = save.replays.find(r => r.id === id),
      metrics = summary.metrics;
    const unavailable =
      summary.replayStatus === "unsupported"
        ? t("Replay version unsupported")
        : summary.replayStatus === "pruned"
          ? t("Replay was pruned; summary is kept")
          : t("No replay recorded for this run");
    const actions = [button(qualityPage ? t("Result") : t("Drop quality"), () => details(id, back, !qualityPage))];
    if (archive) {
      actions.push(button(t("Replay"), () => o.replay(archive.record)));
      actions.push(
        button(save.replayRefs.pinned === id ? t("Unpin replay") : t("Pin replay"), () => {
          o.pin(save.replayRefs.pinned === id ? null : id);
          details(id, back, qualityPage);
        }),
      );
    }
    if (o.toggleHallOfFame) {
      const inHof = save.hallOfFame.includes(id);
      const hofToggle = button(
        inHof ? "★ HoF" : "☆ HoF",
        () => {
          o.toggleHallOfFame!(id);
          details(id, back, qualityPage);
        },
      );
      hofToggle.dataset.toggleHof = id;
      hofToggle.title = inHof ? tr("Unpin Hall of Fame", "Bỏ ghim Truyền thống") : tr("Pin Hall of Fame", "Ghim Truyền thống");
      hofToggle.disabled = !inHof && save.hallOfFame.length >= HALL_OF_FAME_LIMIT;
      actions.push(hofToggle);
    }
    actions.push(button(t("Back"), back));
    o.showPanel(
      `${modeName(summary)} · ${o.className(summary.building)}`,
      `${date(summary.endedAt)}\n${archive ? t("Personal result · not server verified") : unavailable}`,
      actions,
    );
    const r = summary.result;
    if (qualityPage && metrics) {
      const total = Object.values(metrics.body).reduce((sum, n) => sum + n, 0);
      o.showStats([
        [t("Perfect"), `${metrics.body.perfect} · ${total ? ((metrics.body.perfect / total) * 100).toFixed(1) : "—"}%`],
        [t("Great / Good"), `${metrics.body.great} / ${metrics.body.good}`],
        [t("Risky / Miss"), `${metrics.body.risky} / ${metrics.body.miss}`],
        [t("Foundation · unscored"), String(metrics.foundation)],
        [t("Roof"), qualityName(metrics.roof)],
        [t("Signed error mean"), metrics.errorCount ? `${((metrics.signedErrorSum / metrics.errorCount) * 100).toFixed(1)}%` : "—"],
      ]);
    } else if (qualityPage) o.panel.querySelector("p")!.textContent = t("Detailed drop statistics were not recorded in this older save.");
    else
      o.showStats([
        [t("Population"), number(r.population)],
        [t("Floors"), number(r.height)],
        [t("Accuracy"), `${r.accuracy}%`],
        [t("Best streak"), number(r.bestStreak)],
        [t("Misses"), number(r.misses)],
        [t("Duration"), `${(r.durationTicks / 60).toFixed(1)}s`],
      ]);
    o.panel.classList.add("cb-data-panel");
    refresh = () => details(id, back, qualityPage);
  }
  return {
    statistics,
    heatmap,
    history,
    hallOfFame,
    album,
    details: (id: string) => details(id, () => history()),
    clear() {
      refresh = null;
    },
    refresh() {
      refresh?.();
    },
    isOpen() {
      return refresh !== null;
    },
  };
}

