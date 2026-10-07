"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { useAuthStore } from "@/lib/store/auth.store"

/** TODO: khi nối BE thật, fetch profile thật (useQuery) thay vì chỉ đọc token. */
export default function ProfilePage() {
  const { t } = useI18n()
  const accessToken = useAuthStore((state) => state.accessToken)

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      <p className="mt-1 text-muted-foreground">{t("profile.subtitle")}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("profile.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {accessToken ? (
            <p className="text-sm text-muted-foreground">{t("profile.signedIn")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("profile.signedOut")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
