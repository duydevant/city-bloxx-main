import { AuthForm } from "@/modules/account/auth-form"
import { WebContent } from "@/modules/city-bloxx/web-content"
export default function Page(){return <WebContent title={["Create account","Tạo tài khoản"]} description={["Create an account and verify your email.","Tạo tài khoản và xác thực email của bạn."]}><AuthForm mode="signUp"/></WebContent>}
