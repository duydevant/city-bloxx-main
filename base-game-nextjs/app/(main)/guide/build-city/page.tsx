"use client"
import Link from "next/link"
import { useI18n } from "@/lib/i18n"
import { cityGuide } from "../../../../../packages/city-bloxx-renderer/src/city-guide"

export default function BuildCityGuidePage() {
  const { locale, t } = useI18n()
  const guide = cityGuide(locale === "vi")
  return <article className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="mb-6 text-3xl font-bold">{guide.title}</h1>
    <div className="flex flex-col gap-4">
      {guide.sections.map((section,index)=><section key={index} className="rounded-xl border p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-bold">{section.heading}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          {section.items.map(item=><li key={item}>{item}</li>)}
        </ul>
      </section>)}
    </div>
    <Link href="/play" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("guide.play")}</Link>
  </article>
}
