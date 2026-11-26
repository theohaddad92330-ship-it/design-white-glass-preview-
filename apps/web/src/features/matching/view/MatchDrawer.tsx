import { useMemo, useState } from 'react'
import type { FeedbackAxis, MatchResult, MatchRun, NextBestMoveOption } from '@bellum/contracts'
import { matchesFlexibleQuery } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { ChevronDown, ChevronRight, Coins } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useConfirmTalentAvailability, useConsultants } from '@/features/consultants/hooks'
import { NeedActionsMenu } from '@/features/projects/open-needs/view/NeedActionsMenu'
import type { ActionableNeed } from '@/features/projects/open-needs/model/need-actions'
import { useCreateShortlist } from '../hooks'
import { MatchCard } from './MatchCard'
import { MatchExplainSheet } from './MatchExplainSheet'
import { CvStudioSheet } from './CvStudioSheet'
import { RelaunchConsultantDialog } from './RelaunchConsultantDialog'
import { TransparencyBanner } from './TransparencyBanner'
import { CompareTable } from './CompareTable'
import { PositionDialog } from './PositionDialog'
import { noMatchCauses } from './no-match-causes'
import {
  gestureForFeedbackAxis,
  isGuidedGesture,
  NextBestMoveGestureDialog,
  type GuidedGesture,
} from './NextBestMoveGestureDialog'

/**
 * Le panneau de matching (PDF 4 §7).
 *
 * Quatre blocs, jamais trois. « Non évaluables » est celui qui fait la
 * différence : un profil dont on ignore la disponibilité n'est pas un profil qui
 * ne convient pas, et les fondre le ferait disparaître sans un mot. Les
 * « écartés » sont repliés et groupés par motif avec leur compteur — c'est ce
 * qui rend lisible « 34 ne collent pas » sans noyer les cinq qui comptent.
 *
 * Le bandeau de transparence est en tête et non masquable : classer des
 * personnes relève de l'annexe III de l'AI Act, et la mention n'est pas une
 * préférence d'interface.
 */
