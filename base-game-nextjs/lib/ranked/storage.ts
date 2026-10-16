import type {
  RunConfig,
  RunRecord,
} from "../../../packages/city-bloxx-core/src/index";
export interface StartTicket {
  runId: string;
  ticket: string;
  config: RunConfig;
  physicsVersion: string;
  rulesetVersion: string;
  issuedAt: string;
  expiresAt: string;
}
export interface FinishBody {
  runId: string;
  ticket: string;
  physicsVersion: string;
  rulesetVersion: string;
  inputs: RunRecord["inputs"];
  endTick: number;
}
export type RunState =
  | "starting"
  | "active"
  | "queued"
  | "processing"
  | "accepted"
  | "rejected"
  | "expired"
  | "abandoned";
export interface RankedRun {
  id: string;
  mode: "quick" | "daily";
  state: RunState;
  ticket: StartTicket | null;
  runId: string | null;
  localId: string | null;
  body: FinishBody | null;
  controller: string | null;
  localResult: RunRecord["result"] | null;
  verifiedResult: RunRecord["result"] | null;
  boardEligible: boolean | null;
  createdAt: number;
  retryAt: number;
  attempts: number;
  error: string | null;
}
export interface RankedStorage {
  read(owner: string): Promise<RankedRun[]>;
  change(
    owner: string,
    work: (runs: RankedRun[]) => RankedRun[],
  ): Promise<RankedRun[]>;
}
export const RANKED_DATABASE = "city-bloxx.ranked.v1";
export class IndexedRankedStorage implements RankedStorage {
  private opening?: Promise<IDBDatabase>;
  private open() {
    if (!this.opening)
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(RANKED_DATABASE, 1);
        req.onupgradeneeded = () =>
          req.result.createObjectStore("accounts", { keyPath: "owner" });
        req.onerror = req.onblocked = () => reject(new Error("storage"));
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.opening = undefined;
          };
          resolve(db);
        };
      }).catch((error) => {
        this.opening = undefined;
        throw error;
      });
    return this.opening;
  }
  async read(owner: string) {
    const db = await this.open();
    return new Promise<RankedRun[]>((resolve, reject) => {
      const tx = db.transaction("accounts", "readonly"),
        req = tx.objectStore("accounts").get(owner);
      tx.oncomplete = () => resolve(req.result?.runs ?? []);
      tx.onerror = tx.onabort = () => reject(new Error("storage"));
    });
  }
  async change(owner: string, work: (runs: RankedRun[]) => RankedRun[]) {
    const db = await this.open();
    return new Promise<RankedRun[]>((resolve, reject) => {
      const tx = db.transaction("accounts", "readwrite", {
          durability: "strict",
        }),
        store = tx.objectStore("accounts");
      let runs: RankedRun[] = [];
      let failure: unknown;
      store.get(owner).onsuccess = (event) => {
        try {
          const current = (event.target as IDBRequest).result;
          runs = work(current?.runs ?? []);
          store.put({ owner, runs });
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(runs);
      tx.onerror = tx.onabort = () => reject(failure ?? new Error("storage"));
    });
  }
}
