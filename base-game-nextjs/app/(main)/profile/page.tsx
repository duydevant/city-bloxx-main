import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
import { PersonalPreview } from "@/modules/city-bloxx/personal-preview"
import { AccountProfile } from "@/modules/account/account-profile"
import { GameProfile } from "@/modules/account/game-profile"

export const metadata = webMetadata("Profile", "Account details and progress on this device.", "/profile", true)

export default function Page() {
  return (
    <WebContent
      title={["Profile", "Hồ sơ"]}
      description={[
        "Manage your account and its separate progress. Open the save panel to sync, resolve conflicts or import Guest progress.",
        "Quản lý tài khoản và tiến trình riêng. Mở bảng lưu để đồng bộ, xử lý xung đột hoặc nhập tiến trình Khách.",
      ]}
    >
      <div className="auth-grid-layout">
        <AccountProfile />
        <GameProfile />
      </div>
      <PersonalPreview />
    </WebContent>
  )
}

