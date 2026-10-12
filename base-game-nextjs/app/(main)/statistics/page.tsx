import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
export const metadata=webMetadata("Statistics","Your tracked attempts, drop quality and progress for each building class on this device.","/statistics",true)
export default function Page(){return <WebContent title={["Statistics","Thống kê"]} description={["Overview, skill and class statistics from your local save. Older totals are not reconstructed.","Tổng quan, kỹ năng và thống kê từng loại nhà từ save trên thiết bị. Không dựng lại số liệu lịch sử chưa được ghi."]} screen="statistics"/>}
