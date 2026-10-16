import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
import { Leaderboards } from "@/modules/city-bloxx/leaderboards"
export const metadata=webMetadata("Leaderboards","Server-verified Quick Standard and UTC Daily standings.","/leaderboards")
export default function Page(){return <WebContent title={["Leaderboards","Bảng xếp hạng"]} description={["Online results verified from recorded inputs. Personal saves do not publish scores.","Kết quả online được xác minh từ input. Save cá nhân không tự đưa điểm lên bảng."]}><Leaderboards/></WebContent>}
