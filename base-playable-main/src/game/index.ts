import { emptySave, migrateSave } from "../../../packages/city-bloxx-core/src/index.js";
import { mountQuickTower } from "../../../packages/city-bloxx-renderer/src/session.js";
import "../../../packages/city-bloxx-renderer/src/session.css";
import type { PlayableGame, PlayableHost } from "../platform/types.js";
import "./styles.css";
import { setLocale } from "../platform/i18n.js";

export const game: PlayableGame = {
  autoReady: true,
  async create(host: PlayableHost): Promise<void> {
    const offAudio = host.onAudioEnabled(enabled => {
      if (!enabled) host.suspendAudio();
    });
    const session = mountQuickTower(host.stage, {
      assets: "./game",
      locale: host.locale,
      showSoundControl: !host.inPlayables,
      capabilities: { platform: "playable", externalServices: false, standardScore: true },
      tracking: {
        installationId: () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, "0")).join(""),
        now: () => Date.now(),
      },
      onLocaleChange: locale => { setLocale(locale); },
      save: {
        load: async () => {
          try {
            const migrated = migrateSave(await host.load(emptySave()));
            void host.reconcileScore(migrated.standardQuickBest);
            return migrated;
          } catch (e) {
            host.markLoadFailed();
            throw e;
          }
        },
        save: value => host.save(value),
      },
      score: {
        submitStandardQuick: value => host.flushScore(value),
        getState: () => host.getScoreState(),
        onStateChange: cb => host.onScoreState(cb),
      },
      lifecycle: {
        isPaused: () => host.isPaused(),
        onPause: cb => host.onPause(cb),
        onResume: cb => host.onResume(cb),
      },
      audio: {
        play: quality => host.beep(quality === "miss" ? "lose" : quality === "perfect" ? "merge" : "tap"),
        setCombo: combo => host.setAudioCombo?.(combo),
        suspend: () => host.suspendAudio(),
        dispose: () => {
          offAudio();
          host.disposeScore();
          host.disposeAudio();
        },
      },
      seed: () => Date.now() & 0x7fffffff,
    });
    await session.ready;
    window.addEventListener("pagehide", event => {
      if (!event.persisted) session.dispose();
    });
  },
};
