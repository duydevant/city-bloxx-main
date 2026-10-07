/** Cấu hình site tĩnh, đọc từ env. Khi project có CMS, thay bằng fetch từ BE. */
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "City Bloxx Online",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  description: "Build a skyline one perfectly timed floor at a time.",
}
