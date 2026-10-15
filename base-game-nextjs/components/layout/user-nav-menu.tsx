"use client"
import Link from "next/link"
import { useI18n } from "@/lib/i18n"
import { useAuthStore } from "@/lib/store/auth.store"
import { useSignIn } from "@/modules/account/auth-ui"
export function UserNavMenu() {
  const {locale}=useI18n(), auth=useAuthStore(), show=useSignIn()
  return auth.user ? <Link href="/profile" className="web-guest">{locale==="vi"?"Tài khoản":"Account"}</Link> : <button type="button" className="web-guest" onClick={show}>{locale==="vi"?"Đăng nhập":"Sign in"}</button>
}
