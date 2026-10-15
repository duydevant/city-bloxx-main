import { AuthForm } from "@/modules/account/auth-form"
import { WebContent } from "@/modules/city-bloxx/web-content"
export default function Page(){return <WebContent title={["Resend verification","Gửi lại email xác thực"]} description={["Request another verification link.","Yêu cầu liên kết xác thực mới."]}><AuthForm mode="resend"/></WebContent>}
