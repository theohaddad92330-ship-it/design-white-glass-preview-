import { BrandMark, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { CookieSettingsLink } from '@/features/cookie-consent/CookieSettingsLink'
import { Link } from '@/i18n/navigation'
import { loginUrl, signupUrl } from '@/lib/app-url'

type FooterLink = { key: string; href: string; external?: boolean }

const FOOTER_LINK = 'text-base font-sans text-[#b8b8cc] transition-colors hover:text-white'

const PRODUCT: FooterLink[] = [
  { key: 'product', href: '/product' },
  { key: 'useCases', href: '/use-cases' },
  { key: 'pricing', href: '/pricing' },
  // Ce que le produit REFUSE de faire, et le code qui l'en empêche. Placé dans
  // la colonne Produit et pas dans « Légal » : ce n'est pas une mention
  // obligatoire, c'est une caractéristique — et le pied de page est sur toutes
  // les pages, donc la page est à un clic de l'accueil.
  { key: 'safeguards', href: '/safeguards' },
  { key: 'beta', href: '/beta' },
  { key: 'webinar', href: '/webinar' },
  { key: 'demo', href: '/demo' },
]

const COMPANY: FooterLink[] = [
  { key: 'about', href: '/about' },
  { key: 'login', href: loginUrl(), external: true },
  { key: 'signup', href: signupUrl(), external: true },
]

const LEGAL: FooterLink[] = [
  { key: 'legal', href: '/legal' },
  { key: 'privacy', href: '/privacy' },
  { key: 'cgu', href: '/cgu' },
  { key: 'cgv', href: '/cgv' },
  { key: 'cookies', href: '/cookies' },
  { key: 'dpa', href: '/dpa' },
]

const LINKEDIN_URL = 'https://www.linkedin.com/company/bellum-it/'

function FooterColumn({
  title,
  links,
  label,
  extra,
}: {
  title: string
  links: FooterLink[]
  label: (key: string) => string
  extra?: ReactNode
}) {
  return (
    <div>
      <Text element="h4" size="xs" weight="medium" className="uppercase text-[#8a8aa0]">
        {title}
      </Text>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map(link => (
          <li key={link.key}>
            {link.external ? (
              <a href={link.href} className={FOOTER_LINK}>
                {label(link.key)}
              </a>
            ) : (
              <Link href={link.href} className={FOOTER_LINK}>
                {label(link.key)}
              </Link>
            )}
          </li>
        ))}
        {extra && <li>{extra}</li>}
      </ul>
    </div>
  )
}

export function Footer() {
  const t = useTranslations('common.footer')

  return (
    <footer className="border-t border-white/[0.06] bg-[#070710] pb-9 pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="shrink-0">
              <BrandMark
                size="md"
                logoClassName="text-white"
                textClassName="[font-family:'Clash_Display',sans-serif]"
              />
            </Link>
            <Text element="p" size="sm" color="text-zinc-500" className="mt-4 max-w-[34ch] leading-relaxed">
              {t('tagline')}
            </Text>
          </div>

          <FooterColumn title={t('columnProduct')} links={PRODUCT} label={t} />
          <FooterColumn title={t('columnCompany')} links={COMPANY} label={t} />
          <FooterColumn
            title={t('columnLegal')}
            links={LEGAL}
            label={t}
            extra={<CookieSettingsLink className={`${FOOTER_LINK} text-left`} />}
          />
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-6">
          <Text element="span" size="xs" className="text-[#5e5e74]">
            {t('rights', { year: new Date().getFullYear() })}
          </Text>
          <div className="flex items-center gap-5">
            <Link href="/status" className="text-[#5e5e74] transition-colors hover:text-[#b8b8cc]">
              <Text element="span" size="xs">
                {t('status')}
              </Text>
            </Link>
            <a
              href={LINKEDIN_URL}
              className="inline-flex items-center gap-2 text-[#5e5e74] transition-colors hover:text-[#b8b8cc]"
              aria-label="LinkedIn"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14zM8.34 17V10.2H6.1V17h2.24zM7.22 9.27a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6zM18 17v-3.73c0-2-1.07-2.93-2.5-2.93-1.15 0-1.67.63-1.96 1.08v-.92h-2.24V17h2.24v-3.77c0-.99.19-1.95 1.41-1.95 1.2 0 1.21 1.13 1.21 2.02V17H18z" />
              </svg>
              <Text element="span" size="xs">
                LinkedIn
              </Text>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
