import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { PropagatedBlock } from '@/features/propagation/PropagatedBlock'
import { useConsultantPlacementsIndex } from '@/features/propagation/hooks'

/**
 * « PLACÉ 4 FOIS » — le compteur du vivier (§4.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN PLACEMENT N'EST PAS UN POSITIONNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le vivier affichait déjà « N positionnements en cours sur M » : un
 * positionnement est une PROPOSITION envoyée à un client. Un placement est une
 * mission qui a DÉMARRÉ. Le libellé existant était juste — il dit bien
 * « positionnements » — mais il n'y avait AUCUN compteur de placements, si bien
 * que l'écran ne montrait que la moitié gauche de la seule comparaison qui
 * compte.
 *
 * Les deux vivent donc côte à côte, et c'est leur ÉCART qui fait le travail :
 * quelqu'un qu'on présente beaucoup et qu'on place peu est exactement la
 * personne qu'un recruteur doit repérer. Les fondre en un seul chiffre — ou
 * n'en montrer qu'un — rendrait cette personne invisible.
 *
 * Côté serveur, le filtre est `started_on IS NOT NULL AND started_on <=
 * CURRENT_DATE` : une affectation posée sur une mission qui commence le mois
 * prochain n'est pas encore un placement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ JAMAIS « PLACÉ 0 FOIS »
 * ─────────────────────────────────────────────────────────────────────────────
 * `placements` est un `positive()` au contrat et le serveur ne rend aucune ligne
 * à zéro. Un consultant jamais placé n'affiche RIEN — pas un compteur à zéro,
 * qui collerait un constat d'échec sur une personne qui vient peut-être
 * d'arriver.
 *
 * ⚠️ §4.4 — le compteur mène aux missions de ce consultant, et ne s'édite pas.
 */
export function TalentPlacementsChip({ consultantId }: { consultantId: string }) {
  const { t } = useTranslation('consultants')
  const placed = useConsultantPlacementsIndex().get(consultantId)

  if (!placed) return null

  return (
    <PropagatedBlock source={placed.source}>
      <Text
        element="span"
        size="xs"
        className="text-[var(--bellum-text-accent)]"
        title={t('propagation.placementsTitle')}
      >
        {t('propagation.placements', { count: placed.placements })}
      </Text>
    </PropagatedBlock>
  )
}