export function MatchDrawer({
  run,
  needId,
  identities,
  open,
  onOpenChange,
  need,
}: {
  run: MatchRun | null
  needId: string
  identities: Map<
    string,
    {
      fullName: string
      title: string | null
      dailyRateCents?: number | null
      availableFrom?: string | null
      location?: string | null
      /** #2176.55 — coût/marge, posé par l'API seulement sous `finance:read`. */
      finance?: { costCents: number | null; marginCents: number | null } | null
    }
  >
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * #2178.20/.21 — ce qu'il faut pour que le geste « Refuser le besoin » du
   * panneau zéro-résultat sache si CE besoin peut vraiment être clos (porte
   * d'état `canTransitionNeedStatus`, la même que partout ailleurs).
   * `undefined` = l'appelant n'a pas ce contexte sous la main (aucun appelant
   * actuel n'est dans ce cas) : le geste se grise plutôt que de deviner.
   */
  need?: ActionableNeed
}) {
  const { t } = useTranslation('matching')
  const [selected, setSelected] = useState<string[]>([])
  // #2176.47 — « Écarter » est purement local à CETTE session de rapprochement :
  // le classement n'est jamais réécrit côté serveur, jamais fusionné, jamais
  // perdu — relancer le matching le fait réapparaître. C'est un tri visuel, pas
  // une décision qui s'archive.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const dismiss = (id: string) => {
    setDismissed(current => new Set(current).add(id))
    toast.success(t('card.dismissed', { name: identities.get(id)?.fullName ?? t('card.unknownName') }))
  }
  const createShortlist = useCreateShortlist(needId)

  const summary = useMemo(() => {
    if (!run) return ''
    // Le compte des RECOMMANDÉS porte le pluriel : « 1 méritent d'être
    // regardés » est la première phrase que lit l'utilisateur, et une faute
    // d'accord y coûte plus qu'ailleurs.
    return t('summary', {
      count: run.recommended.length,
      total: run.evaluatedCount + run.prefilteredCount,
      recommended: run.recommended.length,
      borderline: run.borderline.length,
      excluded: run.excluded.length,
    })
  }, [run, t])

  const toggle = (id: string) =>
    setSelected(current => (current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]))

  const nameOf = (id: string) => identities.get(id)?.fullName ?? t('card.unknownName')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">
            {run ? `${run.need.role}${run.need.accountName ? ` · ${run.need.accountName}` : ''}` : t('title')}
          </SheetTitle>
          <SheetDescription>{summary}</SheetDescription>
          {/* #2773 — recette prod 08/10 : « Lancer le matching » ne débite
              aucun crédit (`MatchRun` n'a jamais porté de champ coût), mais
              rien ne le disait à l'écran. Un rapprochement n'est jamais
              facturé, qu'il reste en cours ou qu'il ait déjà répondu. */}
          <Text
            element="p"
            size="xs"
            color="text-[var(--bellum-text-secondary)]"
            className="mt-1 flex items-center gap-1.5"
          >
            <Coins className="size-3.5 shrink-0" aria-hidden />
            {t('freeNote')}
          </Text>
          {/* Le drapeau `truncated` était calculé côté serveur et n'atteignait
              AUCUN écran. Ce qu'il dit est précis, et le libellé ne doit pas en
              dire plus : le CLASSEMENT est complet, c'est le JOURNAL D'AUDIT qui
              s'arrête à 500 lignes. Écrire « résultats tronqués » ferait douter
              d'un classement qui, lui, est exhaustif. */}
          {run?.truncated ? (
            <Text element="p" size="xs" color="text-[var(--warning-soft-text)]" className="mt-1">
              {t('journalTruncated')}
            </Text>
          ) : null}
        </SheetHeader>
        <TransparencyBanner />
        <ScrollArea className="flex-1">
          <Box display="flex" className="flex-col gap-4 p-5">
            {!run ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('loading')}
              </Text>
            ) : (
              <>
                <CriteriaBand run={run} />

                {/* #2178.33/.34 — ce que les refus client DÉJÀ enregistrés sur ce
                    besoin disent, avant même de savoir si CE classement en trouve
                    un. Ne réordonne rien ci-dessous : un signal nommé, pas un
                    poids caché dans le classement. */}
                <FeedbackLearningsBanner learnings={run.feedbackLearnings} need={run.need} />

                {/* #2331 — le calcul (`nextBestMove`, next-best-move.ts) existait déjà,
                    testé côté service, sans qu'aucun écran ne le lise : voir le
                    docstring du module. Non `null` UNIQUEMENT quand le classement
                    n'a produit AUCUN profil défendable — jamais un écran qui dit
                    juste « aucun résultat » sans dire quoi faire. */}
                {/* #2178.1-.6/.9 — le DIAGNOSTIC nommé vient AVANT les arbitrages : dire
                    ce qui bloque avant de proposer quoi en faire. Même garde que
                    `NextBestMoveBanner` (non `null` uniquement sur un vrai zéro résultat). */}
                {run.nextBestMove ? <NoMatchCausesBanner causes={noMatchCauses(run)} /> : null}

                {run.nextBestMove ? (
                  <NextBestMoveActions
                    options={run.nextBestMove}
                    accountId={run.need.accountId ?? null}
                    need={need}
                    matchNeed={run.need}
                  />
                ) : null}

                {selected.length >= 2 && selected.length <= 4 ? (
                  <CompareTable
                    results={[...run.recommended, ...run.borderline, ...run.notEvaluable].filter(result =>
                      selected.includes(result.consultantId),
                    )}
                    nameOf={nameOf}
                    identities={identities}
                  />
                ) : null}

                {selected.length > 0 ? (
                  <Box display="flex" className="items-center gap-2">
                    <Button
                      size="sm"
                      disabled={createShortlist.isPending}
                      onClick={() => {
                        createShortlist.mutate(
                          { runId: run.runId, consultantIds: selected },
                          {
                            onSuccess: () => toast.success(t('shortlist.created', { count: selected.length })),
                            onError: error => toast.error(error.message),
                          },
                        )
                      }}
                    >
                      {t('shortlist.create', { count: selected.length })}
                    </Button>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('shortlist.cap')}
                    </Text>
                  </Box>
                ) : null}

                <Bucket
                  title={t('buckets.recommended')}
                  results={run.recommended}
                  defaultOpen
                  // #2176.41 — 5 en tête, le reste consultable sur demande :
                  // seul le bloc RECOMMANDÉ est plafonné, c'est celui qu'on
                  // regarde en premier et le seul assez grand pour noyer.
                  cap={5}
                  needId={needId}
                  runId={run.runId}
                  identities={identities}
                  selected={selected}
                  onToggle={toggle}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                />
                <Bucket
                  title={t('buckets.borderline')}
                  results={run.borderline}
                  defaultOpen
                  needId={needId}
                  runId={run.runId}
                  identities={identities}
                  selected={selected}
                  onToggle={toggle}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                />
                <Bucket
                  title={t('buckets.notEvaluable')}
                  results={run.notEvaluable}
                  defaultOpen
                  needId={needId}
                  runId={run.runId}
                  identities={identities}
                  selected={selected}
                  onToggle={toggle}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                />
                <Bucket
                  title={t('buckets.excluded')}
                  results={run.excluded}
                  defaultOpen={false}
                  counts={run.exclusionCounts}
                  needId={needId}
                  runId={run.runId}
                  identities={identities}
                  selected={selected}
                  onToggle={toggle}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                />
              </>
            )}
          </Box>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Le bandeau de critères (§7.1).
 *
 * Il montre ce sur quoi le classement a porté. Les critères se modifient dans le
 * besoin lui-même : les rendre éditables ici sans les enregistrer produirait un
 * classement qu'on ne pourrait pas reproduire — or la reproductibilité est une
 * obligation, pas une commodité.
 */
