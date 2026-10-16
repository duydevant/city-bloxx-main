import { browserAuth } from "../auth/session";
import { browserCloud } from "../cloud/browser";
import { ApiError } from "../api/api-client";
import { RankedCoordinator } from "./coordinator";
import { IndexedRankedStorage } from "./storage";
let singleton: RankedCoordinator | undefined;
export function browserRanked() {
  if (singleton) return singleton;
  const auth = browserAuth(),
    cloud = browserCloud();
  const owner = () =>
    cloud.snapshot().scope && cloud.snapshot().scope !== "guest"
      ? cloud.snapshot().scope
      : null;
  const authenticated = (id: string) =>
    auth.snapshot().status === "authenticated" &&
    auth.snapshot().user?.id === id &&
    cloud.snapshot().ready &&
    !cloud.snapshot().locked;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("city-bloxx-ranked");
  } catch {}
  const ranked = new RankedCoordinator({
    storage: new IndexedRankedStorage(),
    owner,
    authenticated,
    request: async <T>(id: string, path: string, options?: RequestInit) => {
      if (!authenticated(id)) throw new ApiError("account-changed");
      const result = await auth.request<T>(path, options);
      if (!authenticated(id)) throw new ApiError("account-changed");
      return result;
    },
    uuid: () => crypto.randomUUID(),
    now: () => Date.now(),
    online: () => navigator.onLine,
    lock: async (id, work) =>
      navigator.locks
        ? navigator.locks.request(`city-bloxx-ranked:${id}`, work)
        : work(),
    schedule: (work, delay) => {
      const timer = setTimeout(work, delay);
      return () => clearTimeout(timer);
    },
    post: (id) => channel?.postMessage({ owner: id }),
  });
  singleton = ranked;
  let previous = "";
  const identity = (force = false) => {
    const id = owner(),
      key = `${id}:${id ? authenticated(id) : false}`;
    if (key === previous && !force) return;
    previous = key;
    void ranked.identity(id);
  };
  auth.subscribe(() => identity(true));
  cloud.subscribe(() => identity());
  identity();
  channel?.addEventListener("message", (event) => {
    if (typeof event.data?.owner === "string")
      void ranked.refresh(event.data.owner);
  });
  window.addEventListener("online", () => {
    void ranked.flush();
  });
  window.addEventListener("focus", () => {
    void ranked.flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void ranked.flush();
  });
  return ranked;
}
