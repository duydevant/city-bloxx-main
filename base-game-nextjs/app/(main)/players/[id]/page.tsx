import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content";
import { PublicPlayerPageView } from "@/modules/city-bloxx/social-pages";

export const metadata = webMetadata(
  "Architect Profile",
  "Curated opt-in public player profile and verified published towers.",
  "/players",
);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <WebContent
      title={["Architect Profile", "Hồ sơ Kiến trúc sư"]}
      description={[
        "Curated opt-in public profile. Private account data and cloud saves are never exposed.",
        "Hồ sơ công khai tự chọn tham gia. Thông tin riêng tư và lưu trữ đám mây luôn được bảo vệ.",
      ]}
    >
      <PublicPlayerPageView playerId={id} />
    </WebContent>
  );
}
