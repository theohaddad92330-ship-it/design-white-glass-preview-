import type { FieldSource } from '@bellum/contracts'
import type { AnalysisApolloOrgEnrichment } from '@bellum/contracts'
import { Badge, Card, Text } from '@bellum/ui'
import { Building2, Linkedin, MapPin, Phone, Twitter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pickHeadcount } from '../synthesis/accountHeadcount'
import { humanizeApolloValue, useApolloLabel } from '@/lib/apolloVocabulary'
import { apolloRegistryConflicts, type RegistryFacts } from './apolloRegistryConflict'
import { safeHref } from '@/lib/safe-href'

/** « mars 2024 » depuis `YYYY-MM-DD` ; `null` si absente ou illisible (jamais devinée). */
function fundingRoundMonth(value: string | undefined, locale: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value ?? '')
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

/** La période de croissance d'effectif à montrer : 12 mois, sinon 6, sinon 24 ; `null` si aucune n'est une mesure (absente, −100 %, ou que des zéros). */
function pickHeadcountGrowth(
  growth: AnalysisApolloOrgEnrichment['headcountGrowth'],
): { ratio: number; months: 6 | 12 | 24 } | null {
  const candidates = [
    { ratio: growth?.twelveMonths, months: 12 as const },
    { ratio: growth?.sixMonths, months: 6 as const },
    { ratio: growth?.twentyFourMonths, months: 24 as const },
  ]
  // −100 % pour une entreprise qu'on lit encore = la source n'a pas d'historique, pas une mesure.
  const measured = candidates.filter(
    (c): c is { ratio: number; months: 6 | 12 | 24 } =>
      typeof c.ratio === 'number' && Number.isFinite(c.ratio) && c.ratio > -1,
  )
  // Que des zéros : historique vide renvoyé à 0 — une absence ne s'affiche jamais « 0 » (GA-18).
  if (measured.every(c => c.ratio === 0)) return null
  return measured[0] ?? null
}

/** Bloc firmographie FACTUEL sourcé « Apollo » (accounts.apollo_enrichment).
 *  Chaque ligne n'apparaît que si Apollo a renvoyé le champ — rien d'inventé,
 *  la carte entière disparaît quand le bloc est vide/absent. La stack technique
 *  (technos Apollo + tech-detect) est affichée dans TechStackCard, pas ici.
 *
 *  Les champs à vocabulaire FERMÉ (secteur, stade de levée, départements) sont
 *  traduits À L'AFFICHAGE via le dictionnaire déterministe `apolloVocabulary` —
 *  le JSONB stocké n'est jamais modifié, et une valeur hors dictionnaire reste
 *  affichée telle qu'Apollo l'a renvoyée. Le texte libre (`shortDescription`,
 *  `keywords`) reste en anglais : le traduire demanderait une variante stockée. */
