import { CONSULTING_DOMAIN_BY_CODE, ESN_ANSWER_OPTIONS } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { InlineProfileValue } from '@/components/primitives/InlineProfileValue'

/**
 * « Ce que {{brand}} a compris » — le type de société, les domaines vendus et le positionnement
 * (« Régie pure… »). Rendue au profil (portefeuille d'offre) ET dans Découvrir (LUDOVIC-E LC.6) :
 * un composant, deux emplacements, jamais une copie qui pourrait diverger (GA-26).
 * `quietWhenEmpty` : sans type ni positionnement, rien (on n'affiche pas ce qu'on n'a pas) ;
 * le profil, lui, garde l'aveu « aucun domaine sélectionné ».
 */
export function OfferUnderstood({
  companyType,
  offerDomains,
  positioning,
  quietWhenEmpty = false,
  onSavePositioning,
  lockedReason = null,
  className,
}: {
  companyType: string | null
  offerDomains: readonly string[]
  positioning: string
  quietWhenEmpty?: boolean
  /** #4425.3 — présent = le mode d'intervention se corrige ICI (profil seulement ;
   *  Découvrir ne le passe pas et reste en lecture). */
  onSavePositioning?: (next: string) => Promise<void>
  /** #4425.3 — le verrou de rôle : la raison, au lieu du bouton Modifier. */
  lockedReason?: string | null
  className?: string
}) {
  const { t } = useTranslation('profile')
  const domainNames = offerDomains
    .map(code => CONSULTING_DOMAIN_BY_CODE.get(code)?.labelFr)
    .filter((label): label is string => !!label)
  const companyTypeLabel = companyType
    ? t(`offerPortfolio.companyType.${companyType}`, { defaultValue: companyType })
    : null
  if (quietWhenEmpty && !companyTypeLabel && !positioning) return null
  return (
    <div className={className}>
      <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('offerPortfolio.understood.title')}
      </Text>
      {companyTypeLabel || !quietWhenEmpty ? (
        <Text element="p" size="sm" className="mt-1">
          {companyTypeLabel
            ? t('offerPortfolio.understood.sentence', {
                companyType: companyTypeLabel,
                domains: domainNames.slice(0, 3).join(', ') || t('offerPortfolio.understood.noDomains'),
              })
            : t('offerPortfolio.understood.unknown')}
        </Text>
      ) : null}
      {/* LUDOVIC-C LC.7 — le positionnement choisi se lit dans la restitution ; absent = aucune ligne. */}
      {onSavePositioning ? (
        // #4425.3 — sur le profil, même absent le mode d'intervention peut être
        // AJOUTÉ (liste fermée `ESN_ANSWER_OPTIONS.positioning`, jamais saisi libre).
        <div className="mt-2" data-testid={positioning ? 'understood-positioning' : undefined}>
          <InlineProfileValue
            label={t('offerPortfolio.understood.positioningLabel')}
            value={positioning || null}
            options={ESN_ANSWER_OPTIONS.positioning.map(option => ({ value: option, label: option }))}
            onSave={onSavePositioning}
            lockedReason={lockedReason}
          />
        </div>
      ) : positioning ? (
        <Text element="p" size="sm" className="mt-1" data-testid="understood-positioning">
          {t('offerPortfolio.understood.positioning', { positioning })}
        </Text>
      ) : null}
    </div>
  )
}
