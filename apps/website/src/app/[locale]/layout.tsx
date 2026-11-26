import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { AnalyticsConsentGate } from '@bellum/consent/react'
import { routing, type Locale } from '@/i18n/routing'
import { PlausibleScript } from '@/features/analytics/PlausibleScript'
import { WebsiteBanners } from '@/features/banners/WebsiteBanners'
import { SITE_URL } from '@/lib/app-url'
import { buildAlternates, localeUrl, ogLocale } from '@/lib/metadata'
import '../globals.css'

type LocaleParams = { params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export const viewport: Viewport = {
  themeColor: '#0a0a10',
  width: 'device-width',
  initialScale: 1,
}

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'common' })
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t('meta.defaultTitle'),
      template: '%s - BellumAI',
    },
    description: t('meta.defaultDescription'),
    applicationName: 'BellumAI',
    authors: [{ name: 'BellumAI' }],
    generator: 'Next.js',
    keywords: t('meta.keywords').split('|'),
    alternates: buildAlternates(locale as Locale, '/'),
    openGraph: {
      type: 'website',
      locale: ogLocale(locale as Locale),
      url: localeUrl(locale as Locale, '/'),
      siteName: 'BellumAI',
      title: t('meta.ogTitle'),
      description: t('meta.ogDescription'),
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('meta.ogTitle'),
      description: t('meta.ogDescription'),
      images: ['/opengraph-image'],
    },
    icons: { icon: '/favicon.ico' },
  }
}

export default async function LocaleLayout(props: { children: ReactNode } & LocaleParams) {
  const { locale } = await props.params
  const { children } = props
  if (!routing.locales.includes(locale as Locale)) {
    notFound()
  }
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: 'common' })
  const messages = await getMessages()

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BellumAI',
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.ico`,
    description: t('meta.organizationDescription'),
    sameAs: ['https://linkedin.com/company/bellum-ai', 'https://twitter.com/bellum_ai'],
  }

  return (
    <html lang={locale} className="dark">
      <body>
        {/*
          Mesure d'audience — derrière le consentement, et derrière lui SEULEMENT.
          Tant que le visiteur n'a pas répondu à la bannière, la porte est fermée :
          aucun script, aucune requête. Elle ne s'ouvre qu'après un « oui » explicite.
        */}
        <AnalyticsConsentGate>
          <PlausibleScript />
        </AnalyticsConsentGate>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <NextIntlClientProvider messages={messages}>
          {/* Admin-scheduled website banners (announcement / maintenance / offer). */}
          <WebsiteBanners locale={locale} />
          {children}
        </NextIntlClientProvider>
        <AnalyticsConsentGate>
          <Analytics />
        </AnalyticsConsentGate>
      </body>
    </html>
  )
}
