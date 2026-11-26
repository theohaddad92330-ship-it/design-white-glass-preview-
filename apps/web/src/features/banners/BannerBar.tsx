import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, type LucideProps } from 'lucide-react'
import type { BannerVariant, PublicBanner } from '@bellum/contracts'
import { Banner, bannerActionClassName, type BannerTone } from '@/components/layout/Banner'
import { dismissBanner, isBannerDismissed } from './banner-dismiss'
import { normalizeBannerLocale } from './locale'
import { useActiveBanners } from './useBanners'

// Une variante opérateur = un état de la grammaire de bandeau commune (`Banner`).
const VARIANT_TONE: Record<BannerVariant, BannerTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  critical: 'danger',
}

const VARIANT_ICON: Record<BannerVariant, ComponentType<LucideProps>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
}

function BannerRow({ banner, onDismiss }: { banner: PublicBanner; onDismiss: (banner: PublicBanner) => void }) {
  const { t, i18n } = useTranslation('common')
  const locale = normalizeBannerLocale(i18n.language)
  const tone = VARIANT_TONE[banner.variant]
  const body = banner.body[locale]
  const cta = banner.cta ? { url: banner.cta.url, label: banner.cta.label[locale] } : null

  return (
    <Banner
      layout="app"
      tone={tone}
      icon={VARIANT_ICON[banner.variant]}
      title={banner.title[locale]}
      actions={
        cta ? (
          <a href={cta.url} target="_blank" rel="noreferrer" className={bannerActionClassName(tone)}>
            {cta.label}
          </a>
        ) : null
      }
      onDismiss={banner.dismissible ? () => onDismiss(banner) : undefined}
      dismissLabel={t('banners.dismiss')}
      data-banner-id={banner.id}
      data-banner-variant={banner.variant}
    >
      {body}
    </Banner>
  )
}

/**
 * Persistent top-of-screen banner bar for the user app. Fetches the active
 * app-placement banners and renders them stacked in priority order (as returned
 * by the API), styled per variant. Dismissible banners can be closed and the
 * dismissal is persisted per `id:version` in localStorage — a re-published
 * banner (new version) reappears. Non-dismissible banners (e.g. a maintenance
 * notice) always show. Renders nothing (no layout impact) when there is nothing
 * to show, so it never breaks the app shell.
 */
export function BannerBar() {
  const { t } = useTranslation('common')
  const { data: banners } = useActiveBanners()
  // Session-scoped dismissals for immediate re-render; localStorage persists
  // them across reloads.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set())

  const visible = (banners ?? []).filter(banner => {
    if (!banner.dismissible) return true
    const key = `${banner.id}:${banner.version}`
    return !dismissedKeys.has(key) && !isBannerDismissed(banner.id, banner.version)
  })

  if (visible.length === 0) return null

  const handleDismiss = (banner: PublicBanner) => {
    dismissBanner(banner.id, banner.version)
    setDismissedKeys(prev => new Set(prev).add(`${banner.id}:${banner.version}`))
  }

  return (
    <div className="w-full shrink-0" role="region" aria-label={t('banners.region')}>
      {visible.map(banner => (
        <BannerRow key={banner.id} banner={banner} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
