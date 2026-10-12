"use client"
import { useEffect, useState } from "react"
import { emptySave, migrateSave, type GameSave } from "../../../packages/city-bloxx-core/src/index"
import { useI18n } from "@/lib/i18n"
export function PersonalPreview(){
  const {locale}=useI18n(),vi=locale==="vi",[save,setSave]=useState<GameSave|null>(null),[failed,setFailed]=useState(false)
  useEffect(()=>{const timer=window.setTimeout(()=>{try{const raw=localStorage.getItem("city-bloxx.quick-save.v2");setSave(raw?migrateSave(JSON.parse(raw)):emptySave())}catch{setFailed(true)}},0);return()=>window.clearTimeout(timer)},[])
  return <section className="web-card" aria-label={vi?"Tiến trình cá nhân":"Personal progress"}><h2>{vi?"Trên thiết bị này":"On this device"}</h2>{failed?<p>{vi?"Chưa đọc được save. Mở game để thử phục hồi; dữ liệu cũ được giữ.":"Save could not be read. Open the game to recover it; original data is kept."}</p>:save?<dl className="web-values"><div><dt>{vi?"Kỷ lục Standard":"Standard best"}</dt><dd>{save.standardQuickBest}</dd></div><div><dt>{vi?"Dân số thành phố":"City population"}</dt><dd>{save.city.lots.reduce((n,b)=>n+(b?.population??0),0)}</dd></div></dl>:<p>{vi?"Đang đọc tiến trình trên thiết bị…":"Reading progress on this device…"}</p>}</section>
}
