import { BRIEFING_ACTIONS_SHOWN, briefingActionSourceKey, explainBriefingDomination } from '@bellum/contracts'
import type { AgendaConflict, BriefingAction, BriefingArtifact, BriefingFactCapability } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQualificationSummary } from '@/features/accounts/view/accounts-list/useQualificationSummary'
import { useCreateTask, useTasks } from '@/features/tasks/hooks/useTasks'
import { TaskComposer } from '@/features/tasks/view/TaskComposer'
import { ConflictDialog } from './ConflictDialog'
import { conflictLookupById } from '../conflict-lookup'
import {
  briefingActionHasOpenTask,
  briefingActionHeadline,
  briefingActionTaskTarget,
} from '../lib/action-task-transform'
import { PriorityCard } from './PriorityCard'

/**
 * « À FAIRE MAINTENANT » — les cartes du matin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Une carte était UNE PHRASE cliquable. Elle ne disait ni d'où venait son
 * fait, ni de quand, ni pourquoi elle tombait aujourd'hui. Un commercial la
 * lisait et devait choisir entre la croire sur parole et aller vérifier
 * ailleurs — c'est-à-dire refaire le travail que le brief est censé faire.
 *
 * Chaque carte porte désormais, dans cet ordre : son rang, le FAIT, le
 * CONTEXTE (« pourquoi celle-ci, maintenant »), la PROVENANCE (la capacité et
 * la date), puis le geste. Chacun de ces blocs DISPARAÎT quand la donnée
 * manque — il n'y a pas de « source inconnue » affichée en gris, pas de
 * « aucune préparation », pas de date du jour posée par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS SUR SEPT
 * ─────────────────────────────────────────────────────────────────────────
 * Le moteur classe sept cartes ; l'écran en rend trois d'emblée et replie le
 * reste (#2095.78 — resserré depuis cinq). Ce n'est pas une découpe
 * cosmétique : trois est ce qu'on lit debout avant une réunion, et les
 * suivantes existent quand même — les jeter au tri reviendrait à décider à la
 * place de quelqu'un qui a cinq minutes de plus.
 *
 * ⚠️ Le dépli DIT COMBIEN il cache, avec le compte RÉEL. Une carte de plus et
 * il dit « 1 autre action », au singulier. Un « 2 » écrit en dur mentirait un
 * jour sur deux, et personne ne le verrait — c'est exactement la famille de
 * défaut que ce dépôt paie le plus souvent.
 */
