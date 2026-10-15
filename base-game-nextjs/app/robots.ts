import type { MetadataRoute } from "next"
import { siteConfig } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow:["/sign-in","/sign-up","/profile","/statistics","/my-towers","/verify-email","/reset-password","/forgot-password","/resend-verification"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  }
}
