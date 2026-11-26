import { resolveBrand, type AccountSharePayload, type Brand } from '@bellum/contracts'
import { Box, BrailleLoader, Button, Logo, Text, TooltipButton } from '@bellum/ui'
import {
  Building2,
  Calendar,
  EyeOff,
  Globe,
  Linkedin,
  Mail,
  MapPin,
  Moon,
  Phone,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { safeHref } from '@/lib/safe-href'
import { useTheme } from '@/features/theme/theme-provider'

const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || 'https://bellum-ai.com'

type Props = { payload: AccountSharePayload }

/**
 * Read-only viewer for `/share/:slug`. Anonymous — no header, no sidebar,
 * no edit affordances. Defaults to the visitor's OS color scheme; the
 * toggle in the top-right persists their choice for this device.
 */
export function PublicSharePage({ payload }: Props) {
  const { t, i18n } = useTranslation('share')
  const { resolvedTheme, toggleTheme } = useTheme()
  const { account, contacts, expiresAt, brand, redactedFields } = payload
  const dateLocale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const expiry = new Date(expiresAt).toLocaleDateString(dateLocale)

  const facts: Array<{ label: string; value: React.ReactNode; icon?: typeof Building2 }> = [
    { label: t('facts.sector'), icon: Building2, value: account.sector },
    { label: t('facts.employees'), icon: Users, value: account.employees },
    { label: t('facts.revenue'), icon: TrendingUp, value: account.revenue },
    { label: t('facts.address'), icon: MapPin, value: account.headquarters },
    { label: t('facts.website'), icon: Globe, value: account.website },
  ].filter(f => f.value)

  // Grammaire `onboarding-accueil` : barre haute, en-tête de page (surtitre,
  // h1 = le compte, phrase = l'échéance) HORS des cartes, bandeau `.ob23-info`,
  // puis les cartes : faits, raison de la priorité, contacts au tableau commun.
  return (
    <Box display="flex" className="relative max-h-full flex-col overflow-y-auto bg-[var(--bellum-bg)] text-foreground">
      <BrandBar brand={brand} theme={resolvedTheme} onToggle={toggleTheme} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <Box data-testid="share-heading" className="mt-2">
          <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('header.kicker')}
          </span>
          <Text element="h1" size="3xl" weight="semibold" className="mt-3 truncate tracking-tight md:text-4xl">
            {account.company_name}
          </Text>
          <Text element="p" size="sm" className="mt-3 text-[var(--bellum-text-secondary)]">
            {t('header.sharedInfo', { date: expiry })}
          </Text>
        </Box>

        {/*
         * #2125.23/.26 — le destinataire d'un lien public sait EXPLICITEMENT
         * que le dossier a été réduit, plutôt que de deviner qu'un chiffre
         * d'affaires ou des contacts « manquent » (doctrine « non mesuré
         * n'est jamais 0 » : ici c'est « non montré », pas « pas mesuré »,
         * et la nuance se dit). Lu depuis `redactedFields`, pas codé en dur :
         * la liste vit à un seul endroit (SHARE_REDACTED_FIELDS).
         */}
        {redactedFields.length > 0 && (
          <Box
            role="note"
            display="flex"
            className="items-start gap-2.5 rounded-r-control border-l-2 border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)] px-4 py-3.5 text-[var(--bellum-text-secondary)]"
          >
            <EyeOff className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
            <Text element="p" size="xs">
              {t('redacted.notice')}
            </Text>
          </Box>
        )}

        {facts.length > 0 && (
          <Box as="section" className="rounded-card border border-[var(--bellum-border)] bg-card p-6">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
              {facts.map(({ label, icon: Icon, value }) => (
                <Box key={label} className="min-w-0">
                  <dt className="mb-1.5 text-xs font-medium text-[var(--bellum-text-muted)]">{label}</dt>
                  <dd className="flex min-w-0 items-center gap-1.5">
                    {Icon && <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />}
                    <Text element="span" size="sm" weight="medium" noWrap>
                      {value}
                    </Text>
                  </dd>
                </Box>
              ))}
            </dl>
          </Box>
        )}

        <PriorityCallout justification={account.priority_justification} />

        {contacts.length > 0 && (
          <Box as="section" className="space-y-3" aria-labelledby="share-contacts-title">
            <Text id="share-contacts-title" element="h2" size="base" weight="semibold">
              {t('contacts.title', { total: contacts.length })}
            </Text>
            <Box className="rounded-card border border-[var(--bellum-border)] bg-card px-4 py-2">
              {/* Coordonnées pro en CLAIR (c87), dans le tableau commun. */}
              <ResponsiveTable
                rows={contacts}
                rowKey={c => c.id}
                columns={[
                  {
                    key: 'name',
                    header: t('contacts.columns.name'),
                    mobile: 'title',
                    render: c => <span className="font-semibold">{c.full_name}</span>,
                  },
                  {
                    key: 'title',
                    header: t('contacts.columns.title'),
                    mobile: 'meta',
                    render: c => <span className="text-[var(--bellum-text-secondary)]">{c.title}</span>,
                  },
                  {
                    key: 'email',
                    header: t('contacts.columns.email'),
                    render: c =>
                      c.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                          {c.email}
                        </span>
                      ) : null,
                  },
                  {
                    key: 'phone',
                    header: t('contacts.columns.phone'),
                    render: c =>
                      c.phone ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Phone className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                          {c.phone}
                        </span>
                      ) : null,
                  },
                  {
                    key: 'linkedin',
                    header: t('contacts.columns.linkedin'),
                    render: c =>
                      c.linkedin_url ? (
                        <a
                          href={safeHref(c.linkedin_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-1.5 text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
                        >
                          <Linkedin className="size-3.5" aria-hidden />
                          LinkedIn
                        </a>
                      ) : null,
                  },
                ]}
              />
            </Box>
          </Box>
        )}

        <Box
          display="flex"
          className="items-center gap-2 border-t border-[var(--bellum-border)] pt-5 text-xs text-[var(--bellum-text-muted)]"
        >
          <Calendar className="size-3.5" aria-hidden />
          <span>{t('footer.validUntil', { date: expiry })}</span>
        </Box>
      </main>

      <PoweredByFooter brand={brand} />
    </Box>
  )
}

