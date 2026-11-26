import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from './UnknownValue'

/** Un axe d'un score, avec ce qu'il vaut — ou le fait qu'il ne vaut rien. */
type ScoreAxis = {
  label: string
  /** `null` = axe non évaluable. Il SORT du dénominateur, il ne vaut pas zéro. */
  score: number | null
  /** LOIC-FIX2 O.3 — le maximum de l'axe : un critère se lit « 20/30 », jamais un « 20 » nu. */
  max?: number | null
  weight?: number | null
  detail?: string | null
}

/**
 * Un score, JAMAIS seul — avec ses axes et ce qui n'a pas pu être évalué.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le dépôt calcule une dizaine de scores — matching, poussable, mission,
 * débordement, engagement, santé, accessibilité — et tous suivent la même
 * discipline : un axe non évaluable sort du dénominateur, sous trois axes il
 * n'y a pas de score, et **aucun n'est une probabilité** (l'arbitrage n°4, six
 * fois reconduit).
 *
 * Cette discipline est invisible dès qu'un écran affiche « 68 » tout seul. Un
 * nombre nu se lit comme une vérité complète : personne ne devine que trois
 * axes sur douze n'ont pas pu être évalués, ni lesquels, ni que le compléter
 * changerait le classement. C'est l'exigence de transparence de l'AI Act
 * appliquée à l'endroit où elle se joue — l'affichage.
 *
 * Ce que la primitive REFUSE d'afficher : un pourcentage de chance. `max` est
 * obligatoire et le rendu est « 68/80 », jamais « 85 % ».
 */
export function ScoreWithAxes({
  score,
  max,
  axes = [],
  reason,
  compact = false,
  scoreTooltip,
}: {
  score: number | null
  max: number
  axes?: ScoreAxis[]
  /** Pourquoi il n'y a pas de score, quand il n'y en a pas. */
  reason?: string | null
  /** N'affiche que la note — pour une cellule de tableau. Les axes restent en
   *  infobulle : les retirer ferait perdre l'explication, pas la place. */
  compact?: boolean
  /** #3912.1 — ce que CE score mesure. La primitive est générique (dix scores
   *  différents la partagent) : elle ne peut pas deviner la phrase, chaque
   *  appelant la connaît. Absent = comportement historique (la liste des axes
   *  non évaluables, en mode compact). */
  scoreTooltip?: string
}) {
  const { t } = useTranslation('common')
  const notEvaluable = axes.filter(axis => axis.score === null)
  const evaluated = axes.filter(axis => axis.score !== null)

  // ⚠️ Un score absent ne fait pas disparaître les AXES.
  //
  // La primitive promet deux choses — « avec ses axes ET ce qui n'a pas pu être
  // évalué » — et n'en tenait qu'une : dès que le score manquait, elle rendait
  // « non mesuré » tout seul et jetait les axes. Or c'est exactement le profil
  // dont on a le plus besoin de savoir CE QUI a manqué : « non mesuré » répond à
  // « combien ? », les axes répondent à « qu'est-ce que je complète pour que ce
  // classement devienne fiable ? », et c'est la seconde question qui mène à un
  // geste. En `compact` (une cellule de tableau) la note reste sur une ligne :
  // les axes y vivent déjà en infobulle.
  const detail = (
    <>
      {evaluated.length > 0 && (
        <Box className="space-y-0.5">
          {evaluated.map(axis => {
            const cap = axis.max ?? axis.weight
            return (
              // Recette 31/10 — grille label/valeur : le libellé ne chevauche plus sa valeur (empilés à 390 px).
              <Box key={axis.label} data-testid="score-axis-row" className="flex flex-wrap gap-x-3 gap-y-0.5">
                {/* Recette 01/11 — la carte (358 px) se mesure à son conteneur, pas à la fenêtre : le libellé
                    (base 7 rem) passe AU-DESSUS de la valeur dès que la valeur n'a plus ses 10 rem, jamais une
                    colonne de valeur à 0 px. */}
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="min-w-0 basis-28 break-words">
                  {axis.label}
                </Text>
                {/* SIMON-FIX S.24 / LOIC-FIX2 O.3 — chaque critère dit son plafond : « 10/15 », jamais un nombre nu. */}
                {cap != null ? (
                  <Text size="xs" className="min-w-0 flex-1 basis-40 break-words">
                    <span>{`${axis.score}/${cap}`}</span>
                    {axis.detail ? ` — ${axis.detail}` : null}
                  </Text>
                ) : (
                  <Text size="xs" className="min-w-0 flex-1 basis-40 break-words">
                    {axis.detail ? `${axis.score} — ${axis.detail}` : axis.score}
                  </Text>
                )}
              </Box>
            )
          })}
        </Box>
      )}
      {/* Ce qui n'a pas pu être évalué est NOMMÉ. « Trois axes non évaluables »
          n'apprend rien ; « disponibilité inconnue, aucune langue saisie » dit
          quoi compléter pour que le classement devienne fiable. */}
      {notEvaluable.length > 0 && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('score.notEvaluable', { axes: notEvaluable.map(axis => axis.label).join(', ') })}
        </Text>
      )}
    </>
  )

  if (score === null) {
    const unknown = <UnknownValue reason={reason ?? t('score.noScore')} />
    if (compact || axes.length === 0) return unknown
    return (
      <Box className="space-y-1">
        {unknown}
        {detail}
      </Box>
    )
  }

  const summary = [
    t('score.outOf', { score, max }),
    notEvaluable.length > 0 ? t('score.notEvaluableCount', { count: notEvaluable.length }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (compact) {
    return (
      <Text
        size="sm"
        weight="medium"
        title={scoreTooltip ?? (notEvaluable.map(axis => axis.label).join(', ') || undefined)}
      >
        {summary}
      </Text>
    )
  }

  return (
    <Box className="space-y-1">
      <Text size="sm" weight="medium" title={scoreTooltip}>
        {summary}
      </Text>
      {detail}
    </Box>
  )
}