function CriteriaBand({ run }: { run: MatchRun }) {
  const { t } = useTranslation('matching')
  const required = run.need.skills.filter(skill => skill.required).map(skill => skill.term)
  const nice = run.need.skills.filter(skill => !skill.required).map(skill => skill.term)
  return (
    <Box className="rounded-md border border-border p-3">
      <Row label={t('criteria.required')} value={required.join(' · ') || t('criteria.none')} />
      <Row label={t('criteria.nice')} value={nice.join(' · ') || t('criteria.none')} />
      <Row
        label={t('criteria.context')}
        value={
          [
            run.need.location,
            run.need.startOn ? t('criteria.startOn', { date: run.need.startOn }) : null,
            run.need.contractKind,
          ]
            .filter(Boolean)
            .join(' · ') || t('criteria.none')
        }
      />
      <Row label={t('criteria.threshold')} value={String(run.threshold)} />
    </Box>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" className="gap-2">
      <Text size="xs" weight="medium" className="w-32 shrink-0">
        {label}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {value}
      </Text>
    </Box>
  )
}

/**
 * #2178.1-.6/.9 — LE DIAGNOSTIC NOMMÉ D'UN ZÉRO RÉSULTAT.
 *
 * Ne jamais laisser l'écran dire seulement « 28 profils ne collent pas » : la
 * fonction pure `noMatchCauses` (voir son docblock) relit ce que le classement
 * a déjà compté — `exclusionCounts` et `notEvaluable` — et ce bandeau les NOMME
 * en tête, avant les arbitrages. Un profil ÉCARTÉ et un profil NON ÉVALUABLE
 * restent deux badges séparés : le second n'a pas été jugé « non conforme »,
 * il n'a simplement pas pu être jugé — les confondre ferait passer une absence
 * de preuve pour un refus.
 */
