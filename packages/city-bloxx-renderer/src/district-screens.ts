import {
  acknowledgeEvolutionStage,
  CITY_EVOLUTION_STAGES,
  claimDistrictLandmark,
  deriveEvolutionStage,
  DISTRICT_CATALOG,
  districtGoalProgress,
  districtPopulation,
  DOCK_CLOCK_TOWER_LANDMARK,
   setLandmarkPlaced,
  totalCityPopulation,
  type BuildingId,
  type DistrictId,
  type GameSave,
} from "../../city-bloxx-core/src/index";

export interface DistrictScreensOptions {
  panel: HTMLElement;
  assets: string;
  save(): GameSave;
  vi(): boolean;
  className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  button(label: string, action: () => void): HTMLButtonElement;
  selectDistrict(districtId: DistrictId): Promise<void>;
  updateSave(next: GameSave): void;
  backToMap(): void;
}

const preloadCache = new Map<string, Promise<boolean>>();

export function preloadDistrictBackground(assetUrl: string): Promise<boolean> {
  const existing = preloadCache.get(assetUrl);
  if (existing) return existing;
  const promise = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    const timer = window.setTimeout(() => resolve(false), 4000);
    img.onload = () => {
      void img
        .decode()
        .catch(() => {})
        .then(() => {
          clearTimeout(timer);
          resolve(true);
        });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = assetUrl;
  });
  preloadCache.set(assetUrl, promise);
  return promise;
}

