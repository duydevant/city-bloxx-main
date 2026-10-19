import { describe, it, expect, vi } from "vitest"
import { requestJson, ApiError } from "./api-client"
describe("same-origin account transport", () => {
  it("allows only the ranked gateway routes and encoded board queries", async () => {
    const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({success:true,data:{}}))))
    vi.stubGlobal("fetch",fetch)
    try {
      for(const path of ["daily/today","catalog","analytics/events","analytics/guest-events","runs/start","runs/finish","runs/00000000-0000-4000-8000-000000000001","leaderboards/quick?limit=20&cursor=abc%2D123","leaderboards/daily/me?dateUTC=2026-10-16"])
        await requestJson(`/city-bloxx/${path}`)
      expect(fetch).toHaveBeenCalledTimes(9)
      for(const path of ["/city-bloxx/runs/../admin","/admin/city-bloxx/runs","/city-bloxx/leaderboards/quick/other","/city-bloxx/leaderboards/quick?url=https://evil.test","//evil.test/city-bloxx/runs/start"])
        await expect(requestJson(path)).rejects.toThrow("invalid")
      expect(fetch).toHaveBeenCalledTimes(9)
    } finally {vi.unstubAllGlobals()}
  })
  it("uses the gateway, HttpOnly cookie credentials and no-store without a refresh-token body", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 }))
    vi.stubGlobal("fetch", fetch)
    try {
      expect(await requestJson("/auth/refresh", { method: "POST" })).toEqual({ ok: true })
      expect(fetch.mock.calls[0][0]).toBe("/api/v1/auth/refresh")
      expect(fetch.mock.calls[0][1]).toMatchObject({
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        method: "POST",
      })
      expect(fetch.mock.calls[0][1].body).toBeUndefined()
      await expect(requestJson("https://elsewhere.test/auth/login")).rejects.toThrow("invalid")
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it("keeps retry-after and sanitized errors, with no implicit network retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("private server details", { status: 429, headers: { "Retry-After": "120" } }),
      )
    vi.stubGlobal("fetch", fetch)
    try {
      await expect(requestJson("/auth/login", { method: "POST" })).rejects.toEqual(
        new ApiError("rate", 429, 120),
      )
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
