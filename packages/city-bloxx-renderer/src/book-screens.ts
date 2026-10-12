import { COSMETIC_CATALOG, type CosmeticCategory } from "../../city-bloxx-content/cosmetics";
import { BUILDING_IDS, BUILDINGS, cosmeticItem, cosmeticProgress, equipmentFor, levelProgress, ownsCosmetic, type BuildingId, type GameSave, type RunEquipment } from "../../city-bloxx-core/src/index";
import type { QuickTowerRenderer } from "./index";
interface Options {
  panel: HTMLElement; renderer: QuickTowerRenderer; assets: string; save(): GameSave; vi(): boolean; className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void; button(label: string, action: () => void): HTMLButtonElement;
  home(): void; equip(id: BuildingId, equipment: RunEquipment): void; saveStatus(): string; retrySave(): void;
}
export function createBookScreens(o: Options) {
  let refresh: (()=>void)|null=null, generation=0, shownSave="";
  let lastPage=0,lastCollection=0;
  const t=(en:string,vi:string)=>o.vi()?vi:en;
  function clear(){refresh=null;generation++;o.panel.classList.remove("cb-book-panel");}
  function shell(title:string,body:string,actions:HTMLButtonElement[]){o.showPanel(title,body,actions);o.panel.classList.add("cb-book-panel");const box=document.createElement("section");box.className="cb-book-content";o.panel.querySelector(".cb-actions")!.before(box);return box;}
  function canonical(id:BuildingId):RunEquipment {
    const equipped=equipmentFor(o.save(),id);
    return {building:cosmeticItem(equipped.building,"building",id)?.id??`default-building-${id}`,roof:cosmeticItem(equipped.roof,"roof",id)?.id??`default-roof-${id}`,crane:cosmeticItem(equipped.crane,"crane",id)?.id??"default-crane"};
  }
  function saved(box:HTMLElement){const state=o.saveStatus();shownSave=state;const text=document.createElement("small");text.dataset.bookSave="";text.textContent=state==="pending"?t("Saving…","Đang lưu…"):state==="error"?t("Save failed; selection kept this session.","Lưu lỗi; lựa chọn vẫn giữ trong phiên."):t("Saved on this device / game host","Đã lưu trên thiết bị / nền tảng game");box.append(text);}
  function preview(box:HTMLElement,id:BuildingId,equipment:RunEquipment,locked:boolean,equipButton?:HTMLButtonElement){
    const canvas=document.createElement("canvas");canvas.className="cb-book-preview";canvas.setAttribute("role","img");canvas.setAttribute("aria-label",t("Three-floor cosmetic preview. No rewards.","Xem trước ba tầng. Không có thưởng.")+(locked?t(" Locked preview."," Chưa mở khóa."):""));
    const column=document.createElement("div");column.className="cb-book-preview-column";column.append(canvas);box.prepend(column);
    const status=document.createElement("small");status.dataset.bookAsset="";status.setAttribute("role","status");column.append(status);
    const retry=o.button(t("Retry artwork","Thử tải hình lại"),()=>load());retry.hidden=true;column.append(retry);
    async function load(){const token=++generation;status.textContent=t("Loading artwork…","Đang tải hình…");status.dataset.state="loading";retry.hidden=true;if(equipButton)equipButton.disabled=true;
      try{await o.renderer.loadEquipment(id,equipment);if(token!==generation||!refresh)return;o.renderer.drawPreview(canvas,id,equipment,locked);status.textContent=locked?t("Locked preview · no equipment changed","Xem trước đồ khóa · chưa đổi trang bị"):t("Artwork ready","Hình đã sẵn sàng");status.dataset.state="ready";if(equipButton)equipButton.disabled=locked||o.saveStatus()==="pending";}
      catch{if(token!==generation||!refresh)return;status.textContent=t("Artwork unavailable. Retry before equipping.","Chưa tải được hình. Thử lại trước khi trang bị.");status.dataset.state="error";retry.hidden=false;}
    }
    queueMicrotask(()=>{void load();});
  }
  function book(page=lastPage,collectionPage=lastCollection){
    lastPage=page;lastCollection=collectionPage;
    const save=o.save(),id=BUILDING_IDS[page];const actions:HTMLButtonElement[]=[];
    if(page>0)actions.push(o.button(t("Previous","Trước"),()=>book(page-1)));
    if(page<4)actions.push(o.button(t("Next","Tiếp"),()=>book(page+1)));
    if(id)actions.push(o.button(t("Customize","Tùy chỉnh"),()=>customize(id)));
    actions.push(o.button(t("Home","Trang chủ"),o.home));if(o.saveStatus()==="error")actions.push(o.button(t("Retry save","Thử lưu lại"),o.retrySave));
    const box=shell(`${t("Architecture Book","Sổ kiến trúc")} · ${id?o.className(id):t("Classic Brick collection","Bộ Gạch cổ điển")} · ${page+1}/5`,id?`${BUILDINGS[id].floors} ${t("body floors","tầng thân")} · ${t("Mastery level","Cấp thông thạo")} ${levelProgress(save.progression.masteryXP[id],20).level}\n${t("Adjacent requirements","Yêu cầu kề cạnh")}: ${BUILDINGS[id].requires.map(o.className).join(" + ")||t("None","Không có")}`:t("Collect 4 buildings, 4 roofs and the crane for the badge.","Sở hữu 4 nhà, 4 mái và cần cẩu để mở huy hiệu."),actions);
    const cards=document.createElement("div");cards.className="cb-book-cards";box.append(cards);
    if(id){
      for(const category of ["building","roof"] as const){const d=COSMETIC_CATALOG.find(d=>d.set==="brick"&&d.category===category&&d.classId===id)!,card=document.createElement("article"),title=document.createElement("strong"),progress=document.createElement("small");title.textContent=d.title[o.vi()?"vi":"en"];
        progress.textContent=`${cosmeticProgress(save,d)}/${d.target} ${category==="building"?t("completed towers","tháp hoàn thành"):t("Perfect body floors","tầng thân Hoàn hảo")} · ${ownsCosmetic(save,d)?t("Owned","Đã sở hữu"):t("Locked","Chưa mở")}`;
        card.append(title,progress);cards.append(card);
      }
      preview(box,id,canonical(id),false);
    }else{
      const collected=COSMETIC_CATALOG.filter(d=>d.set==="brick"&&d.category!=="badge"&&save.inventory.owned.includes(d.id));
      const badge=COSMETIC_CATALOG.find(d=>d.id==="brick-badge")!,owned=save.inventory.owned.includes(badge.id),card=document.createElement("article"),icon=document.createElement("img"),label=document.createElement("strong");card.className="cb-book-badge";
      icon.src=`${o.assets.replace(/\/$/,"")}/${badge.assets[0]}`;icon.width=32;icon.height=32;icon.alt="";icon.addEventListener("error",()=>{icon.hidden=true;},{once:true});
      label.textContent=`${owned?"★":"☆"} ${badge.title[o.vi()?"vi":"en"]} · ${collected.length}/9 · ${owned?t("Owned","Đã sở hữu"):t("Locked","Chưa mở")}`;card.append(icon,label);cards.append(card);
      const members=COSMETIC_CATALOG.filter(d=>d.set==="brick"&&d.category!=="badge");
      for(const item of members.slice(collectionPage*3,collectionPage*3+3)){const row=document.createElement("small");row.textContent=`${save.inventory.owned.includes(item.id)?"★":"☆"} ${item.title[o.vi()?"vi":"en"]}`;cards.append(row);}
      const pager=document.createElement("div");pager.className="cb-actions";
      if(collectionPage>0)pager.append(o.button(t("Earlier items","Vật phẩm trước"),()=>book(page,collectionPage-1)));
      if(collectionPage<2)pager.append(o.button(t("More items","Thêm vật phẩm"),()=>book(page,collectionPage+1)));
      cards.append(pager);
    }
    saved(box);refresh=()=>book(page,collectionPage);
  }
  function customize(id:BuildingId,step=0,draft=canonical(id)){
    const categories:CosmeticCategory[]=["building","roof","crane"],category=categories[step],save=o.save();
    const selected=category==="building"?draft.building:category==="roof"?draft.roof:draft.crane;
    const items=COSMETIC_CATALOG.filter(d=>d.category===category&&(d.classId===null||d.classId===id));
    const allOwned=(["building","roof","crane"] as const).every(c=>{const item=cosmeticItem(draft[c],c,id);return !!item&&item.available&&ownsCosmetic(save,item);});
    const equip=o.button(t("Equip selection","Trang bị đã chọn"),()=>{if(equip.disabled)return;o.equip(id,draft);customize(id,step,draft);});equip.disabled=true;equip.dataset.cosmeticEquip="";
    const actions=[equip];if(step>0)actions.push(o.button(t("Previous","Trước"),()=>customize(id,step-1,draft)));if(step<2)actions.push(o.button(t("Next","Tiếp"),()=>customize(id,step+1,draft)));actions.push(o.button(t("Back to Book","Về Sổ kiến trúc"),()=>book(BUILDING_IDS.indexOf(id))));if(o.saveStatus()==="error")actions.push(o.button(t("Retry save","Thử lưu lại"),o.retrySave));
    const box=shell(`${t("Customize","Tùy chỉnh")} · ${o.className(id)} · ${step+1}/3`,t("Cosmetics change appearance, never score. New runs/rebuilds use your selection.","Trang bị chỉ đổi hình, không tăng điểm. Áp dụng cho lượt mới/rebuild."),actions);
    const cards=document.createElement("div");cards.className="cb-book-cards";box.append(cards);
    for(const d of items){const card=document.createElement("article"),title=document.createElement("strong"),progress=document.createElement("small");title.textContent=d.title[o.vi()?"vi":"en"];progress.textContent=!d.available?t("Unavailable","Chưa có"):ownsCosmetic(save,d)?t("Owned","Đã sở hữu"):`${t("Locked","Chưa mở")} · ${cosmeticProgress(save,d)}/${d.target}`;
      const choose=o.button(t("Preview","Xem trước"),()=>customize(id,step,{...draft,[category]:d.id}));choose.dataset.cosmeticId=d.id;choose.setAttribute("aria-label",`${t("Preview","Xem trước")} ${d.title[o.vi()?"vi":"en"]}`);choose.setAttribute("aria-pressed",String(d.id===selected));choose.disabled=!d.available;card.append(title,progress,choose);cards.append(card);
    }
    preview(box,id,draft,!allOwned,equip);saved(box);refresh=()=>customize(id,step,draft);
  }
  return {book,clear,isOpen:()=>!!refresh,refresh:()=>refresh?.(),tick:()=>{if(refresh&&shownSave!==o.saveStatus())refresh();}};
}
