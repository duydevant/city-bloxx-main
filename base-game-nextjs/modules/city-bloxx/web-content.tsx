import Link from "next/link"
import { Suspense } from "react"
import type { Metadata } from "next"
import { QuickTower } from "./quick-tower"
import type { SessionScreen } from "../../../packages/city-bloxx-renderer/src/session"
export function Copy({en,vi}:{en:string;vi:string}){return <><span data-copy="en" lang="en">{en}</span><span data-copy="vi" lang="vi">{vi}</span></>}
export const WEB_LINKS=[
  ["/leaderboards","Leaderboards","Bảng xếp hạng"],
  ["/pvp","Solo PvP 1v1","Solo PvP 1v1"],
  ["/play","Quick Tower","Xây tháp nhanh"],["/play?screen=city","Build City","Xây thành phố"],
  ["/daily","Daily Tower","Tháp hằng ngày"],["/statistics","Statistics","Thống kê"],
  ["/my-towers","My towers","Tháp của tôi"],["/buildings","Architecture Book","Sổ kiến trúc"],
  ["/guide/build-city","City guide","Hướng dẫn City"],["/guide/daily","Daily guide","Hướng dẫn Daily"],
] as const
export function WebLinks(){return <nav className="web-links" aria-label="City Bloxx"><ul>{WEB_LINKS.map(([href,en,vi])=><li key={href}><Link href={href}><Copy en={en} vi={vi}/></Link></li>)}</ul></nav>}
export function webMetadata(title:string,description:string,path:string,personal=false):Metadata{return {title,description,alternates:{canonical:path},...(personal?{robots:{index:false,follow:true}}:{})}}
export function WebContent({title,description,screen,children}:{title:[string,string];description:[string,string];screen?:SessionScreen;children?:React.ReactNode}){return <article className="web-content"><h1><Copy en={title[0]} vi={title[1]}/></h1><p className="web-intro"><Copy en={description[0]} vi={description[1]}/></p><WebLinks/>{children}{screen&&<Suspense><QuickTower initialScreen={screen} content/></Suspense>}</article>}
