import { migrateSave, prepareSave, type GameSave, type SavePort } from "../../city-bloxx-core/src/index";

// Adapter boundary: validate reads before enabling writes; take immutable queued snapshots.
export function createSaveController(port: SavePort, timeoutMs = 5000) {
  let generation = 0, disposed = false, loaded = false;
  let queue = Promise.resolve();
  return {
    async load(): Promise<GameSave> {
      const current = ++generation;
      loaded = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([
          port.load(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Save load timeout")), timeoutMs); }),
        ]);
        if (disposed || current !== generation) throw new Error("Save load superseded");
        const save = migrateSave(value);
        loaded = true;
        return save;
      } finally { clearTimeout(timer); }
    },
    write(save: GameSave): Promise<boolean> {
      if (!loaded || disposed) return Promise.resolve(false);
      const snapshot = prepareSave(save);
      const operation = queue.then(async () => {
        try { return await port.save(snapshot); } catch { return false; }
      });
      queue = operation.then(() => undefined);
      return operation;
    },
    dispose(): void { disposed = true; loaded = false; generation++; },
  };
}
