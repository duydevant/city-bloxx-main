"use client"
import Link from "next/link"
import { useI18n } from "@/lib/i18n"
export function UserNavMenu(){const {locale}=useI18n();return <Link href="/profile" className="web-guest">{locale==="vi"?"Khách":"Guest"}</Link>}