export function ActionsBlock({
  actions,
  everySourceReady,
  onOpenMeetingPrep,
  conflicts = [],
  totalCandidateCount,
}: {
  actions: BriefingAction[]
  everySourceReady: boolean
  // #2106.35 — la porte « Préparer le rendez-vous » depuis la carte `meeting_prep`,
  // optionnelle : `BriefingPage` la fournit, un test de ce bloc seul peut s'en
  // passer sans qu'une carte se promette cliquable pour rien.
  onOpenMeetingPrep?: (actionId: string) => void
  /**
   * #2102.1/#2102.2 — les DEUX rendez-vous complets d'un conflit, pour la
   * carte qui veut les montrer. `[]` par défaut : les appelants qui n'ont
   * pas encore ce brief (tests existants, `OverflowPriorities`) restent
   * byte-identiques — une carte de conflit y redevient un simple constat.
   */
  conflicts?: AgendaConflict[]
  /**
   * #2107 (Centre d'actions, recette écran du 25/09/2026) — le compte RÉEL
   * de candidats, AVANT le plafond `BRIEFING_ACTIONS_MAX` (`GET
   * /briefing/actions`, jamais tronqué). `undefined` tant que cette lecture
   * n'a pas répondu : le lien « voir les autres » reste absent plutôt que de
   * promettre un compte qu'on n'a pas encore. Un genre entier (mission sans
   * date, profil sans retour, exigence AO non couverte…) pouvait disparaître
   * SANS AUCUN lien nulle part — mesuré en recette #2107.4/#2107.8/#2107.14.
   */
  totalCandidateCount?: number
}) {
  const { t } = useTranslation('briefing')
  const [expanded, setExpanded] = useState(false)
  const [openConflict, setOpenConflict] = useState<AgendaConflict | null>(null)
  // #2105.24 — la carte en cours de transformation, avec son libellé DÉJÀ
  // calculé (`briefingActionHeadline`) : le composeur et la garde de dédup
  // doivent lire exactement le même texte que celui affiché sur la carte.
  const [converting, setConverting] = useState<{ action: BriefingAction; headline: string } | null>(null)
  // #2105.53 — LES TÂCHES OUVERTES de la personne, pour savoir quelles cartes
  // ont déjà été transformées. Même clé de cache que `TaskList` (`scope:
  // 'mine'`) : si la liste est déjà montée ailleurs sur la page, cette lecture
  // ne coûte aucune requête de plus.
  const { data: myTasks } = useTasks('mine')
  const createTask = useCreateTask()
  // #3749.2 — même lecture que la liste des comptes (`useQualificationSummary`,
  // GA-26) : un verdict par compte, jamais recalculé. Une panne de lecture
  // laisse la carte sans facette (`undefined`), jamais un verdict deviné.
  const { data: qualificationSummary } = useQualificationSummary()
  const qualificationVerdictByAccount = useMemo(
    () => new Map((qualificationSummary ?? []).map(row => [row.accountId, row.verdict])),
    [qualificationSummary],
  )

  const shown = actions.slice(0, BRIEFING_ACTIONS_SHOWN)
  const hidden = actions.slice(BRIEFING_ACTIONS_SHOWN)
  const visible = expanded ? actions : shown
  // #2095.81 / #2993 — pourquoi CETTE carte passe devant la SUIVANTE dans le
  // classement RÉEL (`actions`, jamais `visible` : le repli replie l'écran,
  // pas le classement — la carte n°3 continue de se comparer à la n°4 même
  // masquée). L'index dans `visible` reste celui d'`actions` : `visible` EST
  // `actions` (déplié) ou son PRÉFIXE (replié), jamais un sous-ensemble
  // réordonné.
  const dominationReasons = useMemo(() => explainBriefingDomination(actions), [actions])
  // Au-delà du plafond du brief : ce que `GET /briefing/today` a dû évincer
  // pour tenir dans `BRIEFING_ACTIONS_MAX`, jamais un compte négatif ni un
  // compte deviné avant que `totalCandidateCount` ait répondu.
  const beyondCap = Math.max(0, (totalCandidateCount ?? actions.length) - actions.length)

  // La carte de conflit encode ses deux évènements dans son id — voir
  // `conflictLookupById` (GA-26 : la même règle sert aussi `OverflowPriorities`).
  const conflictsById = useMemo(() => conflictLookupById(conflicts), [conflicts])

  if (!actions.length) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {everySourceReady ? t('actions.empty') : t('actions.emptyPartial')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-3">
      <ActionsBanner total={actions.length} shownCount={shown.length} hiddenCount={hidden.length} actions={actions} />

      {/* #2106.21 — « BellumAI a préparé pour toi » : un bloc COMPACT, distinct
          des cartes, pour la question « qu'est-ce qui est déjà prêt ? » sans
          ouvrir chacune des cinq cartes. */}
      <PreparedForYouBlock actions={actions} />

      <Box className="flex flex-col gap-2">
        {visible.map((action, index) => {
          // #2105.24/.53 — calculé UNE fois : la carte l'affiche, le
          // composeur le reprend verbatim, la garde de dédup le compare.
          const headline = briefingActionHeadline(action, t)
          const target = briefingActionTaskTarget(action)
          const linkedId = target.accountId ?? target.contactId ?? null
          const transformedToTask = briefingActionHasOpenTask(headline, linkedId, myTasks ?? [])
          return (
            // #2099 — LA CARTE DE PRIORITÉ. C'est la même carte qu'avant,
            // déménagée dans son fichier et enrichie des facettes du contrat
            // canonique : ce bloc reste son SEUL appelant.
            <PriorityCard
              key={action.id}
              action={action}
              rank={index + 1}
              onOpenMeetingPrep={onOpenMeetingPrep}
              // ⚠️ Le geste n'existe QUE si la donnée existe : passer un
              // gestionnaire qui ne trouverait rien fabriquerait un bouton qui
              // sonne comme un vrai clic et ne fait rien (mesuré ailleurs dans
              // ce dépôt — un bouton qui SONNE comme une lecture n'en est pas
              // une). Sans conflit correspondant, `onOpenConflict` reste
              // `undefined` et la carte redevient un simple constat.
              onOpenConflict={
                conflictsById.has(action.id) ? () => setOpenConflict(conflictsById.get(action.id) ?? null) : undefined
              }
              onTransformToTask={() => setConverting({ action, headline })}
              transformedToTask={transformedToTask}
              dominates={dominationReasons[index] ?? null}
              qualificationVerdict={
                action.businessObject?.kind === 'account'
                  ? (qualificationVerdictByAccount.get(action.businessObject.id) ?? null)
                  : null
              }
            />
          )
        })}
      </Box>

      {openConflict ? <ConflictDialog conflict={openConflict} onClose={() => setOpenConflict(null)} /> : null}

      {/* #2105.24 — le CTA « Transformer ce sujet en prochaine action » ouvre
          CE composeur, l'objet déjà écrit. #2105.25/.26/.28 : owner, date et
          résultat restent les champs du composeur, inchangés. */}
      {converting ? (
        <TaskComposer
          key={converting.action.id}
          open
          onOpenChange={open => {
            if (!open) setConverting(null)
          }}
          isPending={createTask.isPending}
          initialTitle={converting.headline}
          onSubmit={draft =>
            createTask.mutate(
              {
                ...draft,
                ...briefingActionTaskTarget(converting.action),
                // #2105.53 (correctif) — l'identité de la carte, pour que le
                // brief du jour sache ne plus la reproposer une fois la tâche
                // créée (`BriefingService.excludeAlreadyTransformed`).
                sourceLabelKey: briefingActionSourceKey(converting.action),
              },
              { onSuccess: () => setConverting(null) },
            )
          }
        />
      ) : null}

      {hidden.length ? (
        <Box className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
          <Box className="flex min-w-0 flex-col gap-1">
            <Text size="sm" weight="medium">
              {t('actions.more.title', { count: hidden.length })}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('actions.more.subtitle')}
            </Text>
          </Box>
          {/* Un `<button>` et non un `<div onClick>` : ce qui se clique se
              tabule, et le nom du bouton PORTE le compte — un lecteur d'écran
              annonce « Voir les 2 autres », pas « bouton ». */}
          <Button size="sm" variant="outline" onClick={() => setExpanded(value => !value)}>
            {expanded ? t('actions.more.close') : t('actions.more.open', { count: hidden.length })}
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </Box>
      ) : null}

      {/* #2107 (Centre d'actions) — AU-DELÀ du plafond du brief : le lien VERS
          l'écran qui rend l'ensemble entier (`/actions`, `OverflowPriorities`).
          Le dépli ci-dessus ne peut jamais montrer ces genres-là : ils ne sont
          simplement pas dans `actions` (déjà tronqué par le serveur). Sans ce
          lien, un genre évincé n'a AUCUNE porte, sur AUCUN écran.
          #2097 (correctif du 26/09) — UN SEUL « voir plus » À LA FOIS, mesuré
          sur iPhone en prod : ce lien et le bouton « Voir les N autres »
          ci-dessus rendaient TOUS LES DEUX en permanence, deux affordances de
          repli pour la même carte. Quand le bouton local EXISTE (`hidden.length`),
          ce lien n'apparaît plus que sous la liste DÉPLIÉE (`expanded`) — la
          porte vers le Centre d'actions se découvre après avoir ouvert le
          repli local, jamais à côté de lui. Sans bouton local (les candidats
          au-delà du plafond du brief existent sans qu'aucun ne soit replié
          ICI — actions.length ≤ BRIEFING_ACTIONS_SHOWN), rien ne fait
          doublon : le lien reste visible, seule porte disponible. */}
      {beyondCap > 0 && (hidden.length === 0 || expanded) ? (
        <Link to="/actions" className="underline">
          <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('actions.more.viewAllLink')}
          </Text>
        </Link>
      ) : null}
    </Box>
  )
}