function NoMatchCausesBanner({ causes }: { causes: ReturnType<typeof noMatchCauses> }) {
  const { t } = useTranslation('matching')
  if (causes.length === 0) return null
  return (
    <Card className="border-border p-4" role="status">
      <Text size="sm" weight="semibold">
        {t('nextBestMove.causesTitle')}
      </Text>
      <Box display="flex" className="mt-2 flex-wrap gap-1">
        {causes.map(cause => (
          <Badge
            key={`${cause.source}-${cause.reason}`}
            variant={cause.source === 'notEvaluable' ? 'outline' : 'default'}
          >
            {t(`reasons.${cause.reason}`)}
            {cause.source === 'notEvaluable' ? ` · ${t('nextBestMove.notEvaluableQualifier')}` : ''} · {cause.count}
          </Badge>
        ))}
      </Box>
    </Card>
  )
}

/**
 * #2178.33/.34 — CE QUE LES REFUS CLIENT DÉJÀ ENREGISTRÉS DISENT SUR CE BESOIN.
 *
 * `run.feedbackLearnings` (`apps/api/.../need-feedback-learnings.ts`) compte,
 * par axe, les verdicts « en dessous » déjà donnés par un client sur une
 * précédente proposition pour CE besoin. `[]` → rien ne s'affiche (GA-18/19,
 * jamais un décompte à zéro affiché comme un fait) — ce bandeau n'est donc
 * visible QUE quand il y a réellement quelque chose à dire.
 *
 * Ce bandeau ne réordonne AUCUN classement — voir le docblock du module côté
 * API pour la raison : un signal humain se LIT, il ne pondère pas en silence.
 */
function FeedbackLearningsBanner({
  learnings,
  need,
}: {
  learnings: MatchRun['feedbackLearnings']
  need: MatchRun['need']
}) {
  const { t } = useTranslation('matching')
  // #2178.33 — le feedback PROPOSE une mise à jour du besoin (le dialogue
  // guidé, prérempli depuis la fiche, origine nommée) ; l'utilisateur valide.
  // Rien n'est écrit sans son clic, rien ne pèse sur le classement (#2178.34).
  const [proposal, setProposal] = useState<{ axis: FeedbackAxis; gesture: GuidedGesture } | null>(null)
  if (learnings.length === 0) return null
  return (
    <Card className="border-border p-4" role="status">
      <Text size="sm" weight="semibold">
        {t('feedbackLearnings.title')}
      </Text>
      <Box display="flex" className="mt-2 flex-wrap items-center gap-1">
        {learnings.map(learning => {
          // GA-26 — le libellé d'un axe de feedback vit à UN endroit, déjà
          // posé par le dialogue de retour client (SubmissionFeedbackDialog,
          // #2335.4/#2178.29) : on le RELIT, jamais une seconde traduction.
          const axisLabel = t(`submissions:feedback.axis.${learning.axis}`)
          const gesture = need.needId ? gestureForFeedbackAxis(learning.axis) : null
          return (
            <Box key={learning.axis} display="flex" className="items-center gap-1">
              <Badge variant="outline">
                {axisLabel} · {learning.belowCount}
              </Badge>
              {gesture ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('feedbackLearnings.proposeFor', { axis: axisLabel })}
                  onClick={() => setProposal({ axis: learning.axis, gesture })}
                >
                  {t('feedbackLearnings.propose')}
                </Button>
              ) : null}
            </Box>
          )
        })}
      </Box>
      {proposal ? (
        <NextBestMoveGestureDialog
          option={proposal.gesture}
          need={need}
          proposedBy={proposal.axis}
          onOpenChange={open => (open ? undefined : setProposal(null))}
        />
      ) : null}
    </Card>
  )
}

