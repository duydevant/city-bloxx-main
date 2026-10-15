import { describe, it, expect, vi } from "vitest"
import { requestJson, ApiError } from "./api-client"
describe("same-origin account transport", () => {
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