export function createDistrictScreens(o: DistrictScreensOptions) {
  let open = false;
  let page = 0; // 0 = Downtown, 1 = Harbor, 2 = Landmark & Evolution

  const locale = () => (o.vi() ? "vi" : "en");
  const num = (n: number) => n.toLocaleString(locale());
  const text = (en: string, vi: string) => (o.vi() ? vi : en);

  function render(currentPage = page): void {
    open = true;
    page = Math.max(0, Math.min(2, currentPage));
    let s = o.save();
    const newlyReachedStage =
      s.districts.evolution.notifiedStage !== s.districts.evolution.highestStage
        ? CITY_EVOLUTION_STAGES.find((st) => st.id === s.districts.evolution.highestStage) ?? null
        : null;
    if (newlyReachedStage) {
      s = acknowledgeEvolutionStage(s);
      o.updateSave(s);
    }

    const totalPop = totalCityPopulation(s);
    const currentStageDef = deriveEvolutionStage(totalPop);
    const highestStageDef =
      CITY_EVOLUTION_STAGES.find((st) => st.id === s.districts.evolution.highestStage) ?? currentStageDef;

    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(o.button(text("Previous", "Trước"), () => render(page - 1)));
    if (page < 2) actions.push(o.button(text("Next", "Tiếp"), () => render(page + 1)));

    if (page === 0) {
      const selectBtn = o.button(
        s.districts.activeDistrict === "downtown"
          ? text("Viewing Downtown", "Đang ở Trung tâm")
          : text("Open Downtown", "Vào Trung tâm"),
        () => {
          open = false;
          void o.selectDistrict("downtown");
        },
      );
      selectBtn.dataset.districtSelect = "downtown";
      actions.unshift(selectBtn);
    } else if (page === 1) {
      const harborUnlocked = s.districts.unlockedDistricts.includes("harbor");
      const selectBtn = o.button(
        !harborUnlocked
          ? text("Harbor Locked", "Bến cảng đang khoá")
          : s.districts.activeDistrict === "harbor"
            ? text("Viewing Harbor", "Đang ở Bến cảng")
            : text("Open Harbor", "Vào Bến cảng"),
        () => {
          if (!harborUnlocked) return;
          open = false;
          void o.selectDistrict("harbor");
        },
      );
      selectBtn.dataset.districtSelect = "harbor";
      selectBtn.disabled = !harborUnlocked;
      actions.unshift(selectBtn);
    } else {
      const lmState = s.districts.landmarks.dock_clock_tower;
      const harborDone = s.districts.completedDistricts.includes("harbor");
      if (!lmState.claimed) {
        const claimBtn = o.button(
          harborDone ? text("Claim Landmark", "Nhận biểu tượng") : text("Landmark Locked", "Biểu tượng đang khoá"),
          () => {
            if (!harborDone) return;
            const next = claimDistrictLandmark(o.save(), "dock_clock_tower", Date.now());
            o.updateSave(next);
            render(2);
          },
        );
        claimBtn.dataset.landmarkClaim = "dock_clock_tower";
        claimBtn.disabled = !harborDone;
        actions.unshift(claimBtn);
      } else {
        const toggleBtn = o.button(
          lmState.placed ? text("Hide Landmark", "Ẩn biểu tượng") : text("Place Landmark", "Đặt biểu tượng"),
          () => {
            const next = setLandmarkPlaced(o.save(), "dock_clock_tower", !lmState.placed);
            o.updateSave(next);
            render(2);
          },
        );
        toggleBtn.dataset.landmarkToggle = "dock_clock_tower";
        actions.unshift(toggleBtn);
      }
    }

    actions.push(
      o.button(text("Back", "Quay lại"), () => {
        open = false;
        o.backToMap();
      }),
    );

    const pageTitles = [
      text("Districts · Downtown · 1/3", "Quận · Trung tâm · 1/3"),
      text("Districts · Harbor · 2/3", "Quận · Bến cảng · 2/3"),
      text("Landmark & Evolution · 3/3", "Biểu tượng & Đô thị · 3/3"),
    ];
    const headerSummary = `${text("City stage", "Cấp đô thị")}: ${currentStageDef.title[locale()]} (${text("Highest", "Cao nhất")}: ${highestStageDef.title[locale()]}) · ${num(totalPop)} ${text("people", "dân")}`;

    o.showPanel(pageTitles[page], headerSummary, actions);
    open = true;
    o.panel.classList.add("cb-progression-panel", "cb-districts-panel");

    const container = document.createElement("div");
    container.className = "cb-progression-content";
    container.dataset.districtPage = String(page);

    if (newlyReachedStage) {
      const banner = document.createElement("div");
      banner.dataset.evolutionBanner = newlyReachedStage.id;
      banner.style.borderLeft = `4px solid ${newlyReachedStage.accent}`;
      const strong = document.createElement("strong");
      strong.textContent = text(
        `New highest stage reached: ${newlyReachedStage.title.en}!`,
        `Đạt cấp đô thị cao nhất mới: ${newlyReachedStage.title.vi}!`,
      );
      banner.append(strong);
      container.append(banner);
    }

    if (page === 0 || page === 1) {
      const districtId: DistrictId = page === 0 ? "downtown" : "harbor";
      const def = DISTRICT_CATALOG.find((d) => d.id === districtId)!;
      const unlocked = s.districts.unlockedDistricts.includes(districtId);
      const goal = districtGoalProgress(s, districtId);
      const pop = districtPopulation(s, districtId);

      const card = document.createElement("article");
      card.dataset.districtCard = districtId;
      card.dataset.unlocked = String(unlocked);
      card.dataset.completed = String(goal.completedPreviously);

      const title = document.createElement("strong");
      const statusBadge = goal.completedPreviously
        ? text("Completed ✓", "Đã hoàn thành ✓")
        : unlocked
          ? text("Unlocked", "Đã mở khoá")
          : text("Locked 🔒", "Đã khoá 🔒");
      title.textContent = `${def.title[locale()]} · ${statusBadge}`;

      const subtitle = document.createElement("small");
      subtitle.textContent = `${def.subtitle[locale()]} · ${num(pop)} ${text("people", "dân")}`;

      const thumb = document.createElement("img");
      thumb.src = `${o.assets.replace(/\/$/, "")}/${def.thumbnailAsset}`;
      thumb.alt = def.title[locale()];
      thumb.width = 44;
      thumb.height = 44;
      thumb.style.cssText = "width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #ffffff40";
      thumb.addEventListener("error", () => {
        thumb.style.display = "none";
      });

      card.append(title, subtitle, thumb);
      container.append(card);

      // If Harbor is locked, show Downtown unlock requirements clearly; also show Harbor's own goal
      const evalToShow = !unlocked ? districtGoalProgress(s, "downtown") : goal;
      const goalCard = document.createElement("div");
      goalCard.dataset.districtGoal = evalToShow.districtId;
      const goalHeading = document.createElement("strong");
      goalHeading.textContent = !unlocked
        ? text("Unlock Requirement: Complete Downtown Goal", "Điều kiện mở: Hoàn thành mục tiêu Trung tâm")
        : goal.completedPreviously
          ? text("District Goal (Earned — kept on demolish)", "Mục tiêu Quận (Đã đạt — giữ khi phá nhà)")
          : text("District Completion Goal", "Mục tiêu hoàn thành Quận");

      const reqList = document.createElement("small");
      const lines: string[] = [
        `${evalToShow.completedTowers.met ? "✓" : "○"} ${text("Completed towers", "Tháp đủ thân")}: ${evalToShow.completedTowers.current}/${evalToShow.completedTowers.target}`,
        `${evalToShow.population.met ? "✓" : "○"} ${text("District population", "Dân số quận")}: ${num(evalToShow.population.current)}/${num(evalToShow.population.target)}`,
        `${evalToShow.topRatedTowers.met ? "✓" : "○"} ${text("A or S rated towers", "Tháp hạng A hoặc S")}: ${evalToShow.topRatedTowers.current}/${evalToShow.topRatedTowers.target}`,
      ];
      if (evalToShow.requiredClasses.target > 0) {
        lines.splice(
          1,
          0,
          `${evalToShow.requiredClasses.met ? "✓" : "○"} ${text("Classes present", "Loại nhà hiện diện")}: ${evalToShow.requiredClasses.current.length}/${evalToShow.requiredClasses.target}${evalToShow.requiredClasses.missing.length ? ` (${evalToShow.requiredClasses.missing.map(o.className).join(", ")})` : ""}`,
        );
      }
      reqList.textContent = lines.join(" · ");
      goalCard.append(goalHeading, reqList);
      container.append(goalCard);
    } else {
      const lm = DOCK_CLOCK_TOWER_LANDMARK;
      const lmState = s.districts.landmarks.dock_clock_tower;
      const harborDone = s.districts.completedDistricts.includes("harbor");

      const lmCard = document.createElement("article");
      lmCard.dataset.landmarkCard = lm.id;
      lmCard.dataset.claimed = String(lmState.claimed);
      lmCard.dataset.placed = String(lmState.placed);

      const title = document.createElement("strong");
      title.textContent = `${lm.title[locale()]} · ${
        lmState.claimed
          ? lmState.placed
            ? text("Placed in Plaza ✓", "Đang đặt ở quảng trường ✓")
            : text("Claimed (Hidden)", "Đã nhận (Đang ẩn)")
          : harborDone
            ? text("Ready to Claim!", "Sẵn sàng nhận!")
            : text("Complete Harbor to unlock", "Hoàn thành Bến cảng để mở")
      }`;

      const desc = document.createElement("small");
      desc.textContent = lm.description[locale()];

      const preview = document.createElement("img");
      preview.src = `${o.assets.replace(/\/$/, "")}/${lm.asset}`;
      preview.alt = lm.title[locale()];
      preview.width = 36;
      preview.height = 54;
      preview.style.cssText = "width:36px;height:54px;object-fit:contain";
      preview.addEventListener("error", () => {
        preview.style.display = "none";
      });

      lmCard.append(title, desc, preview);
      container.append(lmCard);

      const evoCard = document.createElement("div");
      evoCard.dataset.evolutionStages = "true";
      const evoHeading = document.createElement("strong");
      evoHeading.textContent = text("City Evolution Stages", "Các cấp phát triển Đô thị");
      const evoText = document.createElement("small");
      evoText.textContent = CITY_EVOLUTION_STAGES.map(
        (st) =>
          `${st.id === currentStageDef.id ? "●" : st.rank <= highestStageDef.rank ? "✓" : "○"} ${st.title[locale()]} (${num(st.minPopulation)}+)`,
      ).join(" · ");
      evoCard.append(evoHeading, evoText);
      container.append(evoCard);
    }

    o.panel.querySelector(".cb-actions")!.before(container);
  }

  return {
    open(initialPage = 0) {
      render(initialPage);
    },
    isOpen() {
      return open;
    },
    refresh() {
      if (open) render(page);
    },
    clear() {
      open = false;
    },
  };
}
