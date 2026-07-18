import * as i18n from "@solid-primitives/i18n"
import { createEffect, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { Persist, persisted } from "@/utils/persist"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import { dict as uiEn } from "@opencode-ai/ui/i18n/en"
import { dict as uiZh } from "@opencode-ai/ui/i18n/zh"

export type Locale =
  | "en"
  | "zh"
  | "zht"
  | "ko"
  | "de"
  | "es"
  | "fr"
  | "da"
  | "ja"
  | "pl"
  | "ru"
  | "uk"
  | "ar"
  | "no"
  | "br"
  | "th"
  | "bs"
  | "tr"

type RawDictionary = typeof en & typeof uiEn
type Dictionary = i18n.Flatten<RawDictionary>
type Source = { dict: Record<string, string> }

function cookie(locale: Locale) {
  return `oc_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

const LOCALES: readonly Locale[] = [
  "en",
  "zh",
  "zht",
  "ko",
  "de",
  "es",
  "fr",
  "da",
  "ja",
  "pl",
  "ru",
  "uk",
  "bs",
  "ar",
  "no",
  "br",
  "th",
  "tr",
]

const INTL: Record<Locale, string> = {
  en: "en",
  zh: "zh-Hans",
  zht: "zh-Hant",
  ko: "ko",
  de: "de",
  es: "es",
  fr: "fr",
  da: "da",
  ja: "ja",
  pl: "pl",
  ru: "ru",
  uk: "uk",
  ar: "ar",
  no: "nb-NO",
  br: "pt-BR",
  th: "th",
  bs: "bs",
  tr: "tr",
}

const LABEL_KEY: Record<Locale, keyof Dictionary> = {
  en: "language.en",
  zh: "language.zh",
  zht: "language.zht",
  ko: "language.ko",
  de: "language.de",
  es: "language.es",
  fr: "language.fr",
  da: "language.da",
  ja: "language.ja",
  pl: "language.pl",
  ru: "language.ru",
  uk: "language.uk",
  ar: "language.ar",
  no: "language.no",
  br: "language.br",
  th: "language.th",
  bs: "language.bs",
  tr: "language.tr",
}

const base = i18n.flatten({ ...en, ...uiEn })
const simplifiedChinese = { ...base, ...i18n.flatten({ ...zh, ...uiZh }) } as Dictionary
const dicts = new Map<Locale, Dictionary>([
  ["en", base],
  ["zh", simplifiedChinese],
])

const merge = (app: Promise<Source>, ui: Promise<Source>) =>
  Promise.all([app, ui]).then(([a, b]) => ({ ...base, ...i18n.flatten({ ...a.dict, ...b.dict }) }) as Dictionary)

const loaders: Record<Exclude<Locale, "en" | "zh">, () => Promise<Dictionary>> = {
  zht: () => merge(import("@/i18n/zht"), import("@opencode-ai/ui/i18n/zht")),
  ko: () => merge(import("@/i18n/ko"), import("@opencode-ai/ui/i18n/ko")),
  de: () => merge(import("@/i18n/de"), import("@opencode-ai/ui/i18n/de")),
  es: () => merge(import("@/i18n/es"), import("@opencode-ai/ui/i18n/es")),
  fr: () => merge(import("@/i18n/fr"), import("@opencode-ai/ui/i18n/fr")),
  da: () => merge(import("@/i18n/da"), import("@opencode-ai/ui/i18n/da")),
  ja: () => merge(import("@/i18n/ja"), import("@opencode-ai/ui/i18n/ja")),
  pl: () => merge(import("@/i18n/pl"), import("@opencode-ai/ui/i18n/pl")),
  ru: () => merge(import("@/i18n/ru"), import("@opencode-ai/ui/i18n/ru")),
  uk: () => merge(import("@/i18n/uk"), import("@opencode-ai/ui/i18n/uk")),
  ar: () => merge(import("@/i18n/ar"), import("@opencode-ai/ui/i18n/ar")),
  no: () => merge(import("@/i18n/no"), import("@opencode-ai/ui/i18n/no")),
  br: () => merge(import("@/i18n/br"), import("@opencode-ai/ui/i18n/br")),
  th: () => merge(import("@/i18n/th"), import("@opencode-ai/ui/i18n/th")),
  bs: () => merge(import("@/i18n/bs"), import("@opencode-ai/ui/i18n/bs")),
  tr: () => merge(import("@/i18n/tr"), import("@opencode-ai/ui/i18n/tr")),
}

function loadDict(locale: Locale) {
  const hit = dicts.get(locale)
  if (hit) return Promise.resolve(hit)
  if (locale === "en" || locale === "zh") return Promise.resolve(locale === "zh" ? simplifiedChinese : base)
  const load = loaders[locale]
  return load().then((next: Dictionary) => {
    dicts.set(locale, next)
    return next
  })
}

export function loadLocaleDict(locale: Locale) {
  return loadDict(locale).then(() => undefined)
}

export const DEFAULT_LOCALE: Locale = "zh"

export function normalizeLocale(value: string): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE
}

export function resolveInitialLocale(input: { requested?: Locale; stored?: Locale } = {}): Locale {
  return input.requested ?? input.stored ?? DEFAULT_LOCALE
}

function readStoredLocale() {
  if (typeof localStorage !== "object") return
  try {
    const raw = localStorage.getItem("opencode.global.dat:language")
    if (!raw) return
    const next = JSON.parse(raw) as { locale?: string }
    if (typeof next?.locale !== "string") return
    return normalizeLocale(next.locale)
  } catch {
    return
  }
}

const warm = resolveInitialLocale({ stored: readStoredLocale() })
if (warm !== "en") void loadDict(warm)

export const { use: useLanguage, provider: LanguageProvider } = createSimpleContext({
  name: "Language",
  gate: false,
  init: (props: { locale?: Locale }) => {
    const initial = resolveInitialLocale({ requested: props.locale, stored: readStoredLocale() })
    const [store, setStore, _, ready] = persisted(
      Persist.global("language", ["language.v1"]),
      createStore({
        locale: initial,
      }),
    )

    const locale = createMemo<Locale>(() => normalizeLocale(store.locale))
    const intl = createMemo(() => INTL[locale()])

    const [dict] = createResource(locale, loadDict, {
      initialValue: dicts.get(initial) ?? base,
    })

    const t = i18n.translator(() => dict() ?? base, i18n.resolveTemplate) as (
      key: keyof Dictionary,
      params?: Record<string, string | number | boolean>,
    ) => string

    const label = (value: Locale) => t(LABEL_KEY[value])

    createEffect(() => {
      if (typeof document !== "object") return
      document.documentElement.lang = locale()
      document.cookie = cookie(locale())
    })

    return {
      ready,
      locale,
      intl,
      locales: LOCALES,
      label,
      t,
      setLocale(next: Locale) {
        setStore("locale", normalizeLocale(next))
      },
    }
  },
})
