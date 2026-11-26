import type { BriefingAction } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { DailyDecision, DailyDecisionCategory } from '../lib/daily-decisions'
import { PriorityCard } from './PriorityCard'

/**
 * BEL-SC-227 (#3256) — « TES DÉCISIONS » : au plus trois, une par catégorie
 * (protéger l'existant, prochain mouvement commercial, simplifier le
 * système), jamais sept priorités équivalentes (#3256, règle « ne pas
 * afficher sept priorités équivalentes »).
 *
 * ⚠️ MÊME CARTE QUE PARTOUT AILLEURS SUR CET ÉCRAN (GA-26) — `PriorityCard`
 * porte déjà les huit facettes que le ticket demande (pourquoi maintenant =
 * `context`, objet concerné = `businessObject`, action proposée = le fait,
 * temps estimé = `estimatedMinutes`, CTA = `ctaKey`, « ouvrir dans Laura » =
 * `AskLaura`) : en écrire une seconde ici aurait recréé exactement le défaut
 * que ce dépôt paie le plus souvent, deux formes pour le même objet.
 *
 * `résultat attendu` et `condition d'arrêt` (les deux facettes que le ticket
 * nomme et qu'aucun champ ne porte encore) restent SANS ligne dédiée : les
 * inventer ici serait une donnée fictive (doctrine « jamais de donnée
 * fictive, échec → dire ce qui manque »). `verdict` (« ce qu'il faut
 * retenir ») et `expiresAt` (« quand le fait cesse d'être vrai », déjà rendu
 * par `PriorityCard`) portent déjà l'intention la plus proche ; leur donner
 * un nom à eux demande une génération IA que ce lot ne porte pas — voir le
 * commentaire de fin sur #3256.
 */
export function DecisionsSection({
  decisions,
  dispersionDetected,
  capacity,
  onOpenMeetingPrep,
}: {
  decisions: DailyDecision[]
  /** BEL-SC-227.24 — un signal réel (`detectDispersion`), jamais un texte deviné. */
  dispersionDetected: boolean
  /** BEL-SC-227.22 — le budget de temps réel du jour (`agendaCompactSummary`,
   *  déjà calculé pour le bandeau agenda) ; `null` quand l'agenda n'a pas répondu. */
  capacity: number | null
  onOpenMeetingPrep?: (actionId: string) => void
}) {
  const { t } = useTranslation('briefing')

  // Aucune décision : la section ne rend RIEN — une absence ne fait aucune
  // ligne (GA-18/19), jamais un titre au-dessus d'une liste vide.
  if (decisions.length === 0) return null

  return (
    <Box className="flex flex-col gap-3" data-testid="decisions-section">
      {decisions.map(({ category, action }, index) => (
        <DecisionCard
          key={action.id}
          category={category}
          action={action}
          rank={index + 1}
          // #BEL-SC-227.24 — la note de dispersion se pose SEULEMENT sur la
          // décision qui simplifie : c'est elle qui répond à « pourquoi ce
          // sujet maintenant », jamais une note répétée sur les trois cartes.
          dispersionNote={category === 'simplify' && dispersionDetected}
          capacity={capacity}
          onOpenMeetingPrep={onOpenMeetingPrep}
          t={t}
        />
      ))}
    </Box>
  )
}

function DecisionCard({
  category,
  action,
  rank,
  dispersionNote,
  capacity,
  onOpenMeetingPrep,
  t,
}: {
  category: DailyDecisionCategory
  action: BriefingAction
  rank: number
  dispersionNote: boolean
  capacity: number | null
  onOpenMeetingPrep?: (actionId: string) => void
  t: (key: string, vars?: Record<string, unknown>) => string
}) {
  // BEL-SC-227.22 — LE BUDGET DE TEMPS RÉEL : la même capacité déjà calculée
  // pour le bandeau agenda (`agendaCompactSummary`, GA-26 — jamais un second
  // calcul). `null`/`undefined` = l'agenda n'a pas répondu, la ligne ne
  // s'affiche pas — jamais un « 0 dossier » deviné.
  const showsCapacityWarning = capacity === 0

  return (
    <Box className="flex flex-col gap-1.5">
      <Box className="flex items-center gap-2 pl-1">
        <Badge variant="outline" className="w-fit text-xs">
          {t(`decisions.category.${category}`)}
        </Badge>
        {dispersionNote ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('decisions.dispersion')}
          </Text>
        ) : null}
      </Box>
      <PriorityCard action={action} rank={rank} onOpenMeetingPrep={onOpenMeetingPrep} />
      {showsCapacityWarning ? (
        <Text size="xs" className="pl-8 text-[var(--warning-soft-text)]">
          {t('agenda.compact.capacity', { count: 0 })}
        </Text>
      ) : null}
    </Box>
  )
}
