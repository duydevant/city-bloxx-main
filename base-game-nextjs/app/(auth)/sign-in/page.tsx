import { AuthForm } from "@/modules/account/auth-form"
import { WebContent } from "@/modules/city-bloxx/web-content"
export default function Page(){return <WebContent title={["Sign in","Đăng nhập"]} description={["Sign in to your City Bloxx account.","Đăng nhập tài khoản City Bloxx của bạn."]}><AuthForm mode="signIn"/></WebContent>}
