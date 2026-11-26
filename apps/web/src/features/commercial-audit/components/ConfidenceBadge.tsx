import { useTranslation } from 'react-i18next'
import type { CommercialAuditConfidence } from '@bellum/contracts'
import { Badge } from '@bellum/ui'

/**
 * #2090.29 — LA CONFIANCE, QUALITATIVE ET À PALIERS NOMMÉS, JAMAIS UN NOMBRE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT NE CONTREDIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `AuditDecisionColumns.tsx` a explicitement décidé de NE PAS afficher de
 * confiance sur ses puces Arrêter/Garder/Renforcer : ce texte est écrit
 * TEL QUEL depuis le profil, sans aucun champ de confiance à côté (« un
 * niveau inventé serait précisément la donnée fictive qu'on ne produit
 * pas »). Cette décision reste entière — ce composant ne s'y ajoute pas.
 *
 * Ce qui a changé depuis ce lot : les RUPTURES (`tension-detectors.ts`) et le
 * VERDICT/LA PRIORITÉ qui en dérivent portent, eux, un vrai champ
 * `confidence` (`CommercialAuditConfidence`, trois paliers NOMMÉS —
 * `corroborated` / `single_source` / `deduced` — jamais un pourcentage).
 * Ce badge rend CE champ, là où il existe déjà, sans en inventer un nouveau.
 * `null` = confiance non mesurée, un état distinct de « déduit » (le palier
 * le plus faible des trois CONNUS) : « non mesurée » n'est jamais « faible ».
 */
const VARIANT_BY_CONFIDENCE = {
  corroborated: 'success',
  single_source: 'info',
  deduced: 'outline',
} as const

export function ConfidenceBadge({ confidence }: { confidence: CommercialAuditConfidence | null }) {
  const { t } = useTranslation('commercialAudit')
  const variant = confidence === null ? 'outline' : VARIANT_BY_CONFIDENCE[confidence]
  const label = t(`confidence.${confidence ?? 'unknown'}`)

  return (
    <Badge variant={variant} aria-label={t('confidence.label') + ' : ' + label}>
      {label}
    </Badge>
  )
}
