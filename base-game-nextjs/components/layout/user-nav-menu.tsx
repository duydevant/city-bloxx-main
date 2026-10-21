"use client"

import Link from "next/link"
import { LogIn, User } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useAuthStore } from "@/lib/store/auth.store"
import { useSignIn } from "@/modules/account/auth-ui"

export function UserNavMenu() {
  const { locale } = useI18n(),
    auth = useAuthStore(),
    show = useSignIn()

  return auth.user ? (
    <Link href="/profile" className="web-guest">
      <User className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      <span>{locale === "vi" ? "Tài khoản" : "Account"}</span>
    </Link>
  ) : (
    <button type="button" className="web-guest" onClick={show}>
      <LogIn className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      <span>{locale === "vi" ? "Đăng nhập" : "Sign in"}</span>
    </button>
  )
}
