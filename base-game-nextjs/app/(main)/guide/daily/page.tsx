import Link from "next/link"
import { WebContent, Copy, webMetadata } from "@/modules/city-bloxx/web-content"
import { SESSION_TEXT } from "../../../../../packages/city-bloxx-content/session-locales"
const items=[
  "Same UTC date and recipe give everyone the same tower. Local results are personal and not server verified.",
  "Build 20 Industrial body floors, including the unscored foundation, then try the roof once. Three lives; no Assist or continue.",
  "Only complete bodies compete for your Daily best. A missed roof still completes the body. Failed attempts keep their own best height.",
  "One scored body drop credits the starting UTC day. Opening the menu or placing only the foundation does not count. Retry as often as you like.",
  "The UTC day changes at 00:00 UTC, not local midnight. A saved run keeps its original date, seed and rules across midnight, pause, resize and language changes.",
  "Daily is available before City unlocks. Completing it does not unlock City classes or change Quick best scores. Moving the clock back never adds older streak days.",
] as const
export const metadata=webMetadata("Daily guide","Understand Daily UTC recipes, body completion, personal bests, streaks and saved runs.","/guide/daily")
export default function Page(){return <WebContent title={["Daily guide","Hướng dẫn Daily"]} description={["A new shared tower each UTC day. Play at your own pace.","Một tòa tháp chung mới mỗi ngày UTC. Chơi theo nhịp của bạn."]}>{items.map((en,i)=><section className="web-card" key={en}><h2>{i+1}/6</h2><p><Copy en={en} vi={SESSION_TEXT[en]}/></p></section>)}<div className="web-cta"><Link href="/play?screen=daily"><Copy en="Play Daily" vi="Chơi Daily"/></Link></div></WebContent>}
