import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
import { PersonalPreview } from "@/modules/city-bloxx/personal-preview"
import { AccountProfile } from "@/modules/account/account-profile"
export const metadata=webMetadata("Profile","Account details and progress on this device.","/profile",true)
export default function Page(){return <WebContent title={["Profile","Hồ sơ"]} description={["Manage your account. Progress remains on this device until cloud sync is connected.","Quản lý tài khoản. Tiến trình vẫn lưu trên thiết bị này cho đến khi kết nối đồng bộ đám mây."]}><AccountProfile/><PersonalPreview/></WebContent>}