/**
 * LE BANDEAU — combien d'actions, combien visibles, d'où elles viennent.
 *
 * ⚠️ « rien ne sera envoyé » est une PROMESSE, pas une décoration. Elle est
 * vraie par construction : aucune carte du brief ne porte de chemin d'écriture,
 * `href` ouvre un écran de lecture et rien d'autre. La garde
 * `apps/api/src/modules/briefing/nothing-is-sent.spec.ts` relit le producteur
 * de cartes et fait tomber cette phrase le jour où un envoi apparaîtrait.
 *
 * ⚠️ Les SOURCES sont dérivées des cartes RÉELLEMENT rendues, jamais écrites en
 * dur. Une liste figée annoncerait « agenda · messagerie » à quelqu'un dont
 * aucune boîte n'est connectée : le bandeau affirmerait une lecture qui n'a pas
 * eu lieu, ce qui est la définition d'un chiffre inventé, en mots.
 */
function ActionsBanner({
  total,
  shownCount,
  hiddenCount,
  actions,
}: {
  total: number
  shownCount: number
  hiddenCount: number
  actions: BriefingAction[]
}) {
  const { t } = useTranslation('briefing')

  const capabilities = useMemo(() => {
    const seen = new Set<BriefingFactCapability>()
    for (const action of actions) if (action.fact) seen.add(action.fact.provenance.capability)
    return [...seen]
  }, [actions])

  // #2401.6 — compté sur les artefacts RÉELLEMENT préparés par les cartes
  // (jamais deviné) : la carte du matin distingue ce qui a été PRÉPARÉ de ce
  // qui a été ENVOYÉ (doctrine — le copilote n'envoie jamais seul). Aucun
  // artefact préparé ⇒ la promesse reste au futur, sur le geste à venir.
  const preparedCount = useMemo(
    () => actions.reduce((total, action) => total + action.preparedArtifacts.length, 0),
    [actions],
  )

  const summary = [
    t('actions.banner.shown', { count: shownCount }),
    hiddenCount ? t('actions.banner.hidden', { count: hiddenCount }) : null,
    preparedCount > 0 ? t('actions.banner.preparedNotSent', { count: preparedCount }) : t('actions.banner.nothingSent'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-2.5">
      <Box className="flex flex-wrap items-center gap-3">
        {/* Une pastille douce, avec SA paire de tokens : un fond teinté et le
            texte qui va avec. Un fond à opacité se compose sur le fond du
            thème, donc son texte doit suivre — c'est la distinction que la
            première version de la règle des deux thèmes avait ratée. */}
        <Text
          size="xs"
          weight="medium"
          className="rounded-full bg-[var(--accent-soft-bg)] px-2.5 py-1 text-[var(--accent-soft-text)]"
        >
          {t('actions.banner.count', { count: total })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {summary}
        </Text>
      </Box>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {capabilities.length
          ? t('actions.banner.sources', {
              list: capabilities.map(capability => t(`source.capability.${capability}`)).join(' · '),
            })
          : t('actions.banner.sourcesUnknown')}
      </Text>
    </Box>
  )
}

/**
 * #2106.21 — « BellumAI a préparé pour toi ».
 *
 * ⚠️ Ce n'est PAS une seconde vue des mêmes lignes (GA-26 — « rien n'apparaît
 * deux fois sous la même forme ») : chaque carte montre déjà ses artefacts EN
 * CONTEXTE (« Préparation disponible » + l'étiquette exacte, juste sous son
 * propre fait). Ce bloc-ci répond à une question DIFFÉRENTE, posée AVANT
 * d'ouvrir une carte — « qu'y a-t-il de prêt, au total, sur ma journée ? » —
 * et il y répond sous une forme DIFFÉRENTE : un compte PAR NATURE d'artefact
 * (un brouillon, une liste courte, une check-list), jamais l'étiquette
 * détaillée que la carte porte déjà. Les deux coexistent sans se répéter.
 *
 * Disparaît entièrement si rien n'est prêt : un bloc vide sous ce titre
 * affirmerait une préparation qui n'a pas eu lieu.
 *
 * #2106.21 (24/09/2026) — EXPORTÉ : `/dashboard` (`PersonalCockpit.tsx`) le
 * monte aussi, avec ses PROPRES actions du jour (`useDailyBriefing`) — même
 * question, posée depuis le cockpit plutôt que depuis « Aujourd'hui », jamais
 * un second calcul (GA-26).
 */
export function PreparedForYouBlock({ actions }: { actions: BriefingAction[] }) {
  const { t } = useTranslation('briefing')

  const countByKind = useMemo(() => {
    const counts = new Map<BriefingArtifact['kind'], number>()
    for (const action of actions) {
      for (const artifact of action.preparedArtifacts) {
        counts.set(artifact.kind, (counts.get(artifact.kind) ?? 0) + 1)
      }
    }
    return counts
  }, [actions])

  if (countByKind.size === 0) return null

  return (
    <Box className="flex flex-col gap-1.5 rounded-xl border border-[var(--bellum-border)] px-4 py-3">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('actions.preparedForYou.title')}
      </Text>
      <Box className="flex flex-col gap-0.5">
        {[...countByKind.entries()].map(([kind, count]) => (
          <Text key={kind} size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`actions.preparedForYou.kind.${kind}`, { count })}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