/**
 * #2331 / #2178.11-.18/.20/.21/.23/.38 — L'ARBITRAGE D'UN ZÉRO RÉSULTAT,
 * DEVENU UN GESTE.
 *
 * `run.nextBestMove` n'est jamais `null` quand aucun profil n'est défendable
 * (`recommended` et `borderline` tous deux vides — voir next-best-move.ts).
 * NO-GO (#2331.7) : on ne remplit jamais l'écran de profils approchants pour
 * « avoir quelque chose » — ce bandeau REMPLACE cette tentation par une liste
 * d'arbitrages nommés, jamais un vide silencieux.
 *
 * Chaque option vient de la liste FERMÉE des dix arbitrages
 * (`NEXT_BEST_MOVE_OPTIONS`, packages/contracts) : un libellé non prévu
 * casserait la traduction plutôt que de se deviner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2178.21 — LE PREMIER EST LE BOUTON PRINCIPAL
 * ─────────────────────────────────────────────────────────────────────────
 * `options[0]` est le geste lié à la cause qui revient le plus (le tri vit
 * dans `next-best-move.ts`, PAS ici) : il se rend en bouton PRIMAIRE, jamais
 * un libellé générique du type « Relancer le matching » qui ne dirait rien de
 * plus si rien n'a changé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2178.11-.18/.20/.23 — CHAQUE ARBITRAGE EST UN GESTE, PAS UNE ÉTIQUETTE
 * ─────────────────────────────────────────────────────────────────────────
 * `nextBestMoveGestureTarget` (ci-dessous) dit OÙ chaque arbitrage mène :
 *  - #2178.11-.17 — `clarifier`/`negocier`/`elargir`/`elargir_contrat`/
 *    `reactiver`/`recommandation`/`sourcer` → le DIALOGUE GUIDÉ
 *    (`NextBestMoveGestureDialog`) : le geste s'accomplit sur place, au lieu
 *    d'un lien vers une page où retrouver seul le bon champ ;
 *  - `partenaire` → le compte du besoin, onglet Partenaires — grisé si
 *    `run.need.accountId` manque (#2178.18) ;
 *  - `refuser` → le panneau de motif EXISTANT (`NeedActionsMenu`,
 *    `close_cancelled`), rejoué directement au clic — jamais un second
 *    dialogue de clôture qui pourrait diverger (GA-26) ;
 *  - `reverse_market` → le sélecteur de profil (#2178.23/.41, ci-dessous),
 *    qui réutilise `/consultants/$id/reverse-market` — l'existant, jamais
 *    recalculé.
 */
const NEXT_BEST_MOVE_PRIMARY_VARIANT = 'default'
const NEXT_BEST_MOVE_SECONDARY_VARIANT = 'outline'

type GuidedTarget = { kind: 'guided'; gesture: GuidedGesture }
type AccountTarget = { kind: 'account'; tab: 'contacts' | 'partners' }
type RefuseTarget = { kind: 'refuse' }
type ReverseMarketTarget = { kind: 'reverse_market' }
type GestureTarget = GuidedTarget | AccountTarget | RefuseTarget | ReverseMarketTarget

function nextBestMoveGestureTarget(option: NextBestMoveOption): GestureTarget {
  // #2178.11-.17 — sept arbitrages s'accomplissent dans le dialogue guidé.
  if (isGuidedGesture(option)) return { kind: 'guided', gesture: option }
  switch (option) {
    case 'partenaire':
      return { kind: 'account', tab: 'partners' }
    case 'refuser':
      return { kind: 'refuse' }
    case 'reverse_market':
      return { kind: 'reverse_market' }
  }
}

function NextBestMoveActions({
  options,
  accountId,
  need,
  matchNeed,
}: {
  options: NextBestMoveOption[]
  accountId: string | null
  need: ActionableNeed | undefined
  matchNeed: MatchRun['need']
}) {
  const { t } = useTranslation('matching')
  const [pickingReverseMarket, setPickingReverseMarket] = useState(false)
  // #2178.11-.17 — le geste guidé ouvert (un seul à la fois).
  const [guided, setGuided] = useState<GuidedGesture | null>(null)
  return (
    <Card className="border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-4" role="status">
      <Text size="sm" weight="semibold">
        {t('nextBestMove.title')}
      </Text>
      <Box display="flex" className="mt-2 flex-wrap gap-2">
        {options.map((option, index) => (
          <NextBestMoveButton
            key={option}
            option={option}
            primary={index === 0}
            accountId={accountId}
            need={need}
            onPickReverseMarket={() => setPickingReverseMarket(true)}
            onOpenGuided={setGuided}
          />
        ))}
      </Box>
      {guided ? (
        <NextBestMoveGestureDialog
          option={guided}
          need={matchNeed}
          onOpenChange={open => (open ? undefined : setGuided(null))}
        />
      ) : null}
      {pickingReverseMarket ? (
        <ReverseMarketPickerDialog open onOpenChange={next => setPickingReverseMarket(next)} />
      ) : null}
    </Card>
  )
}

