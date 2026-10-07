"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"

type SignInValues = { email:string;password:string }

export default function SignInPage() {
  const { t } = useI18n()
  const localizedSchema = z.object({
    email:z.string().email(t("auth.emailInvalid")),
    password:z.string().min(8,t("auth.passwordInvalid")),
  })
  const form = useForm<SignInValues>({
    resolver: zodResolver(localizedSchema),
    defaultValues: { email: "", password: "" },
  })

  // TODO: nối BE thật — gọi loginApi() từ lib/api/auth.api.ts, lưu token qua
  // useAuthStore().setTokens(accessToken, refreshToken), rồi redirect.
  const onSubmit = form.handleSubmit(async () => {
    toast.error(t("auth.unavailable"))
  })

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("nav.signIn")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <Field>
              <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && <p role="alert">{t("auth.emailInvalid")}</p>}
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password && <p role="alert">{t("auth.passwordInvalid")}</p>}
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t("nav.signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