/*
 * ⚠️ Chargement et 404 affichent la marque du PRODUIT, et c'est le seul choix
 * juste : à ces deux instants on ne sait pas encore de quel espace vient le
 * lien — soit la réponse n'est pas arrivée, soit il n'y en a pas. Deviner
 * servirait la marque du dernier espace vu, ou ferait clignoter l'entête.
 */
const PRODUCT_BRAND = resolveBrand(null)

export function PublicShareLoading() {
  const { resolvedTheme, toggleTheme } = useTheme()
  return (
    <Box display="flex" className="relative min-h-full flex-col bg-[var(--bellum-bg)]">
      <BrandBar brand={PRODUCT_BRAND} theme={resolvedTheme} onToggle={toggleTheme} />
      <Box display="flex" className="flex-1 items-center justify-center">
        <BrailleLoader variant="grid-searching" dotSize={4} dotGap={2} />
      </Box>
    </Box>
  )
}

/**
 * Not-found for `/share/:slug` — en-tête de page, une carte avec le lien vers
 * le site, et le pied « propulsé par » de la marque du produit.
 */
export function PublicShareNotFound() {
  const { t } = useTranslation('share')
  const { resolvedTheme, toggleTheme } = useTheme()
  return (
    <Box display="flex" className="relative min-h-full flex-col bg-[var(--bellum-bg)] text-foreground">
      <BrandBar brand={PRODUCT_BRAND} theme={resolvedTheme} onToggle={toggleTheme} />

      {/* Même grammaire que le dossier : en-tête de page, puis la carte du geste. */}
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <Box className="mt-2">
          <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('header.kicker')}
          </span>
          <Text element="h1" size="3xl" weight="semibold" className="mt-3 tracking-tight md:text-4xl">
            {t('notFound.title')}
          </Text>
          <Text element="p" size="sm" className="mt-3 max-w-[78ch] text-[var(--bellum-text-secondary)]">
            {t('notFound.message')}
          </Text>
        </Box>
        <Box className="max-w-2xl rounded-card border border-[var(--bellum-border)] bg-card p-6 md:p-9">
          <Button asChild variant="outline">
            <a href={MARKETING_URL} target="_blank" rel="noopener noreferrer">
              <Logo className="size-5" aria-hidden />
              {t('notFound.cta')}
            </a>
          </Button>
        </Box>
      </main>

      <PoweredByFooter brand={PRODUCT_BRAND} />
    </Box>
  )
}

