import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content";
import { PublicTowerPageView } from "@/modules/city-bloxx/social-pages";

export const metadata = webMetadata(
  "Published Tower",
  "Server-verified Quick Standard or Daily tower with share card and Beat This Tower challenge.",
  "/towers",
);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <WebContent
      title={["Published Tower", "Tháp đã xuất bản"]}
      description={[
        "Opt-in server-verified tower summary, 1200×630 share card, and same-seed challenge.",
        "Bản tóm tắt tháp đã xác minh tuỳ chọn công khai, thẻ chia sẻ 1200×630 và thử thách cùng hạt giống.",
      ]}
    >
      <PublicTowerPageView towerId={id} />
    </WebContent>
  );
}
