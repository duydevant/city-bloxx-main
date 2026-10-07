import type { MetadataRoute } from "next"
import { Routes } from "@/lib/routes"
import { siteConfig } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [Routes.HOME, Routes.PLAY, Routes.BUILD_CITY_GUIDE] as const

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
  }))
}
