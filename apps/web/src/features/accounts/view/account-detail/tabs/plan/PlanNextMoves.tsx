import { NEXT_ACTIONS_MAX } from '@bellum/contracts'
import { Badge, Button, Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { CalendarClock, Compass, ListChecks, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PlanWeek } from '../../helpers/plan'
import { cardFade } from '../../motion'
import { measurePlanListOverlap } from './planListOverlap'
import type {
  FollowedSignal,
  IfNoResponse,
  NextAction,
  NextActionGroup,
  RecommendedMovement,
  RecommendedRoute,
} from './planViewData'
import { formatSignalDate } from '@/lib/signal-date'

const KNOWN_MOVEMENTS = new Set([
  'bottom_up',
  'middle_out',
  'top_down',
  'sandwich',
  'rang2',
  'prospection_inversee',
  'public',
  'reactivation',
  'filiale_site',
  'referencement',
])

const KNOWN_CHANTIERS = new Set(['compte', 'contacts', 'signaux', 'messages', 'delivery', 'expansion'])

const CHANTIER_VARIANT: Record<string, 'primary' | 'info' | 'warning' | 'success' | 'outline'> = {
  compte: 'outline',
  contacts: 'primary',
  signaux: 'info',
  messages: 'warning',
  delivery: 'success',
  expansion: 'primary',
}

// #2317.4 (épopée #2923) — « aujourd'hui » ajouté, même liste que
// `NEXT_ACTION_HORIZONS` (planViewData.ts) : un réglage à un seul endroit
// (GA-26) aurait voulu qu'elle vienne de là, mais elle est un `Set` ici et un
// tuple `as const` là pour des raisons de lookup différentes — les DEUX
// listes sont donc mises à jour ENSEMBLE, comme elles l'étaient déjà pour les
// quatre valeurs précédentes.
const KNOWN_HORIZONS = new Set(["aujourd'hui", '7j', '30j', '60j', '90j'])

/**
 * Surfaces the two deterministic outputs of the sales-methodology engine
 * (Annexe Méthodologie Sales ESN) that the IA already emits inside the plan
 * payload but that nothing rendered: the recommended opening MOVEMENT (1 of 7,
 * TABLE C p13) and the 3-5 ranked NEXT ACTIONS (p28). Additive, read-only.
 *
 * Les actions sont rendues par échéance (7 / 30 / 60 / 90 jours, p27) dès que
 * le dossier en porte une : le commercial voit « cette semaine » avant « ce
 * trimestre ». Un dossier antérieur n'en porte aucune → liste à plat, inchangée.
 */
/**
 * #2959 (recette prod 03/10) — « direct_accessible » s'affichait brut, deux
 * fois : le plan de repli et la route déconseillée sont écrits par le moteur
 * avec l'IDENTIFIANT de la route. On le remplace par son libellé FR/EN (le même
 * que le badge), entre guillemets pour qu'il se lise au milieu d'une phrase.
 */
function humanizeRouteIds(text: string, labels: Record<string, string>): string {
  // #3278 — une valeur qui EST un identifiant (« top_down » en route déconseillée) se lit en entier,
  // même sans « _ » ; dans une phrase, seuls les identifiants à « _ » sont remplacés (« sponsor » est aussi un mot).
  const whole = labels[text.trim()]
  if (whole) return `« ${whole} »`
  const ids = Object.keys(labels).filter(id => id.includes('_'))
  if (ids.length === 0) return text
  return text.replace(new RegExp(`\\b(${ids.join('|')})\\b`, 'g'), id => `« ${labels[id]} »`)
}

export function PlanNextMoves({
  movement,
  route = null,
  followedSignal = null,
  nextActions,
  nextActionsByHorizon = [],
  ifNoResponse = null,
  planWeeks = [],
  onChangeAngle,
}: {
  movement: RecommendedMovement | null
  /** #2959 — la route commerciale calculée, dans la même carte que le mouvement. */
  route?: RecommendedRoute | null
  /** #3278.b — le signal suivi (daté au jour) ; absent = aucune ligne. */
  followedSignal?: FollowedSignal | null
  nextActions: NextAction[]
  nextActionsByHorizon?: NextActionGroup[]
  /** « Si silence » — le troisième point du premier mouvement (tome 5 §14.4). */
  ifNoResponse?: IfNoResponse | null
  /** #3717.7 — le tableau (`ActionPlanBoard`, plus bas sur la même page) : sert
   *  UNIQUEMENT à mesurer le recouvrement (texte exact), jamais une deuxième
   *  lecture du plan — `measurePlanListOverlap` est la SEULE fonction qui les
   *  compare (GA-26). */
  planWeeks?: PlanWeek[]
  /** #3278.r42 — « Changer d'angle » à portée de la route (le bouton vivait dans une section repliée). */
  onChangeAngle?: () => void
}) {
  const { t } = useTranslation('accountDetail')
  // Les identifiants d'un MOUVEMENT (« top_down ») sont aussi écrits par le moteur dans les attributs de route.
  const routeLabels = {
    ...(t('nextMoves.movements', { returnObjects: true }) as Record<string, string>),
    ...(t('nextMoves.routes', { returnObjects: true }) as Record<string, string>),
  }

  if (!movement && !route && !followedSignal && nextActions.length === 0 && !ifNoResponse) return null

  // #3717.7 (reste de l'épopée #3777) — MESURÉ par le lot précédent, jamais
  // RENDU : `nextActionsEchoedInBoard` dormait, calculé et testé, sans
  // appelant (le motif qui revient dans ce dépôt). Décision de ce lot : pas
  // de retrait de ligne ici — contrairement au doublon résumé↔Prochaines
  // actions (une seule phrase isolée, zéro contexte ajouté), une action déjà
  // suivie ici ET sur le tableau sert DEUX usages différents (la priorité du
  // jour / le calendrier complet) : ce n'est pas la même redondance. Fusionner
  // les DEUX lignes exigerait de les relier une à une, ce qui suppose un
  // identifiant partagé entre les deux pipelines IA (plan multi-semaines vs
  // prochaines actions) — l'écart d'architecture déjà nommé par le lot R9,
  // toujours vrai. Ce qui peut s'afficher SANS cet identifiant : un compte,
  // pas un lien précis — la même prudence que l'ancre `#plan-next-moves` du
  // résumé, qui pointe une SECTION, jamais une ligne.
  const boardOverlap = measurePlanListOverlap({ immediateAction: '', nextActions, planWeeks })

  // #2123.34 — trois actions en tête, jamais quinze. La zone rendait l'horizon
  // ENTIER sans troncature : quinze cartes « prioritaires » ne sont pas une
  // priorisation, c'est la même liste sous un autre titre. Le plafond vit dans
  // les contrats (`NEXT_ACTIONS_MAX`), à un seul endroit (GA-26), et il
  // s'applique à la zone COMPLÈTE — sinon quatre horizons de trois actions en
  // rendraient douze.
  const headActions = nextActions.slice(0, NEXT_ACTIONS_MAX)
  const headGroups: NextActionGroup[] = []
  let budget = NEXT_ACTIONS_MAX
  for (const group of nextActionsByHorizon) {
    if (budget <= 0) break
    const actions = group.actions.slice(0, budget)
    headGroups.push({ horizon: group.horizon, actions })
    budget -= actions.length
  }

  const movementLabel =
    movement && KNOWN_MOVEMENTS.has(movement.movement)
      ? t(`nextMoves.movements.${movement.movement}`)
      : movement?.movement || ''

  return (
    <motion.div variants={cardFade} className="p-1">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('nextMoves.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('nextMoves.subtitle')}
          </Text>
        </div>

        {/* SI SILENCE (tome 5 §14.4, point 03). Produit par la phase 4 depuis
            le premier jour, affiché nulle part : un plan qui ne dit pas quoi
            faire quand personne ne répond laisse relancer au hasard. */}
        {ifNoResponse && (
          <div className="border-b border-[var(--bellum-border)] px-5 py-4">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
              {t('nextMoves.ifSilent')}
            </Text>
            {ifNoResponse.trigger && (
              <Text size="sm" className="mt-1">
                {ifNoResponse.trigger}
              </Text>
            )}
            {ifNoResponse.alternativeContact && (
              <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                {t('nextMoves.ifSilentContact', { contact: ifNoResponse.alternativeContact })}
              </Text>
            )}
            {ifNoResponse.differentAngle && (
              <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                {t('nextMoves.ifSilentAngle', { angle: ifNoResponse.differentAngle })}
              </Text>
            )}
            {ifNoResponse.reengagementPretext && (
              <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                {t('nextMoves.ifSilentPretext', { pretext: ifNoResponse.reengagementPretext })}
              </Text>
            )}
          </div>
        )}

        {movement ? (
          <div className="border-b border-[var(--bellum-border)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('nextMoves.movementLabel')}
              </Text>
              <Badge variant="primary">{movementLabel}</Badge>
            </div>
            {movement.sequence ? (
              <Text size="sm" weight="semibold" className="mt-2 break-words text-[var(--bellum-text-primary)]">
                {movement.sequence}
              </Text>
            ) : null}
            {movement.rationale ? (
              <Text size="sm" className="mt-1 break-words leading-snug text-[var(--bellum-text-secondary)]">
                {movement.rationale}
              </Text>
            ) : null}
          </div>
        ) : null}

        {/* #3278.b — le signal que ce plan suit, avec sa date : un plan re-planifié dit POURQUOI. */}
        {followedSignal ? (
          <div className="border-b border-[var(--bellum-border)] px-5 py-4" data-testid="plan-followed-signal">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
              {t('nextMoves.followedSignalLabel')}
            </Text>
            <Text size="sm" className="mt-1 break-words leading-snug text-[var(--bellum-text-secondary)]">
              {[followedSignal.signal, formatSignalDate(followedSignal.date)].join(' · ')}
            </Text>
          </div>
        ) : null}

        {route ? (
          <div className="border-b border-[var(--bellum-border)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('nextMoves.routeLabel')}
              </Text>
              <Badge variant="primary">{t(`nextMoves.routes.${route.route}`, { defaultValue: route.route })}</Badge>
            </div>
            {route.rationale ? (
              <Text size="sm" className="mt-1 break-words leading-snug text-[var(--bellum-text-secondary)]">
                {route.rationale}
              </Text>
            ) : null}
            {route.details.length > 0 ? (
              <dl className="mt-2 space-y-1">
                {route.details.map(detail => (
                  <div key={detail.key} className="flex flex-wrap gap-x-2">
                    <dt>
                      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                        {t(`nextMoves.routeDetails.${detail.key}`)}
                      </Text>
                    </dt>
                    <dd className="min-w-0 break-words">
                      <Text size="xs">{humanizeRouteIds(detail.value, routeLabels)}</Text>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {onChangeAngle ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={RefreshCw}
                className="mt-3 pointer-coarse:min-h-11"
                onClick={onChangeAngle}
              >
                {t('replan.trigger')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {nextActions.length > 0 ? (
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="size-4 text-[var(--bellum-text-secondary)]" />
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('nextMoves.actionsTitle')}
              </Text>
            </div>
            {boardOverlap.nextActionsEchoedInBoard > 0 ? (
              <Text size="xs" className="mb-3 text-[var(--bellum-text-secondary)]">
                {t('nextMoves.echoedInBoard', {
                  count: boardOverlap.nextActionsEchoedInBoard,
                  total: boardOverlap.nextActionsTotal,
                })}{' '}
                <a href="#action-plan-board" className="font-medium text-[var(--bellum-text-accent)]">
                  {t('nextMoves.seeInBoard')}
                </a>
              </Text>
            ) : null}
            {headGroups.length > 0 ? (
              <div className="space-y-4">
                {headGroups.map((group, groupIndex) => (
                  <div key={group.horizon}>
                    <div className="mb-2 flex items-center gap-2">
                      <CalendarClock className="size-3.5 text-[var(--bellum-text-secondary)]" />
                      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                        {KNOWN_HORIZONS.has(group.horizon) ? t(`nextMoves.horizons.${group.horizon}`) : group.horizon}
                      </Text>
                    </div>
                    <ActionList
                      actions={group.actions}
                      startIndex={headGroups
                        .slice(0, groupIndex)
                        .reduce((total, previous) => total + previous.actions.length, 0)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <ActionList actions={headActions} startIndex={0} />
            )}
          </div>
        ) : null}
      </Card>
    </motion.div>
  )
}

/** Le rang des actions reste continu d'une échéance à l'autre : la hiérarchie
 *  (3-5 actions, la plus utile d'abord) ne se perd pas dans le regroupement. */
function ActionList({ actions, startIndex }: { actions: NextAction[]; startIndex: number }) {
  const { t } = useTranslation('accountDetail')

  return (
    <ol className="space-y-3">
      {actions.map((action, index) => {
        const chantierLabel = KNOWN_CHANTIERS.has(action.chantier)
          ? t(`nextMoves.chantiers.${action.chantier}`)
          : action.chantier
        return (
          <li key={action.id || index} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]">
              {startIndex + index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Text size="sm" weight="semibold" className="break-words text-[var(--bellum-text-primary)]">
                  {action.label}
                </Text>
                {chantierLabel ? (
                  <Badge variant={CHANTIER_VARIANT[action.chantier] ?? 'outline'}>{chantierLabel}</Badge>
                ) : null}
              </div>
              {action.why ? (
                <Text size="xs" className="mt-1 break-words leading-snug text-[var(--bellum-text-secondary)]">
                  {action.why}
                </Text>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
