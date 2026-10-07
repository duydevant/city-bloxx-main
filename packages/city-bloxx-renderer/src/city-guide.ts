export interface GuideSection { heading: string; items: string[] }
export function cityGuide(vi = false): { title: string; sections: GuideSection[]; pages: string[] } {
  const sections:GuideSection[] = vi ? [
    {heading:"1. Chọn ô đất và loại nhà",items:[
      "Chạm/click để chọn ô. Ô xanh hợp lệ; hover chỉ xem gợi ý.",
      "Nhà ở: 10 tầng, không cần nhà kề bên.","Công nghiệp: 20 tầng, cần kề Nhà ở.",
      "Văn phòng: 30 tầng, cần kề Nhà ở + Công nghiệp.","Cao tầng: 40 tầng, cần kề cả ba loại."
    ]},
    {heading:"2. Quy tắc nhà liền cạnh",items:[
      "Chỉ tính trên, dưới, trái, phải; không tính đường chéo.",
      "Nhà ở (3,3) + Công nghiệp (3,4): chưa có ô trống kề cả hai để đặt Văn phòng.",
      "Thêm Nhà ở (2,3), rồi xây Văn phòng tại (2,4)."
    ]},
    {heading:"3. Thả tầng và đặt mái",items:[
      "Chạm, click, Space hoặc Enter để thả một tầng.",
      "Tầng móng giữ vị trí thả: không chấm chất lượng, mất mạng hay tạo combo.",
      "Các tầng sau chấm chất lượng lúc đáp, theo độ lệch so với đỉnh tháp.",
      "Đủ thân nhà thì thả mái riêng. Mái chỉ có một cơ hội."
    ]},
    {heading:"4. Các mức chất lượng",items:[
      "Hoàn hảo: lệch ≤5%.","Rất tốt: lệch >5–15%.","Tốt: lệch >15–30%.",
      "Nguy hiểm: lệch >30–<40%.","Trượt: lệch ≥40%. Ba lần trượt kết thúc lượt xây."
    ]},
    {heading:"5. Nhận nhà, mở khóa và lưu",items:[
      "Đủ thân nhà + Nhận tòa nhà: mở loại tiếp theo. Trượt mái vẫn mở; nhà dở không mở.",
      "Xây lại giữ nhà cũ đến khi nhận kết quả; hủy công trình cũng giữ nhà cũ.",
      "Phá nhà trừ dân số, nhưng không khóa lại loại nhà đã mở.","Tiến trình đang xây được lưu để tiếp tục."
    ]},
    {heading:"6. Dân số, combo và Hỗ trợ",items:[
      "Dân số cộng theo chất lượng tầng và combo. Dù/người chỉ minh họa, không phải mỗi sprite là một dân.",
      "Hoàn hảo liên tiếp tạo chuỗi và làm mới combo. Thanh combo chỉ hiện khi còn hoạt động.",
      "Hỗ trợ làm cần cẩu chậm hơn, có kỷ lục riêng; chỉ dùng trong Xây tháp nhanh.",
      "Giảm chuyển động bớt hiệu ứng phụ; không thay đổi cách chấm điểm."
    ]}
  ] : [
    {heading:"1. Choose a lot and building",items:[
      "Click/tap to select a lot. Green means valid; hover only shows a tooltip.",
      "Residential: 10 floors; no neighbor required.","Industrial: 20 floors; beside Residential.",
      "Office: 30 floors; beside Residential + Industrial.","High-rise: 40 floors; beside all three types."
    ]},
    {heading:"2. Edge-adjacent neighbors",items:[
      "Only up, down, left and right count. Diagonals do not count.",
      "Residential (3,3) + Industrial (3,4): no empty lot is beside both for an Office yet.",
      "Add Residential (2,3), then build Office at (2,4)."
    ]},
    {heading:"3. Drop floors and the roof",items:[
      "Tap, click, Space or Enter to drop one floor.",
      "The foundation stays at release position: no quality score, lost life or combo.",
      "Later floors are judged at impact, by displacement from the top of the tower.",
      "Finish the body, then drop the separate roof. You get only one roof attempt."
    ]},
    {heading:"4. Placement quality bands",items:[
      "Perfect: displacement ≤5%.","Great: >5–15%.","Good: >15–30%.",
      "Risky: >30–<40%.","Miss: ≥40%. Three misses end construction."
    ]},
    {heading:"5. Accept, unlock and save",items:[
      "Complete the body and Accept building to unlock the next type. A missed roof still unlocks; an unfinished body does not.",
      "Rebuilding keeps the old building until acceptance. Cancel also keeps it.",
      "Demolition removes population, not unlocked tiers.","Pending construction is saved for resuming."
    ]},
    {heading:"6. Population, combo and Assist",items:[
      "Population depends on floor quality and combo. Parachutists represent residents; one sprite does not equal one resident.",
      "Consecutive Perfects grow the streak and refresh combo. The combo bar appears only while active.",
      "Assist swings slower and has its own best score; it is for Quick Tower only.",
      "Reduced motion limits extra visual effects, not scoring."
    ]}
  ];
  return {title:vi?"Hướng dẫn xây thành phố":"Build City guide",sections,
    pages:sections.map(section=>[section.heading,...section.items].join("\n"))};
}
