import { useState } from 'react'
import { needVerdictPriorityQuestion, type NeedVerdict, type NeedVerdictAxisResult } from '@bellum/contracts'
import { Badge, Button, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/lib/locale'
import { needVerdictAxisDisplay, needVerdictAxisTone, needVerdictTone } from '../model/need-verdict-display'
import { useNeedVerdict } from '../hooks/useNeedVerdict'

/**
 * LE BANDEAU DU VERDICT — « OUI, FAIS-LE », et POURQUOI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE DÉNOMINATEUR EST AFFICHÉ, TOUJOURS
 * ─────────────────────────────────────────────────────────────────────────────
 * « 6 axes · 5 renseignés · 1 attention » n'est pas une décoration : c'est ce
 * qui empêche de lire le verdict comme une vérité complète. Un « OUI » nu se
 * lit comme un feu vert ; le même OUI à côté de « 5 renseignés sur 6 » se lit
 * comme ce qu'il est — une décision prise sur ce qu'on sait.
 *
 * Et ce qui n'a pas pu être évalué est NOMMÉ, pas compté. « Un axe non
 * renseigné » n'apprend rien ; « le panel fournisseurs n'a jamais été
 * regardé » dit quoi compléter pour que le verdict devienne ferme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN NOMBRE AGRÉGÉ, DONC PAS DE `ScoreWithAxes`
 * ─────────────────────────────────────────────────────────────────────────────
 * La primitive `ScoreWithAxes` exige un `score` et un `max`. Ce verdict n'en a
 * pas, et c'est délibéré (voir le docblock de `need-verdict.ts`) : un « 78 »
 * posé à côté d'un go/no-go se lirait comme une chance de signer, quoi qu'on
 * écrive autour. Ce qui s'affiche ici est entièrement qualitatif — des états
 * nommés et des COMPTES d'axes, qui sont vrais tout seuls.
 *
 * ⚠️ Ce bandeau n'est PAS la carte « Laura vous recommande » qui vit juste à
 * côté. Celle-là affiche un taux de réussite MESURÉ sur des positionnements
 * clos, autorisé nommément le 31/08/2026 ; celui-ci ne calcule aucun taux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL PROPOSE, IL NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La puce « suggéré par Bellum » le dit à l'écran, et c'est vrai dans le code :
 * la seule chose qui TRANCHE reste la porte G3 ({@link NeedStaffableControl},
 * plus bas sur la fiche), dont le franchissement est journalisé. Ce bandeau n'a
 * aucun chemin d'écriture.
 */
export function NeedVerdictBanner({ needId, onSeeProfiles }: { needId: string; onSeeProfiles: () => void }) {
  const { t } = useTranslation(['projects', 'accountDetail'])
  const { verdict, profiles, runAt, method, commercialContext, isLoading, isError } = useNeedVerdict(needId)
  const [why, setWhy] = useState(false)

  if (isLoading || isError || !verdict) {
    return (
      <Card className="p-4">
        <Text element="h2" size="sm" weight="semibold">
          {t('needVerdict.title')}
        </Text>
        <div className="mt-2">
          {/* Deux vides, deux phrases — « je n'ai pas pu lire » n'est pas
              « il n'y a pas de verdict ». */}
          <UnknownValue reason={isError ? t('needVerdict.readError') : t('needVerdict.loading')} />
        </div>
      </Card>
    )
  }

  const tone = needVerdictTone(verdict.verdict)
  const attentions = verdict.axes.filter(axis => axis.state === 'attention')
  const blocked = verdict.axes.filter(axis => axis.state === 'blocking')
  // #2323.33 — décision Louis 19/09/2026 : la question qu'on lève D'ABORD,
  // pas un axe non renseigné parmi d'autres.
  const priorityQuestion = needVerdictPriorityQuestion(verdict)

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-[var(--bellum-surface-2)] p-4">
        <Badge variant="outline">{t('needVerdict.suggested')}</Badge>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* LE VERDICT. 30 px, l'échelle Tailwind (GA-31), et sa couleur
                passe par un jeton `*-soft-text` : `--bellum-success` fait
                AA en sombre et échoue en clair. */}
            <Text element="p" size="3xl" weight="bold" className={TONE_TEXT[tone]}>
              {t(`needVerdict.kind.${verdict.verdict}`)}
            </Text>

            {/* CE QUI PORTE LE VERDICT — les axes positifs, nommés. Une phrase
                de résumé générée par un modèle dirait la même chose sans
                pouvoir être vérifiée ; celle-ci se relit axe par axe. */}
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('needVerdict.summary', {
                measured: verdict.measuredCount,
                total: verdict.axisCount,
              })}
            </Text>

            {/* LES ATTENTIONS, en toutes lettres. Ce sont elles que le
                commercial doit emporter dans son appel. */}
            {attentions.map(axis => (
              <Text key={axis.axis} size="sm" className="mt-1 text-[var(--warning-soft-text)]">
                {t('needVerdict.attentionLine', {
                  axis: t(`needVerdict.axis.${axis.axis}`),
                  value: axisText(t, axis),
                })}
              </Text>
            ))}
            {blocked.map(axis => (
              <Text key={axis.axis} size="sm" className="mt-1 text-[var(--danger-soft-text)]">
                {t('needVerdict.blockingLine', {
                  axis: t(`needVerdict.axis.${axis.axis}`),
                  value: axisText(t, axis),
                })}
              </Text>
            ))}
          </div>

          {/* LE DÉNOMINATEUR, dans son propre encadré. */}
          <div className="shrink-0 rounded-md border border-[var(--bellum-border)] p-3">
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('needVerdict.deterministic')}
            </Text>
            <Text size="sm" weight="medium" className="mt-1 block">
              {t('needVerdict.denominator', {
                total: verdict.axisCount,
                measured: verdict.measuredCount,
                count: verdict.attentionCount,
              })}
            </Text>
            {/* La date du rapprochement qui alimente deux des six axes. Une
                mesure sans date se relit comme fraîche six semaines plus tard. */}
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {runAt === null ? t('needVerdict.noRunYet') : t('needVerdict.measuredOn', { date: formatDate(runAt) })}
            </Text>
          </div>
        </div>

        {/* #2323.33 — LA QUESTION QUE LAURA POSE D'ABORD (décision Louis
            19/09/2026). Économie passe devant les cinq autres axes non
            renseignés : c'est l'un des deux axes DÉCISIFS, et sans lui aucun
            « oui » n'est possible — la demander en premier fait avancer le
            verdict le plus. `null` (tout est renseigné) n'affiche rien.
            ⚠️ Ne RÉPÈTE PAS la raison de l'axe (`AxisCell`/`WhyPanel` la
            portent déjà, texte identique) : ce bloc dit LEQUEL demander
            d'abord et POURQUOI ce choix-là, pas ce qui manque au détail —
            « rien n'apparaît deux fois sous la même forme » (loi 4). */}
        {priorityQuestion ? (
          <div className="mt-3 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t('needVerdict.priorityQuestion.title', { axis: t(`needVerdict.axis.${priorityQuestion.axis}`) })}
            </Text>
            <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
              {priorityQuestion.axis === 'economics'
                ? t('needVerdict.priorityQuestion.whyEconomics')
                : t('needVerdict.priorityQuestion.whyOther')}
            </Text>
          </div>
        ) : null}

        {/* #3390 — LA MÉTHODE, choisie à partir de ce MÊME verdict, avant tout
            message : la recherche sémantique de Laura peut illustrer, elle ne
            décide plus seule des mots. `null` (déploiement web-avant-API) ne
            rend aucun bloc — jamais une méthode par défaut inventée. */}
        {method ? (
          <div className="mt-3 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t('needVerdict.method.title')}
            </Text>
            {/* #3852.4 — recette 09/10 : les trois libellés (niveau d'effort,
                route d'ouverture, trajectoire) sont NOMMÉS, pas seulement leur
                valeur nue — et route/trajectoire restent des LIGNES même sans
                donnée (« non évalué »), jamais un bloc qui disparaît. */}
            <Text size="sm" weight="semibold" className="mt-1 block">
              {t('needVerdict.method.effortLevelLine', {
                level: t(`needVerdict.method.effortLevel.${method.effortLevel}`),
              })}
            </Text>
            <Text size="sm" className="mt-0.5 block text-[var(--bellum-text-secondary)]">
              {t(`needVerdict.method.nextStep.${method.nextStep}`)}
            </Text>
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('needVerdict.method.openingRouteLine', {
                route: method.openingRoute
                  ? t(`needVerdict.method.openingRoute.${method.openingRoute}`)
                  : t('needVerdict.method.notEvaluated'),
              })}
            </Text>
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('needVerdict.method.trajectoryLine', {
                trajectory: method.trajectory
                  ? t(`needVerdict.method.trajectory.${method.trajectory}`)
                  : t('needVerdict.method.notEvaluated'),
              })}
            </Text>
            {method.usefulPeople.length > 0 ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {t('needVerdict.method.usefulPeopleLine', {
                  people: method.usefulPeople.map(person => t(`needVerdict.method.usefulPeople.${person}`)).join(', '),
                })}
              </Text>
            ) : null}
            {method.requiredProof ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {t('needVerdict.method.proofLine', { proof: t(`needVerdict.method.proof.${method.requiredProof}`) })}
              </Text>
            ) : null}
            {/* #3390 (recette 30/09) — bascule et arrêt manquaient à l'écran alors
                que le moteur les rend toujours : deux champs sur huit restaient
                calculés sans être lus nulle part. */}
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('needVerdict.method.switchConditionLine', {
                condition: t(`needVerdict.method.switchCondition.${method.switchCondition}`),
              })}
            </Text>
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('needVerdict.method.stopConditionLine', {
                condition: t(`needVerdict.method.stopCondition.${method.stopCondition}`),
              })}
            </Text>
            {/* #3390.9 — le contexte commercial RÉEL, dit et non pondéré : la capacité que le
                commercial a déclarée et les 5P du compte. Une absence ne fait aucune ligne. */}
            {commercialContext?.weeklyAvailableHours ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {t('needVerdict.method.capacityLine', { hours: commercialContext.weeklyAvailableHours })}
              </Text>
            ) : null}
            {commercialContext?.overdueActions ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {t('needVerdict.method.overdueLine', { count: commercialContext.overdueActions })}
              </Text>
            ) : null}
            {commercialContext?.fiveP ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {commercialContext.fiveP.nextDimension
                  ? t('needVerdict.method.fivePLineNext', {
                      readiness: t(`accountDetail:strategy5P.readiness.${commercialContext.fiveP.readiness}`),
                      dimension: t(`accountDetail:strategy5P.dimensions.${commercialContext.fiveP.nextDimension}`),
                    })
                  : t('needVerdict.method.fivePLine', {
                      readiness: t(`accountDetail:strategy5P.readiness.${commercialContext.fiveP.readiness}`),
                    })}
              </Text>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {/* #3486 — une absence ne fait AUCUNE ligne : sans profil, ce bouton
              n'existe pas (la carte « Laura te recommande » porte l'unique
              « Aucun profil au-dessus du seuil »). */}
          {profiles.length > 0 ? (
            <Button size="sm" className="pointer-coarse:min-h-11" onClick={onSeeProfiles}>
              {t('needVerdict.seeProfiles', { count: profiles.length })}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            aria-expanded={why}
            onClick={() => setWhy(current => !current)}
          >
            {t('needVerdict.why')}
          </Button>
        </div>
      </div>

      {/* LES SIX AXES — 3 × 2 au large, une colonne au téléphone (GA-28 : une
          grille figée à trois colonnes déborde sous 768 px). */}
      <div className="grid gap-px bg-[var(--bellum-border)] sm:grid-cols-2 lg:grid-cols-3">
        {verdict.axes.map(axis => (
          <AxisCell key={axis.axis} axis={axis} />
        ))}
      </div>

      {why ? <WhyPanel verdict={verdict} /> : null}
    </Card>
  )
}

/** Une case d'axe : son nom, sa valeur (ou son absence NOMMÉE), son état. */
function AxisCell({ axis }: { axis: NeedVerdictAxisResult }) {
  const { t } = useTranslation('projects')
  const display = needVerdictAxisDisplay(axis)
  const tone = needVerdictAxisTone(axis)

  return (
    <div className="flex items-start justify-between gap-2 bg-[var(--bellum-surface-1)] p-3">
      <div className="min-w-0">
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t(`needVerdict.axis.${axis.axis}`)}
        </Text>
        <div className="mt-0.5">
          {display.measured ? (
            <Text size="sm" weight="semibold" className="block">
              {axisText(t, axis)}
            </Text>
          ) : (
            // ⚠️ JAMAIS « 0 » ni « — » nu : la raison de l'absence est ce qui
            // dit quoi compléter pour que le verdict devienne ferme.
            <UnknownValue reason={t(display.key)} />
          )}
        </div>
      </div>
      {axis.state === null ? null : (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TONE_CHIP[tone]}`}>
          {t(`needVerdict.state.${axis.state}`)}
        </span>
      )}
    </div>
  )
}

/**
 * « POURQUOI CE VERDICT ? » — les axes et leur POIDS, pas une phrase.
 *
 * ⚠️ Aucun modèle n'écrit ici. Un verdict qu'on ne peut pas décomposer est une
 * boîte noire, et une phrase générée serait précisément la boîte : elle se lit
 * bien et ne se vérifie pas.
 *
 * Ce que le panneau rend, et qui suffit à rejouer la décision à la main :
 *  - la RÈGLE appliquée (celle des quatre de `buildNeedVerdict` qui a tranché) ;
 *  - chaque axe, son poids — DÉCISIF ou CONSULTATIF —, son état et sa valeur ;
 *  - ce qui n'a pas pu être évalué, nommé un par un.
 *
 * Le poids est un MOT parce qu'il en est un au contrat : un coefficient qui ne
 * multiplie rien serait une décoration, alors que « décisif » dit exactement ce
 * que l'axe peut faire — dire non.
 */
function WhyPanel({ verdict }: { verdict: NeedVerdict }) {
  const { t } = useTranslation('projects')
  const rule =
    verdict.blockingAxes.length > 0
      ? 'blocking'
      : verdict.unmeasuredDecisiveAxes.length > 0
        ? 'decisiveUnmeasured'
        : verdict.measuredCount < 3
          ? 'tooFewAxes'
          : 'allClear'

  return (
    <div className="border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text element="h3" size="sm" weight="semibold">
        {t('needVerdict.whyTitle')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t(`needVerdict.rule.${rule}`, {
          axes: verdict.blockingAxes
            .concat(verdict.unmeasuredDecisiveAxes)
            .map(axis => t(`needVerdict.axis.${axis}`))
            .join(', '),
        })}
      </Text>

      <dl className="mt-3 grid gap-2">
        {verdict.axes.map(axis => {
          const display = needVerdictAxisDisplay(axis)
          return (
            <div key={axis.axis} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <dt className="min-w-[9rem] text-xs text-[var(--bellum-text-muted)]">
                {t('needVerdict.axisWithWeight', {
                  axis: t(`needVerdict.axis.${axis.axis}`),
                  weight: t(`needVerdict.weight.${axis.weight}`),
                })}
              </dt>
              <dd className="min-w-0 flex-1 text-sm text-[var(--bellum-text-primary)]">
                {display.measured ? (
                  t('needVerdict.axisVerdict', {
                    state: t(`needVerdict.state.${axis.state}`),
                    value: axisText(t, axis),
                  })
                ) : (
                  <UnknownValue reason={t(display.key)} />
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

/**
 * La valeur d'un axe en TEXTE, mise en forme.
 *
 * ⚠️ Les centimes et les dates se formatent ICI et non dans le modèle : le
 * modèle est pur, il ne lit pas la locale, et y figer un format ferait afficher
 * « 65000 » et « 2026-10-01 » à un lecteur anglophone comme à un francophone.
 */
function axisText(t: TFn, axis: NeedVerdictAxisResult): string {
  const display = needVerdictAxisDisplay(axis)
  if (!display.measured) return t(display.key)
  const { targetRateCents, floorRateCents, startOn, ...rest } = display.params ?? {}
  return t(display.key, {
    ...rest,
    ...(targetRateCents === undefined ? {} : { target: formatCents(targetRateCents) }),
    ...(floorRateCents === undefined ? {} : { floor: formatCents(floorRateCents) }),
    ...(startOn === undefined ? {} : { date: formatDate(startOn) }),
  })
}

type TFn = (key: string, params?: Record<string, unknown>) => string

/**
 * ⚠️ Les couleurs passent par les jetons `*-soft-text`, jamais par
 * `--bellum-warning` ni par une classe de la palette Tailwind :
 * `--bellum-warning` fait 9,47:1 en sombre et 1,84:1 en clair. Et le fond des
 * puces est un `*-soft-bg` OPAQUE assorti à son texte, pas une opacité qui se
 * composerait sur le fond du thème.
 */
const TONE_TEXT: Record<string, string> = {
  success: 'text-[var(--success-soft-text)]',
  warning: 'text-[var(--warning-soft-text)]',
  danger: 'text-[var(--danger-soft-text)]',
  unknown: 'text-[var(--bellum-text-secondary)]',
}

const TONE_CHIP: Record<string, string> = {
  success: 'bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
  warning: 'bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  danger: 'bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
  unknown: 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
}
