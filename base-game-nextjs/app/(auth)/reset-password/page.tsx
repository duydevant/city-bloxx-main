import { AuthForm } from "@/modules/account/auth-form"
import { WebContent } from "@/modules/city-bloxx/web-content"
export default function Page(){return <WebContent title={["Reset password","Đặt lại mật khẩu"]} description={["Choose a new password using the link from your email.","Chọn mật khẩu mới bằng liên kết trong email."]}><AuthForm mode="reset"/></WebContent>}