/**
 * La raison de la priorité, rédigée par l'analyse — dans le bandeau `.ob23-info`
 * de la maquette. Aucun score en points (décision Louis, cadre Théo) : un
 * chiffre nu « 7/10 » sans ses axes n'est pas montré ; la raison, elle, l'est.
 */
function PriorityCallout({ justification }: { justification: string | null }) {
  const { t } = useTranslation('share')
  if (!justification) return null
  return (
    <Box
      as="section"
      aria-labelledby="share-priority-title"
      className="space-y-2 rounded-card border border-[var(--bellum-border)] bg-card p-6"
    >
      <Box display="flex" className="items-center gap-2">
        <Sparkles className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text id="share-priority-title" element="h2" size="base" weight="semibold">
          {t('priority.title')}
        </Text>
      </Box>
      <Text element="p" size="sm" leading="relaxed" className="max-w-[78ch] text-[var(--bellum-text-secondary)]">
        {justification}
      </Text>
    </Box>
  )
}

function BrandBar({
  brand,
  theme,
  onToggle,
}: {
  brand: Brand
  theme: 'dark' | 'light'
  onToggle: (e: MouseEvent) => void
}) {
  const { t } = useTranslation('nav')
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <Box
      display="flex"
      className="sticky top-0 z-10 h-16 shrink-0 items-center justify-between bg-[var(--bellum-bg)] px-4 md:px-8"
    >
      <Box display="flex" className="items-center gap-2">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={brand.name} className="h-6 w-6 object-contain" />
        ) : (
          <Logo aria-label={brand.name} className="h-6 w-6" />
        )}
        <Text element="span" size="sm" weight="semibold">
          {brand.name}
        </Text>
      </Box>
      <TooltipButton
        variant="ghost"
        size="icon"
        onClick={onToggle}
        tooltipSide="left"
        tooltip={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
        aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
        className="text-foreground"
      >
        <Icon className="size-4" />
      </TooltipButton>
    </Box>
  )
}

function PoweredByFooter({ brand }: { brand: Brand }) {
  const { t } = useTranslation('share')
  /*
   * ⚠️ Rien du tout chez un client en marque blanche.
   *
   * C'est la raison d'être de `isCustom` : une signature « propulsé par » et un
   * lien vers NOTRE site sur un dossier qu'un client envoie à son propre client
   * révèlent exactement ce que la marque blanche lui vend le droit de taire.
   * Le nom seul ne suffirait pas à décider — un espace peut ne poser que son
   * logo, et il est déjà chez lui.
   */
  if (brand.isCustom) return null
  return (
    <Box as="footer" className="border-t border-border py-6 px-4 md:px-6">
      <Box display="flex" className="flex-col items-center gap-1 text-center">
        <Box display="flex" className="items-center gap-1 text-xs text-muted-foreground">
          <span>{t('footer.poweredBy')}</span>
          <Logo aria-label={brand.name} className="h-6 w-6" />
          <Text element="span" size="xs" weight="semibold" color="text-foreground">
            {brand.name}
          </Text>
        </Box>
        <a
          href={MARKETING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('footer.discoverLink')}
        </a>
      </Box>
    </Box>
  )
}
