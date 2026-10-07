"use client"

import Link from "next/link"
import { UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/lib/store/auth.store"
import { useI18n } from "@/lib/i18n"
import { Routes } from "@/lib/routes"

/** TODO: khi nối BE thật, thay "signed in" check bằng profile query thật
 * (ví dụ useQuery lấy /auth/profile) để hiện tên/avatar người dùng. */
export function UserNavMenu() {
  const { t } = useI18n()
  const accessToken = useAuthStore((state) => state.accessToken)
  const clearTokens = useAuthStore((state) => state.clearTokens)

  if (!accessToken) {
    return (
      <Button size="sm" nativeButton={false} render={<Link href={Routes.SIGN_IN} />}>
        {t("nav.signIn")}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("nav.account")} />}>
        <UserIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={Routes.PROFILE} />}>{t("nav.profile")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => clearTokens()}>{t("nav.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
