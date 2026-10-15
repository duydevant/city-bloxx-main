import { AuthForm } from "@/modules/account/auth-form"
import { WebContent } from "@/modules/city-bloxx/web-content"
export default function Page(){return <WebContent title={["Verify email","Xác thực email"]} description={["Confirm the one-time link from your email.","Xác nhận liên kết dùng một lần trong email."]}><AuthForm mode="verify"/></WebContent>}
