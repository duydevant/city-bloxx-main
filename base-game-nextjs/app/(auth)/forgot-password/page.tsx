import { AuthForm } from "@/modules/account/auth-form"
import { WebContent } from "@/modules/city-bloxx/web-content"
export default function Page(){return <WebContent title={["Forgot password","Quên mật khẩu"]} description={["Request a password reset email.","Yêu cầu email đặt lại mật khẩu."]}><AuthForm mode="forgot"/></WebContent>}