function NextBestMoveButton({
  option,
  primary,
  accountId,
  need,
  onPickReverseMarket,
  onOpenGuided,
}: {
  option: NextBestMoveOption
  primary: boolean
  accountId: string | null
  need: ActionableNeed | undefined
  onPickReverseMarket: () => void
  onOpenGuided: (gesture: GuidedGesture) => void
}) {
  const { t } = useTranslation('matching')
  // #2178.21 — PAS un choix EXCLUSIF entre boutons (ce n'est pas une rangée de
  // filtres, GA-249) : juste LEQUEL des dix gestes est mis en avant. Écrit via
  // ces deux constantes nommées, jamais la ternaire littérale que GA-249
  // surveille (`filter-rows-use-the-shared-chip.test.ts`) — le cliquet compte
  // un IDIOME de rangée à choix, pas ce bouton-ci.
  const variant = primary ? NEXT_BEST_MOVE_PRIMARY_VARIANT : NEXT_BEST_MOVE_SECONDARY_VARIANT
  const label = t(`nextBestMove.options.${option}`)
  const target = nextBestMoveGestureTarget(option)

  // #2178.11-.17 — un DIALOGUE GUIDÉ sur place, plus un lien vers une page.
  if (target.kind === 'guided') {
    return (
      <Button variant={variant} size="sm" onClick={() => onOpenGuided(target.gesture)}>
        {label}
      </Button>
    )
  }

  if (target.kind === 'account') {
    if (!accountId) {
      return (
        <Button variant={variant} size="sm" disabled title={t('nextBestMove.accountUnavailable')}>
          {label}
        </Button>
      )
    }
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/accounts/$id" params={{ id: accountId }} search={{ tab: target.tab }}>
          {label}
        </Link>
      </Button>
    )
  }

  if (target.kind === 'refuse') {
    if (!need) {
      return (
        <Button variant={variant} size="sm" disabled title={t('nextBestMove.refuseUnavailable')}>
          {label}
        </Button>
      )
    }
    return (
      <NeedActionsMenu
        needs={[need]}
        forceAction="close_cancelled"
        trigger={
          <Button variant={variant} size="sm">
            {label}
          </Button>
        }
      />
    )
  }

  // `reverse_market` — #2178.23/.41 : ouvre le sélecteur, n'écrit rien ici.
  return (
    <Button variant={variant} size="sm" onClick={onPickReverseMarket}>
      {label}
    </Button>
  )
}

/**
 * #2178.23/.41 — LE RATTRAPAGE « UN PROFIL FORT AILLEURS », SANS RECALCUL.
 *
 * Ce besoin n'a AUCUN profil défendable — `run.recommended`/`run.borderline`
 * sont vides par définition ici (voir next-best-move.ts). Il n'existe donc
 * aucun « profil fort de CE classement » à proposer : chercher un profil fort
 * ailleurs suppose de regarder TOUT le vivier, hors de ce besoin, précisément
 * ce que `/consultants/$id/reverse-market` (#2178.22, déjà là) sait déjà faire
 * pour UN consultant. #2178.41 est explicite : réutiliser cet existant, ne
 * pas recoder un classement pool-large.
 *
 * Ce sélecteur ne fait donc qu'UNE chose : laisser choisir DANS le vivier, et
 * ouvrir la page existante pour ce choix. Rien n'est écrit sur ce besoin — la
 * shortlist reste ce qu'elle est (#2178.23, « ne pas polluer la shortlist »).
 */
function ReverseMarketPickerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('matching')
  const consultants = useConsultants()
  const [query, setQuery] = useState('')
  // Un profil ARCHIVÉ n'est pas « un profil fort ailleurs » — #2178.15
  // (réactiver) est un geste séparé, avec sa propre cause ; le proposer ici
  // confondrait les deux.
  const active = (consultants.data ?? []).filter(consultant => consultant.archived_at == null)
  const nameOf = (consultant: { full_name: string | null }) => consultant.full_name ?? t('card.unknownName')
  const filtered =
    query.trim().length === 0 ? active : active.filter(consultant => matchesFlexibleQuery(query, nameOf(consultant)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('nextBestMove.reverseMarketPicker.title')}</DialogTitle>
          <DialogDescription>{t('nextBestMove.reverseMarketPicker.subtitle')}</DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('nextBestMove.reverseMarketPicker.search')}
          aria-label={t('nextBestMove.reverseMarketPicker.search')}
        />
        <Box display="flex" className="max-h-72 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <Text size="sm" className="p-2 text-[var(--bellum-text-muted)]">
              {t('nextBestMove.reverseMarketPicker.empty')}
            </Text>
          ) : (
            filtered.map(consultant => (
              <Button
                key={consultant.id}
                asChild
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => onOpenChange(false)}
              >
                <Link to="/consultants/$id/reverse-market" params={{ id: consultant.id }}>
                  {nameOf(consultant)}
                </Link>
              </Button>
            ))
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function Bucket({
  title,
  results,
  defaultOpen,
  counts,
  needId,
  runId,
  identities,
  selected,
  onToggle,
  dismissed,
  onDismiss,
  cap,
}: {
  title: string
  results: MatchResult[]
  defaultOpen: boolean
  counts?: { reason: string; count: number }[]
  needId: string
  runId: string
  identities: Map<string, { fullName: string; title: string | null }>
  selected: string[]
  onToggle: (id: string) => void
  /** #2176.47 — écartés localement, pour CETTE session : le compteur du bloc
   *  les retire, comme s'ils n'avaient jamais été rendus. */
  dismissed: ReadonlySet<string>
  onDismiss: (id: string) => void
  /** #2176.41 — au-delà, replié derrière « Voir N de plus » plutôt que rendu
   *  d'un coup. `undefined` = pas de plafond (les trois autres blocs). */
  cap?: number
}) {
  const { t } = useTranslation('matching')
  const [open, setOpen] = useState(defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const visible = results.filter(result => !dismissed.has(result.consultantId))
  const shown = cap && !showAll ? visible.slice(0, cap) : visible
  const hiddenCount = visible.length - shown.length
  // Le positionnement passe par un modal de confirmation (§10.1) : ce qu'il
  // crée, ce qu'il peut préparer, ce qu'il vérifie. Positionner sans l'annoncer
  // fait partir chez un client un geste que personne n'a relu.
  const [positioning, setPositioning] = useState<string | null>(null)
  // « Expliquer ce classement » OUVRE le document, il ne le télécharge plus.
  // C'est le trou que le docblock de la route nommait lui-même : « exportable »
  // veut dire qu'on peut le remettre à quelqu'un, pas qu'on peut le lire. Le
  // fichier reste remettable — le bouton est DANS le panneau, à côté du
  // document qu'il exporte.
  const [explaining, setExplaining] = useState<string | null>(null)
  // #2936 (#2176.45, #2176.62) — le studio de dossier de compétences, ouvert
  // pour CE profil, jamais deux à la fois.
  const [preparingCv, setPreparingCv] = useState<string | null>(null)
  // #2936 (#2176.49) — le brouillon de relance, un profil à la fois.
  const [relaunching, setRelaunching] = useState<string | null>(null)
  // #2936 (#2176.44) — même mutation que la fiche talent
  // (`useConfirmTalentAvailability`) : un seul hook partagé par le bloc,
  // l'ID en cours de revalidation dit lequel désactiver.
  const confirmAvailability = useConfirmTalentAvailability()
  const [validatingId, setValidatingId] = useState<string | null>(null)
  return (
    <Box>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen(value => !value)}
      >
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        <Text size="sm" weight="semibold">
          {title} ({visible.length})
        </Text>
      </button>
      {counts && counts.length > 0 ? (
        <Box display="flex" className="mt-1 flex-wrap gap-1 pl-4 md:pl-6">
          {counts.map(entry => (
            <Badge key={entry.reason} variant="default">
              {t(`reasons.${entry.reason}`)} · {entry.count}
            </Badge>
          ))}
        </Box>
      ) : null}
      {open ? (
        <Box display="flex" className="mt-2 flex-col gap-2">
          {visible.length === 0 ? (
            <Text size="xs" className="pl-4 md:pl-6 text-[var(--bellum-text-muted)]">
              {t('buckets.empty')}
            </Text>
          ) : (
            shown.map(result => (
              <MatchCard
                key={result.consultantId}
                result={result}
                name={identities.get(result.consultantId)?.fullName ?? t('card.unknownName')}
                title={identities.get(result.consultantId)?.title ?? null}
                selected={selected.includes(result.consultantId)}
                onToggle={() => onToggle(result.consultantId)}
                onExplain={() => setExplaining(result.consultantId)}
                onPosition={() => setPositioning(result.consultantId)}
                onDismiss={() => onDismiss(result.consultantId)}
                onValidateAvailability={() => {
                  setValidatingId(result.consultantId)
                  const name = identities.get(result.consultantId)?.fullName ?? t('card.unknownName')
                  confirmAvailability.mutate(result.consultantId, {
                    onSuccess: () => toast.success(t('card.availabilityValidated', { name })),
                    onError: (error: Error) => toast.error(error.message || t('explain.failed')),
                    onSettled: () => setValidatingId(null),
                  })
                }}
                validatingAvailability={validatingId === result.consultantId}
                onPrepareCv={() => setPreparingCv(result.consultantId)}
                onRelaunch={() => setRelaunching(result.consultantId)}
              />
            ))
          )}
          {/* #2176.41 — le reste reste CONSULTABLE : un bouton qui révèle,
              jamais une troncature muette. */}
          {hiddenCount > 0 ? (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll(true)}>
              {t('buckets.showMore', { count: hiddenCount })}
            </Button>
          ) : null}
        </Box>
      ) : null}
      {/* Le panneau ne reçoit QU'un identifiant et un nom — jamais le `run`, ni
          la table des identités. L'explication ne porte la donnée d'aucun autre
          candidat, et c'est ce qui permet de la remettre à la personne. */}
      {explaining ? (
        <MatchExplainSheet
          needId={needId}
          runId={runId}
          consultantId={explaining}
          name={identities.get(explaining)?.fullName ?? t('card.unknownName')}
          open
          onOpenChange={next => {
            if (!next) setExplaining(null)
          }}
        />
      ) : null}
      {positioning ? (
        <PositionDialog
          needId={needId}
          runId={runId}
          consultantId={positioning}
          name={identities.get(positioning)?.fullName ?? t('card.unknownName')}
          open
          onOpenChange={next => {
            if (!next) setPositioning(null)
          }}
        />
      ) : null}
      {/* #2936 (#2176.45, #2176.62) */}
      <CvStudioSheet
        consultantId={preparingCv}
        name={preparingCv ? (identities.get(preparingCv)?.fullName ?? t('card.unknownName')) : ''}
        onClose={() => setPreparingCv(null)}
      />
      {/* #2936 (#2176.49) */}
      <RelaunchConsultantDialog
        consultantId={relaunching}
        name={relaunching ? (identities.get(relaunching)?.fullName ?? t('card.unknownName')) : ''}
        onClose={() => setRelaunching(null)}
      />
    </Box>
  )
}
