import { Box, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { MissionView } from '../api'

/**
 * #2986 (#2414.34-.48) — L'APPELANT qui manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU TROUVÉ PAR CE LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `repositionTrigger`/`repositionReasons`/`repositionConstraints`
 * (`mission-reposition-trigger.ts`, `DeliveryService.decorate`) sont calculés
 * et testés depuis plusieurs lots (demande marché, rareté du profil, besoins
 * ouverts, partenaires, relations, contraintes déclarées, mémoire marché). La
 * suppression de l'écran `/missions/renouvellements` (#3656, 06/10/2026) a
 * retiré `RenewalDecisionPanel.tsx` EN ENTIER — et avec lui le seul appelant
 * web de ce signal. La ligne de menu « Repositionner le consultant »
 * (`MissionsTable.tsx`) renvoie toujours vers le dossier de la mission, qui ne
 * le rendait plus nulle part : exactement « du code juste, calculé, testé, que
 * personne n'appelle ».
 *
 * Aucun calcul neuf ici — cette surface relit les champs déjà posés sur
 * `MissionView`, au même endroit que `MissionChainStrip` juste au-dessus, qui
 * montre déjà l'étape « Repositionnement » du parcours de livraison mais
 * jamais le détail des raisons.
 *
 * ⚠️ Lecture seule, NO-GO #2414 : ne lance rien, n'annonce aucune
 * disponibilité. Ne s'affiche QUE sur l'état `a_commencer` — sur
 * `pas_encore`/`non_mesure`, il n'y a rien à montrer dans une LISTE
 * (« on n'affiche pas ce qu'on n'a pas »).
 */
// Fenêtres dont `chain.why.window.<clé>` porte la phrase d'échéance.
const RENEWAL_WINDOW_KEYS: readonly string[] = ['j60', 'j45', 'j30', 'j15', 'imminent', 'overdue']

export function MissionRepositioningPanel({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const trigger = mission.repositionTrigger
  if (!trigger || trigger.state !== 'a_commencer') return null
  // #2986 (décision Louis 10/10, GA-26) — l'ÉCHÉANCE (`tier_close`) se nomme ICI, avec la phrase de la
  // fenêtre de renouvellement (« La fin approche : un mois. ») ; la bande signature → cash se tait
  // quand ce bloc est affiché (MissionChainStrip) et la garde quand il ne l'est pas.
  const reasons = mission.repositionReasons ?? [trigger.reasonKey]
  const deadlineText = (reason: string): string => {
    if (reason !== 'tier_close' || !mission.renewal || !RENEWAL_WINDOW_KEYS.includes(mission.renewal)) {
      return t(`dossier.repositioning.reasons.${reason}`, { defaultValue: reason })
    }
    return t(`chain.why.window.${mission.renewal}`)
  }
  const constraints = mission.repositionConstraints ?? []
  if (reasons.length === 0 && constraints.length === 0) return null

  return (
    <Card className="p-4" aria-label={t('dossier.repositioning.title')}>
      <Text element="h2" size="base" weight="semibold">
        {t('dossier.repositioning.title')}
      </Text>
      <Box className="mt-2 flex flex-col gap-1">
        {reasons.map(reason => (
          <Text key={reason} element="p" size="sm" color="text-muted-foreground">
            {deadlineText(reason)}
          </Text>
        ))}
      </Box>
      {constraints.length > 0 ? (
        <Box className="mt-2 flex flex-col gap-1">
          {constraints.map(constraint => (
            <Text key={`${constraint.consultantName}-${constraint.kind}`} element="p" size="sm">
              {t('dossier.repositioning.constraint', { name: constraint.consultantName, text: constraint.text })}
            </Text>
          ))}
        </Box>
      ) : null}
    </Card>
  )
}
