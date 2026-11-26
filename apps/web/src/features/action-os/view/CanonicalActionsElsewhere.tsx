import type { CanonicalAction } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { actionOsApi, actionOsKeys } from '../api'

/**
 * #2395 — la page Actions porte la VUE COMPLÈTE de mes actions.
 *
 * « Mes relances » (juste au-dessus) liste le plan de Laura. Les autres maisons
 * d'une action — les tâches (brief du jour) et les appels (Séquences) — restaient
 * invisibles ici. Cette section les lit par `GET /action-os/actions`, au contrat
 * canonique (`packages/contracts/src/schemas/action.ts`), et :
 *
 *  - n'affiche JAMAIS une action du plan une seconde fois (#2395.11) ;
 *  - ne modifie rien : chaque ligne renvoie à sa maison native, seule à
 *    l'écrire — aucune liste parallèle (#2395.6) ;
 *  - montre l'objectif et le résultat attendu quand la maison les porte
 *    (#2395.8), et la source (#2395.7). Une absence ne fait AUCUNE ligne.
 *
 * Une maison illisible est NOMMÉE : une liste amputée ne se rend jamais comme
 * « rien à faire ».
 *
 * ⚠️ #2395.10 — la LISTE ci-dessous est un CHOIX D'AFFICHAGE, pas la liste des
 * maisons que le contrat connaît. `interventions` (la file du responsable,
 * #2395.10) a un adaptateur réel et un `GET /action-os/actions` qui la rend,
 * mais PAS de ligne ici : elle est déjà montrée par `DailyGesturesBlock`
 * (`/briefing`, #2387.9), et l'afficher AUSSI ici dupliquerait la même action
 * sur deux écrans — exactement ce que #2395.11 interdit. D'où l'ALLOWLIST
 * (jamais un blocklist `!== 'plan_item'`) : une maison nouvelle n'apparaît ici
 * qu'un jour où quelqu'un lui écrit sciemment sa ligne `HOME_OF`.
 */
const HOME_OF = {
  task: '/briefing',
  call_task: '/actions/sequences',
} as const

type ElsewhereOrigin = keyof typeof HOME_OF

function isElsewhere(action: CanonicalAction): action is CanonicalAction & { origin: { model: ElsewhereOrigin } } {
  return action.origin.model === 'task' || action.origin.model === 'call_task'
}

export function CanonicalActionsElsewhere() {
  const { t } = useTranslation('actions')
  const { user } = useSession()
  const query = useQuery({
    queryKey: actionOsKeys.actions,
    queryFn: () => actionOsApi.actions(),
    enabled: Boolean(user),
    staleTime: 30_000,
  })

  if (query.isError) {
    return (
      <Text size="xs" className="text-muted-foreground">
        {t('center.elsewhere.error')}
      </Text>
    )
  }
  const actions = (query.data?.actions ?? []).filter(isElsewhere)
  // Même allowlist que `isElsewhere`, et pour la même raison : une maison
  // illisible qui n'a pas de ligne ICI (`intervention`) n'a rien à dire ici
  // non plus — son propre écran (`/briefing`) porte déjà son propre état.
  const unavailable = (query.data?.unavailable ?? []).filter(
    (origin): origin is ElsewhereOrigin => origin === 'task' || origin === 'call_task',
  )
  if (actions.length === 0 && unavailable.length === 0) return null

  return (
    <section aria-label={t('center.elsewhere.title')} className="mt-4 space-y-2">
      <Text size="sm" weight="semibold">
        {t('center.elsewhere.title')}
      </Text>
      {unavailable.map(origin => (
        <Text key={origin} size="xs" className="text-muted-foreground">
          {t(`center.elsewhere.unavailable.${origin}`)}
        </Text>
      ))}
      <ul className="space-y-1">
        {actions.map(action => (
          <li key={action.action_id} className="rounded-lg border border-border px-3 py-2.5">
            <Box className="flex flex-wrap items-baseline justify-between gap-2">
              <Text size="sm" weight="medium" className="min-w-0 text-foreground">
                {action.title}
              </Text>
              <Link
                to={HOME_OF[action.origin.model]}
                className="inline-flex shrink-0 items-center text-xs font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
              >
                {t(`center.elsewhere.home.${action.origin.model}`)}
              </Link>
            </Box>
            {action.objective ? (
              <Text size="xs" className="text-muted-foreground">
                {t('center.elsewhere.objective', { value: action.objective })}
              </Text>
            ) : null}
            {action.expected_outcome || action.expected_outcome_note ? (
              <Text size="xs" className="text-muted-foreground">
                {t('center.elsewhere.expectedOutcome', {
                  value: action.expected_outcome
                    ? t(`center.elsewhere.outcomes.${action.expected_outcome}`)
                    : action.expected_outcome_note,
                })}
              </Text>
            ) : null}
            {action.source ? (
              <Text size="xs" className="text-muted-foreground">
                {t(`center.elsewhere.sources.${action.source}`)}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
