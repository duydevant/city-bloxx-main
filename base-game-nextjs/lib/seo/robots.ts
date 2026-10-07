export function pageRobots(websiteNoindex: boolean, contentRobots?: string | null) {
  if (websiteNoindex) return "noindex"
  return contentRobots || "index, follow"
}
