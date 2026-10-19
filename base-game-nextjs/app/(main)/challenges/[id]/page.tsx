import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content";
import { PublicChallengePageView } from "@/modules/city-bloxx/social-pages";

export const metadata = webMetadata(
  "Beat This Tower Challenge",
  "Same-seed, same-version verified tower challenge.",
  "/challenges",
);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <WebContent
      title={["Beat This Tower", "Vượt Qua Tháp Này"]}
      description={[
        "Compete on the exact same seed, building class, and physics version.",
        "Thử sức trên cùng một hạt giống, loại công trình và phiên bản vật lý.",
      ]}
    >
      <PublicChallengePageView challengeId={id} />
    </WebContent>
  );
}
