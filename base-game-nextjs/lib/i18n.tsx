"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

export const locales = ["en", "vi"] as const

export type Locale = (typeof locales)[number]

const STORAGE_KEY = "base-game.locale"

const en = {
  "language.label": "Language",
  "language.en": "English",
  "language.vi": "Tiếng Việt",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.signedOut": "Signed out successfully.",
  "nav.signOutFailed": "Could not sign out. Please try again.",
  "nav.account": "Account",
  "nav.profile": "Profile",
  "profile.title": "Profile",
  "profile.subtitle": "Manage your account details.",
  "profile.cardTitle": "Account information",
  "profile.loading": "Loading your profile...",
  "footer.tagline": "Build higher. Build cleaner. Build your city.",
  "home.description":
    "Time each drop, control the sway, and build a city one tower at a time.",
  "home.play": "Play Quick Tower",
  "play.title": "Quick Tower",
  "guide.title": "Build City guide",
  "guide.play": "Build your city",
  "nav.home": "Back home",
  "auth.signUp": "Sign up",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.unavailable": "Account sign-in is not available yet. You can play without an account.",
  "auth.emailInvalid": "Enter a valid email address.",
  "auth.passwordInvalid": "Use at least 8 characters.",
  "profile.signedIn": "Signed in.",
  "profile.signedOut": "Not signed in.",
  "error.notFound": "This page could not be found.",
} as const

export type TranslationKey = keyof typeof en
type TranslationDictionary = Record<TranslationKey, string>

const vi: TranslationDictionary = {
  "language.label": "Ngôn ngữ",
  "language.en": "English",
  "language.vi": "Tiếng Việt",
  "nav.signIn": "Đăng nhập",
  "nav.signOut": "Đăng xuất",
  "nav.signedOut": "Đã đăng xuất thành công.",
  "nav.signOutFailed": "Không thể đăng xuất. Vui lòng thử lại.",
  "nav.account": "Tài khoản",
  "nav.profile": "Hồ sơ",
  "profile.title": "Hồ sơ",
  "profile.subtitle": "Quản lý thông tin tài khoản của bạn.",
  "profile.cardTitle": "Thông tin tài khoản",
  "profile.loading": "Đang tải hồ sơ...",
  "footer.tagline": "Xây cao hơn, chuẩn hơn và tạo thành phố của riêng bạn.",
  "home.description":
    "Canh từng cú thả, giữ tòa nhà ổn định và xây thành phố của riêng bạn.",
  "home.play": "Chơi xây tháp nhanh",
  "play.title": "Xây tháp nhanh",
  "guide.title": "Hướng dẫn xây thành phố",
  "guide.play": "Xây thành phố",
  "nav.home": "Về trang đầu",
  "auth.signUp": "Đăng ký",
  "auth.email": "Email",
  "auth.password": "Mật khẩu",
  "auth.unavailable": "Đăng nhập tài khoản chưa sẵn sàng. Bạn vẫn có thể chơi không cần tài khoản.",
  "auth.emailInvalid": "Nhập địa chỉ email hợp lệ.",
  "auth.passwordInvalid": "Mật khẩu cần ít nhất 8 ký tự.",
  "profile.signedIn": "Đã đăng nhập.",
  "profile.signedOut": "Chưa đăng nhập.",
  "error.notFound": "Không tìm thấy trang này.",
}

const dictionaries: Record<Locale, TranslationDictionary> = { en, vi }
const localeTags: Record<Locale, string> = { en: "en-US", vi: "vi-VN" }

function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale)
}

function preferredLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {}

  const browserLocale = window.navigator.language.toLowerCase().split("-")[0]
  return isLocale(browserLocale) ? browserLocale : "en"
}

interface I18nContextValue {
  locale: Locale
  localeTag: string
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
  formatNumber: (value: number) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en")
  const pathname=usePathname()

  useEffect(() => {
    const timer = window.setTimeout(() => setLocaleState(preferredLocale()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    document.documentElement.lang = localeTags[locale]
    const titles:Record<string,[string,string]>={"/daily":["Daily Tower","Tháp hằng ngày"],"/statistics":["Statistics","Thống kê"],"/my-towers":["My towers","Tháp của tôi"],"/buildings":["Architecture Book","Sổ kiến trúc"],"/guide/daily":["Daily guide","Hướng dẫn Daily"]}
    const keys:Record<string,TranslationKey>={"/play":"play.title","/guide/build-city":"guide.title","/profile":"profile.title","/sign-in":"nav.signIn","/sign-up":"auth.signUp"}
    document.title=pathname==="/"?"City Bloxx Online":`${titles[pathname]?.[locale==="vi"?1:0]??dictionaries[locale][keys[pathname]??"error.notFound"]} | City Bloxx Online`
  }, [locale, pathname])

  const setLocale = useCallback((nextLocale: Locale) => {
      setLocaleState(nextLocale)
      try {
        window.localStorage.setItem(STORAGE_KEY, nextLocale)
      } catch {}
    }, [])

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: TranslationKey, values: Record<string, string | number> = {}) =>
      dictionaries[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
        values[name] === undefined ? match : String(values[name])
      )

    return {
      locale,
      localeTag: localeTags[locale],
      setLocale,
      t,
      formatNumber: (number) => number.toLocaleString(localeTags[locale]),
    }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error("useI18n must be used within I18nProvider")
  return context
}

export { isLocale }
