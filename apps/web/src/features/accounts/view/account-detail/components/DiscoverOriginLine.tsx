import {
  APPLICATION_SECTORS,
  DISCOVER_OFFERS_CARRIED_SINCE,
  isDiscoverOriginCriteriaEmpty,
  zoneWidenedLabel,
  type Account,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

type DiscoverOriginLineProps = {
  account: Account
  /** La raison est déjà citée ailleurs sur ce bloc (pont #3914) : ne pas la répéter (GA-26). */
  hideReason: boolean
}

/**
 * #3819 (lot RBB, décision Louis 11/10/2026) — un compte ajouté depuis
 * Découvrir garde sa RAISON de sélection et ses CRITÈRES (secteur, zone,
 * effectif, signal), et le dossier les redit : « Sélectionné dans Découvrir
 * sur : … ». Un axe non posé ne fait AUCUN segment ; sans critère ni raison,
 * la ligne n'existe pas (« on n'affiche pas ce qu'on n'a pas »). Aucun score,
 * aucune probabilité — seulement ce que l'utilisateur avait posé.
 */
export function DiscoverOriginLine({ account, hideReason }: DiscoverOriginLineProps) {
  const { t, i18n } = useTranslation('accountDetail')
  const criteria = account.discover_origin_criteria
  // #4642 — un dossier lancé depuis une conversation avec Laura dit AUSSI sur quoi il a été cadré (l'origine
  // reste « search » : l'utilisateur a cherché, le cadrage est ce que Laura avait trouvé pour lui).
  const framedByLaura = account.origin !== 'discover' && criteria?.framed_by === 'laura'
  if (account.origin !== 'discover' && !framedByLaura) return null
  const reason = hideReason ? '' : (account.discover_origin_reason ?? '').trim()
  const english = (i18n.language ?? '').toLowerCase().startsWith('en')

  const segments: string[] = []
  if (criteria && !isDiscoverOriginCriteriaEmpty(criteria)) {
    // #4642 — le consultant dont la demande a fait sortir ce compte, nommé (prod 27/10 : absent du dossier).
    if (criteria.talent_name?.trim()) {
      segments.push(t('synthesis.discoverOrigin.talent', { value: criteria.talent_name.trim() }))
    }
    if (criteria.sectors?.length) {
      const labels = criteria.sectors.map(code => {
        const sector = APPLICATION_SECTORS.find(s => s.code === code)
        return sector ? (english ? sector.labelEn : sector.labelFr) : code
      })
      segments.push(t('synthesis.discoverOrigin.sector', { value: labels.join(', ') }))
    }
    if (criteria.zone?.trim()) segments.push(t('synthesis.discoverOrigin.zone', { value: criteria.zone.trim() }))
    // #4433.9 — le palier qui a fait sortir ce compte, en toutes lettres (« Zone élargie : Élargi au département · Nord »).
    const widenedLabel = criteria.zone_widened ? zoneWidenedLabel(criteria.zone_widened, english ? 'en' : 'fr') : null
    if (widenedLabel) segments.push(t('synthesis.discoverOrigin.zoneWidened', { value: widenedLabel }))
    if (criteria.headcount?.length) {
      segments.push(t('synthesis.discoverOrigin.headcount', { value: criteria.headcount.join(', ') }))
    }
    if (criteria.signals?.length) {
      const labels = criteria.signals.map(source => t(`synthesis.discoverOrigin.signals.${source}`))
      segments.push(t('synthesis.discoverOrigin.signal', { value: labels.join(', ') }))
    }
    // #3819 (lot W-C 13/10) — la compétence cherchée, telle que saisie.
    if (criteria.skills?.length) {
      segments.push(t('synthesis.discoverOrigin.skills', { value: criteria.skills.join(', ') }))
    }
    // #4642 — les offres relevées qui ont fait sortir le compte, mêmes intitulés et mêmes dates que la carte.
    if (criteria.offers?.length) {
      const listed = criteria.offers.map(({ title, date }) => (date ? `${title} (${date})` : title))
      segments.push(t('synthesis.discoverOrigin.offers', { value: listed.join(' ; ') }))
    }
  }

  if (segments.length === 0 && (framedByLaura || !reason)) return null
  const text = framedByLaura
    ? t('synthesis.discoverOrigin.framedByLaura', { criteria: segments.join(' · ') })
    : segments.length === 0
      ? t('synthesis.discoverOrigin.reasonOnly', { reason })
      : reason
        ? t('synthesis.discoverOrigin.criteriaWithReason', { criteria: segments.join(' · '), reason })
        : t('synthesis.discoverOrigin.criteria', { criteria: segments.join(' · ') })

  // #4646.9 — un dossier Découvrir cherché par compétence, analysé avant la reprise des offres et sans offre
  // recopiée : l'écran DIT que sa collecte est antérieure (le rejeu ne part pas seul, il n'efface rien).
  const analyzedAt = (account.last_analyzed_at ?? '').slice(0, 10)
  const collectedBefore =
    !framedByLaura &&
    Boolean(criteria?.skills?.length) &&
    !criteria?.offers?.length &&
    analyzedAt !== '' &&
    analyzedAt < DISCOVER_OFFERS_CARRIED_SINCE

  return (
    <>
      <Text data-testid="discover-origin-line" size="xs" className="text-[var(--bellum-text-muted)]">
        {text}
      </Text>
      {collectedBefore && (
        <Text data-testid="discover-origin-prior" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('synthesis.discoverOrigin.collectedBefore')}
        </Text>
      )}
    </>
  )
}
