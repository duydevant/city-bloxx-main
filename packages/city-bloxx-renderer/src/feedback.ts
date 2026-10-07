/** Cosmetic only: a roof does not advance the body's Perfect streak. */
export function placementLabel(quality: string, streak: number, roof = false, vi = false): string {
  if (vi) {
    if (quality !== "perfect") return ({ great: "RẤT TỐT", good: "TỐT", risky: "NGUY HIỂM", miss: "TRƯỢT" } as Record<string,string>)[quality] ?? quality;
    if (roof) return "MÁI HOÀN HẢO";
    if (streak === 2) return "HOÀN HẢO KÉP";
    if (streak === 3) return "BA LẦN HOÀN HẢO";
    return streak > 3 ? `HOÀN HẢO ×${streak}` : "HOÀN HẢO";
  }
  if (quality !== "perfect") return quality.toUpperCase();
  if (roof) return "PERFECT ROOF";
  if (streak === 2) return "DOUBLE PERFECT";
  if (streak === 3) return "TRIPLE PERFECT";
  return streak > 3 ? `PERFECT ×${streak}` : "PERFECT";
}