export function ApolloFirmographicsCard({
  enrichment,
  registry,
  hasOwnSummary = false,
  recordedAddresses = [],
  recordedEmployees = null,
  recordedRevenue = null,
  recordedAudit = null,
}: {
  enrichment: AnalysisApolloOrgEnrichment
  /** Faits du registre légal, pour signaler ce qu'Apollo contredit. */
  registry?: RegistryFacts
  /**
   * Le produit a-t-il DÉJÀ sa propre présentation de l'entreprise, en français ?
   *
   * Si oui, la présentation de la source n'est pas affichée : elle doublerait
   * en anglais ce que la lecture Bellum dit juste au-dessus. Une fiche de bêta
   * montrait les deux, et c'est le paragraphe anglais qui a été signalé — à
   * raison, puisqu'il n'apportait rien. Elle reste affichée quand nous n'avons
   * rien à dire : combler un vide vaut mieux que le laisser.
   */
  hasOwnSummary?: boolean
  /** V4-CORRECTIFS-C 4294.3 — adresses déjà portées par la fiche (siège, adresse saisie) : l'adresse Apollo identique n'est pas répétée. */
  recordedAddresses?: readonly (string | null | undefined)[]
  /**
   * R17 15/10 (#3917) — l'effectif DÉJÀ porté par la fiche (tranche du registre, corrigible à la main).
   * Un seul effectif à l'écran : quand la fiche en porte un, l'estimation ne s'ajoute pas (« 106 000 »
   * à côté de « Plus de 10 000 » disait deux fois la même chose, différemment).
   */
  recordedEmployees?: string | null
  /** R25 (Servier) — le CA DÉJÀ porté par la fiche (registre, daté, corrigible) : un seul chiffre d'affaires à l'écran. */
  recordedRevenue?: string | null
  /** #3917.9 — la dernière écriture du champ `employees` (source + date) : une correction humaine gagne toujours. */
  recordedAudit?: { source: FieldSource; createdAt: string } | null
}) {
  const { t, i18n } = useTranslation('accountDetail')
  const apollo = useApolloLabel()

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const numberFormat = new Intl.NumberFormat(locale)
  // Sur un fait LÉGAL, le registre (déposé, daté, opposable) fait foi : on ne
  // masque pas Apollo, on affiche sa valeur ET celle du registre plutôt que de
  // laisser deux vérités côte à côte sans un mot (restitution TF1, firmographie).
  const conflicts = apolloRegistryConflicts(
    { foundedYear: enrichment.foundedYear ?? null, annualRevenue: enrichment.annualRevenue ?? null },
    registry ?? {},
    locale,
  )
  const rows: Array<{ label: string; value: string; registryValue?: string }> = []
  // #3917.9 — l'effectif le plus PRÉCIS (chiffre exact > tranche), une correction humaine gagnant toujours :
  // l'estimation ne s'affiche que si elle est ce qu'on retient, et elle dit pourquoi.
  const headcount = pickHeadcount({
    recorded: recordedEmployees,
    recordedAudit,
    estimate: enrichment.estimatedNumEmployees,
    locale,
  })
  // #4286.8 — l'effectif lu sur les sources s'appelle « Effectif observé » (≠ déclaré) ; absent = aucune ligne.
  if (headcount?.origin === 'estimate') {
    rows.push({
      label: t('firmographics.employees'),
      value: recordedEmployees?.trim()
        ? `${headcount.value} · ${t('firmographics.employeesMorePrecise')}`
        : headcount.value,
    })
  }
  // Croissance d'effectif : signal de compte, une période PRÉSENTE (12 mois d'abord) ; absente = aucune ligne, jamais « 0 ».
  const growth = pickHeadcountGrowth(enrichment.headcountGrowth)
  if (growth) {
    const percent = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(growth.ratio)
    rows.push({
      label: t('firmographics.headcountGrowth'),
      value: t('firmographics.headcountGrowthValue', { percent, months: growth.months }),
    })
  }
  if (enrichment.industry) {
    rows.push({ label: t('firmographics.industry'), value: apollo('industry', enrichment.industry) })
  }
  if (typeof enrichment.foundedYear === 'number') {
    rows.push({
      label: t('firmographics.founded'),
      value: String(enrichment.foundedYear),
      registryValue: conflicts.foundedYear?.registryValue,
    })
  }
  if (enrichment.annualRevenuePrinted && !recordedRevenue?.trim()) {
    rows.push({
      label: t('firmographics.revenue'),
      value: enrichment.annualRevenuePrinted,
      registryValue: conflicts.annualRevenue?.registryValue,
    })
  }
  // #3917.a — un financement se montre DATÉ ou pas du tout : sans date du dernier
  // tour (fiches enrichies avant ce lot comprises), montant et stade sont retirés,
  // jamais affichés comme s'ils étaient récents.
  const fundingDate = fundingRoundMonth(enrichment.latestFundingRoundDate, locale)
  if (fundingDate && enrichment.totalFundingPrinted) {
    rows.push({ label: t('firmographics.funding'), value: enrichment.totalFundingPrinted })
  }
  if (fundingDate && enrichment.latestFundingStage) {
    rows.push({
      label: t('firmographics.fundingStage'),
      value: [apollo('fundingStage', enrichment.latestFundingStage), fundingDate].join(' · '),
    })
  }
  if (enrichment.publiclyTradedSymbol) {
    const exchange = enrichment.publiclyTradedExchange ? ` · ${enrichment.publiclyTradedExchange}` : ''
    rows.push({ label: t('firmographics.publiclyTraded'), value: `${enrichment.publiclyTradedSymbol}${exchange}` })
  }
  if (enrichment.parentOrganization) {
    rows.push({ label: t('firmographics.parent'), value: enrichment.parentOrganization })
  }
  if (typeof enrichment.retailLocationCount === 'number') {
    rows.push({ label: t('firmographics.retailLocations'), value: numberFormat.format(enrichment.retailLocationCount) })
  }

  const departments = Object.entries(enrichment.departmentalHeadCount ?? {}).filter(
    ([, count]) => typeof count === 'number' && count > 0,
  )
  const keywords = enrichment.keywords ?? []
  const phoneHref = enrichment.phone ? safeHref(`tel:${enrichment.phone}`, { allowMailtoTel: true }) : undefined
  const hasSocial = Boolean(enrichment.linkedinUrl || enrichment.twitterUrl)
  // Une information = un endroit (GA-26) : la même adresse, à la ponctuation et à la casse près, ne se redit pas.
  const addressKey = (value: string | null | undefined) =>
    (value ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const rawAddressKey = addressKey(enrichment.rawAddress)
  const showAddress = Boolean(
    enrichment.rawAddress &&
    !recordedAddresses.some(recorded => {
      const key = addressKey(recorded)
      return key !== '' && (rawAddressKey.includes(key) || key.includes(rawAddressKey))
    }),
  )
  const hasContact = Boolean(showAddress || enrichment.phone)

  if (
    !enrichment.shortDescription &&
    rows.length === 0 &&
    departments.length === 0 &&
    keywords.length === 0 &&
    !hasContact &&
    !hasSocial
  ) {
    return null
  }

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Building2 className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <Text element="h3" size="sm" weight="semibold" noWrap className="truncate">
            {t('firmographics.title')}
          </Text>
        </div>
        <Badge className="shrink-0 border-0 bg-[var(--bellum-surface-2)] px-1.5 py-0 text-xs text-[var(--bellum-text-secondary)]">
          {t('firmographics.source')}
        </Badge>
      </div>

      {/* Texte libre repris VERBATIM d'Apollo (le plus souvent en anglais). On
          ne le traduit pas : une traduction machine non signalée altérerait une
          donnée de source. On signale donc explicitement qu'il n'est pas
          traduit, plutôt que de laisser croire à une phrase produite par nous.
          Et on ne l'affiche PAS du tout quand notre propre présentation existe
          — voir `hasOwnSummary`. */}
      {enrichment.shortDescription && !hasOwnSummary ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {enrichment.shortDescription}
          </Text>
          <Text size="xs" className="mt-1.5 block text-[var(--bellum-text-muted)]">
            {t('firmographics.untranslated')}
          </Text>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-1">
          {rows.map(row => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 border-b border-[var(--bellum-border)] py-2.5 last:border-0"
            >
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {row.label}
              </Text>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {row.value}
                </Text>
                {row.registryValue ? (
                  <Text element="span" size="xs" className="text-[var(--warning-soft-text)]">
                    {t('firmographics.registrySays', { value: row.registryValue })}
                  </Text>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {departments.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('firmographics.departments')}
          </Text>
          <div className="mt-2 flex flex-col gap-1.5">
            {departments.map(([dept, count]) => (
              <div key={dept} className="flex items-center justify-between gap-3">
                <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {apollo('department', dept, humanizeApolloValue(dept))}
                </Text>
                <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {numberFormat.format(count)}
                </Text>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {keywords.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('firmographics.keywords')}
          </Text>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keywords.map(keyword => (
              <Badge
                key={keyword}
                className="border-0 bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs font-normal text-[var(--bellum-text-secondary)]"
              >
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {hasContact ? (
        <div className="flex flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3">
          {showAddress ? (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {enrichment.rawAddress}
              </Text>
            </div>
          ) : null}
          {enrichment.phone ? (
            <div className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              {phoneHref ? (
                <a
                  href={phoneHref}
                  className="text-xs text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
                >
                  {enrichment.phone}
                </a>
              ) : (
                <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {enrichment.phone}
                </Text>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasSocial ? (
        <div className="flex items-center gap-3 border-t border-[var(--bellum-border)] px-4 py-3">
          {enrichment.linkedinUrl ? (
            <a
              href={safeHref(enrichment.linkedinUrl)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('firmographics.linkedinAria')}
              className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
            >
              <Linkedin className="size-3.5" /> LinkedIn
            </a>
          ) : null}
          {enrichment.twitterUrl ? (
            <a
              href={safeHref(enrichment.twitterUrl)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('firmographics.twitterAria')}
              className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
            >
              <Twitter className="size-3.5" /> X / Twitter
            </a>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
