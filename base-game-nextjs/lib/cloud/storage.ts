export interface CloudSnapshot {
  revision: string
  schema: number | null
  payload: unknown
  hash: string | null
  updatedAt: string | null
  compatibility: "absent" | "compatible" | "incompatible"
}
export interface Mutation {
  mutationId: string
  expectedRevision: string
  schema?: number
  payload?: unknown
  choice?: "local" | "cloud"
  local?: { schema: number; rawPayload: string }
  localBackupAcknowledged?: true
}
export interface AccountSave {
  owner: string
  raw: string | null
  version: string
  base: string | null
  revision: string
  pending: { body: Mutation; raw: string; replace?: boolean; version?: string; remote?: CloudSnapshot } | null
  conflict: CloudSnapshot | null
  retryAt: number
  rejected: boolean
}
export interface Backup {
  id: string
  owner: string
  raw: string
  source: string
  createdAt: number
  expiresAt: number
}
export type Change = (record: AccountSave, backup: (raw: string, source: string) => void) => AccountSave
export interface CloudStorage {
  read(owner: string): Promise<AccountSave | null>
  change(owner: string, work: Change): Promise<AccountSave>
  backups(owner: string): Promise<Backup[]>
}
export const freshAccount = (owner: string): AccountSave => ({
  owner,
  raw: null,
  version: "",
  base: null,
  revision: "0",
  pending: null,
  conflict: null,
  retryAt: 0,
  rejected: false,
})
export const CLOUD_DATABASE = "city-bloxx.accounts.v1"

// Resolve only on transaction completion: request success is not a durability acknowledgement.
export class IndexedCloudStorage implements CloudStorage {
  private opening?: Promise<IDBDatabase>
  private open() {
    if (!this.opening)
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(CLOUD_DATABASE, 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore("accounts", { keyPath: "owner" })
          const backups = request.result.createObjectStore("backups", { keyPath: "id" })
          backups.createIndex("owner", "owner")
          backups.createIndex("expiresAt", "expiresAt")
        }
        request.onerror = () => reject(new Error("storage"))
        request.onblocked = () => reject(new Error("storage"))
        request.onsuccess = () => {
          const db = request.result
          db.onversionchange = () => {
            db.close()
            this.opening = undefined
          }
          resolve(db)
        }
      }).catch((error) => {
        this.opening = undefined
        throw error
      })
    return this.opening
  }
  async read(owner: string) {
    const db = await this.open()
    return new Promise<AccountSave | null>((resolve, reject) => {
      const tx = db.transaction("accounts", "readonly"),
        request = tx.objectStore("accounts").get(owner)
      tx.oncomplete = () => resolve(request.result ?? null)
      tx.onabort = tx.onerror = () => reject(new Error("storage"))
    })
  }
  async change(owner: string, work: Change) {
    const db = await this.open()
    return new Promise<AccountSave>((resolve, reject) => {
      const tx = db.transaction(["accounts", "backups"], "readwrite", { durability: "strict" })
      const accounts = tx.objectStore("accounts"),
        backups = tx.objectStore("backups"),
        request = accounts.get(owner)
      let result: AccountSave
      request.onsuccess = () => {
        try {
          result = work(request.result ?? freshAccount(owner), (raw, source) => {
            const now = Date.now()
            backups.put({
              id: crypto.randomUUID(),
              owner,
              raw,
              source,
              createdAt: now,
              expiresAt: now + 30 * 86400000,
            } satisfies Backup)
          })
          if (result.owner !== owner) throw new Error("scope")
          accounts.put(result)
        } catch {
          tx.abort()
        }
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = tx.onerror = () => reject(new Error("storage"))
    })
  }
  async backups(owner: string) {
    const db = await this.open()
    return new Promise<Backup[]>((resolve, reject) => {
      const tx = db.transaction("backups", "readwrite"),
        store = tx.objectStore("backups")
      const request = store.index("owner").getAll(owner)
      const expired = store.index("expiresAt").openCursor(IDBKeyRange.upperBound(Date.now()))
      let count = 0
      expired.onsuccess = () => {
        const cursor = expired.result
        if (cursor && count++ < 500) {
          cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve(request.result.filter((b) => b.expiresAt > Date.now()))
      tx.onabort = tx.onerror = () => reject(new Error("storage"))
    })
  }
}
