import Link from "next/link"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import type { Metadata } from "next"
export const metadata:Metadata={robots:{index:false,follow:false}}
export default function AuthLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <><header className="flex items-center justify-between border-b p-4"><Link href="/">City Bloxx Online</Link><LanguageSwitcher /></header>{children}</>
}
