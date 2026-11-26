import type {
  MeetingCascade as Cascade,
  MeetingCascadeCard,
  MeetingEvidence,
  MeetingInternalOutputKind,
} from '@bellum/contracts'
import { Badge, Box, Button, Input, MOTION, SelectField, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BAND_BADGE_VARIANT, cardTitleKey, countKey, sourceKey, STATE_TEXT_CLASS } from '../cascade-display'
import { pipelineOf, stageTargetState, type StageTargetInput } from '../stage-target'

/**
 * La cascade d'après rendez-vous : neuf sorties, leurs sources, et ce que la
 * validation écrira.
 *
 * Deux choses portent tout l'écran, et elles se voient à l'œil nu :
 *
 * 1. **Chaque carte dit d'où elle vient.** L'extrait est sous le titre, pas
 *    derrière un « voir les détails ». Sans lui, neuf cartes bien alignées sont
 *    indiscernables d'une hallucination bien présentée.
 * 2. **Les cartes A3 sont à part.** Elles visent l'extérieur, elles ne se
 *    valident pas en lot, et le panneau du bas l'écrit noir sur blanc plutôt
 *    que de compter sur la couleur d'une puce.
 */
export function MeetingCascade({
  cascade,
  contactName,
  fromTranscript,
  drafts,
  onApprove,
  approving,
  outcomes,
  stageTarget,
  onDepositEmailDraft,
  isInternalMeeting = false,
}: {
  cascade: Cascade
  /** Le nom lu dans le titre, quand on le connaît. Jamais deviné. */
  contactName?: string
  fromTranscript: boolean
  /**
   * Le texte des deux brouillons qui visent l'extérieur.
   *
   * Ils sont passés pour être COPIÉS ou déposés en brouillon, jamais envoyés :
   * ni cet écran ni `onDepositEmailDraft` n'ont de chemin vers un ENVOI — c'est
   * l'absence de ce chemin qui tient la promesse, pas une case à ne pas cocher.
   */
  drafts?: Partial<Record<'follow_up_email' | 'reminder', string>>
  onApprove: (kinds: MeetingInternalOutputKind[]) => void
  approving: boolean
  /**
   * #2103.18 — déposer le mail de suivi comme un VRAI brouillon dans la
   * messagerie connectée (`mailboxApi.createDraft`, « UN BROUILLON, AUCUN
   * ENVOI »). Absent quand aucune messagerie n'est connectée : la carte ne
   * propose alors que la copie, jamais un bouton qui échouerait au clic.
   */
  onDepositEmailDraft?: (params: { to: string; body: string }) => Promise<{ webUrl: string | null }>
  outcomes?: Array<{ kind: MeetingInternalOutputKind; outcome: string; missing: string | null; detail: string | null }>
  /**
   * #1934.18 — QUELLE affaire le stade proposé déplace.
   *
   * Le compte rendu propose un LIBELLÉ de stade ; il ne sait pas quelle affaire
   * du CRM il désigne. Deviner déplacerait la mauvaise, et côté client ça ne se
   * répare pas — donc la carte demande, et sans réponse elle ne valide rien.
   */
  stageTarget?: StageTarget
  /**
   * #2103.31 — CAS LIMITE, RDV INTERNE : lu sur les invités
   * (`deriveMeetingType`, `meeting-brief.ts`), jamais choisi. Un rendez-vous
   * sans invité externe ne propose aucune sortie qui vise l'extérieur —
   * `reachesOutside` (déjà porté par chaque carte) est la seule source, jamais
   * une seconde liste de kinds recopiée ici. `false` = comportement inchangé
   * (`TabPlan.tsx` n'a aucun rendez-vous à qualifier).
   */
  isInternalMeeting?: boolean
}) {
  const { t } = useTranslation('meetings')
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set())

  const visibleCards = isInternalMeeting ? cascade.cards.filter(card => !card.reachesOutside) : cascade.cards
  const kept = visibleCards.filter(card => !ignored.has(card.kind))
  const internalKept = kept.filter(card => !card.reachesOutside)

  if (visibleCards.length === 0) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('cascade.empty')}
      </Text>
    )
  }

  const toggleIgnored = (kind: string) =>
    setIgnored(previous => {
      const next = new Set(previous)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  return (
    <motion.section {...MOTION.reveal} className="space-y-4" aria-label={t('cascade.title')}>
      <Box className="space-y-1">
        <Text element="h2" size="xl" weight="semibold">
          {contactName ? t('cascade.titleWithName', { name: contactName }) : t('cascade.title')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('cascade.subtitle', { count: visibleCards.length })} ·{' '}
          {fromTranscript ? t('cascade.sourcedFromTranscript') : t('cascade.sourcedFromNotes')}
        </Text>
        {cascade.summary.droppedWithoutEvidence > 0 ? (
          // Ce qui a été écarté est DIT. Une cascade qui perd trois actions en
          // silence donne la même impression qu'une réunion qui n'en portait
          // que six.
          <Text size="xs" className="text-[var(--warning-soft-text)]">
            {t('cascade.dropped', { count: cascade.summary.droppedWithoutEvidence })}
          </Text>
        ) : null}
      </Box>

      <Box className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map(card => (
          <CascadeCard
            key={card.kind}
            card={card}
            ignored={ignored.has(card.kind)}
            onToggleIgnored={() => toggleIgnored(card.kind)}
            onValidate={() => onApprove([card.kind as MeetingInternalOutputKind])}
            approving={approving}
            {...(card.kind === 'follow_up_email' || card.kind === 'reminder' ? { draft: drafts?.[card.kind] } : {})}
            {...(card.kind === 'follow_up_email' && onDepositEmailDraft ? { onDepositEmailDraft } : {})}
            {...(card.kind === 'crm_stage' && stageTarget ? { stageTarget } : {})}
            outcome={outcomes?.find(entry => entry.kind === (card.kind as MeetingInternalOutputKind))}
          />
        ))}
      </Box>

      <BeforeValidation
        cascade={cascade}
        internalKept={internalKept}
        onApprove={() => onApprove(internalKept.map(card => card.kind as MeetingInternalOutputKind))}
        approving={approving}
      />
    </motion.section>
  )
}

/**
 * #1934.18 — l'affaire ET le stade que la proposition viserait.
 *
 * Les deux se CHOISISSENT dans la liste réelle du CRM : `dealstage` attend un
 * identifiant interne, et le stade proposé par le modèle n'est qu'un libellé.
 * Il sert au plus de présélection (`exactStageMatch`), jamais de valeur envoyée.
 */
type StageTarget = StageTargetInput & {
  /** Le libellé proposé par le compte rendu — affiché, jamais envoyé. */
  proposedStage: string | null
  onSelectDeal: (dealId: string) => void
  onSelectStage: (stageId: string) => void
}

function CascadeCard({
  card,
  ignored,
  onToggleIgnored,
  onValidate,
  approving,
  draft,
  outcome,
  stageTarget,
  onDepositEmailDraft,
}: {
  card: MeetingCascadeCard
  ignored: boolean
  onToggleIgnored: () => void
  onValidate: () => void
  approving: boolean
  /** Le texte du brouillon, pour les seules cartes qui visent l'extérieur. */
  draft?: string
  outcome?: { outcome: string; missing: string | null; detail: string | null }
  /** Posée sur la SEULE carte `crm_stage`. */
  stageTarget?: StageTarget
  /** #2103.18 — posée sur la SEULE carte `follow_up_email`. */
  onDepositEmailDraft?: (params: { to: string; body: string }) => Promise<{ webUrl: string | null }>
}) {
  const { t } = useTranslation('meetings')
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [first, ...others] = card.evidence

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <Box
      className={`flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] p-4 ${
        ignored ? 'opacity-50' : ''
      }`}
    >
      <Box className="flex items-start justify-between gap-2">
        <Box className="flex min-w-0 items-start gap-2">
          <Badge variant="outline" aria-hidden="true">
            {card.position}
          </Badge>
          <Text size="sm" weight="medium" className="min-w-0">
            {t(cardTitleKey(card), { count: card.itemCount })}
          </Text>
        </Box>
        {/* La puce d'autonomie. Son titre EXPLIQUE la bande : « A3 » seul ne dit
            rien à qui ouvre l'écran pour la première fois. */}
        <Badge variant={BAND_BADGE_VARIANT[card.band]} title={t(`bands.${card.band}Help`)}>
          {t(`bands.${card.band}`)}
        </Badge>
      </Box>

      <Text size="xs" weight="medium" className={STATE_TEXT_CLASS[card.state]}>
        {t(`states.${card.state}`)}
      </Text>

      {first ? <EvidenceLine evidence={first} /> : null}

      {others.length > 0 ? (
        <Box className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 justify-start px-0"
            aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? t('cascade.hideExcerpts') : t('cascade.moreExcerpts', { count: others.length })}
          </Button>
          {expanded ? (
            <Box className="space-y-1">
              {others.map((evidence, index) => (
                <EvidenceLine key={`${card.kind}-${index}`} evidence={evidence} />
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}

      {stageTarget ? <StagePicker target={stageTarget} /> : null}

      {outcome ? (
        <Text
          size="xs"
          className={outcome.outcome === 'done' ? 'text-[var(--success-soft-text)]' : 'text-[var(--warning-soft-text)]'}
        >
          {outcome.missing
            ? t('outcomes.blockedMissing', { capability: t(`outcomes.capability.${outcome.missing}`) })
            : t(`outcomes.${outcome.outcome}`)}
          {outcome.detail ? ` ${outcome.detail}` : ''}
        </Text>
      ) : null}

      <Box className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        {/* ⚠️ Une carte A3 ne propose PAS « Valider », et ce n'est pas un
            oubli : rien ne part d'ici. Le seul geste possible est de COPIER le
            brouillon — le commercial le colle dans sa messagerie et l'envoie
            lui-même. Retirer le MOYEN, pas la permission. */}
        {card.reachesOutside ? (
          draft ? (
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => void copy(draft)}>
              {copied ? t('actions.copied') : t('actions.copyDraft')}
            </Button>
          ) : null
        ) : null}
        {/* #2103.18 — le SEUL geste qui dépose vraiment le mail de suivi. La
            copie reste possible à côté : sans messagerie connectée, ce bouton
            n'existe pas plutôt que d'échouer au clic. */}
        {card.kind === 'follow_up_email' && draft && onDepositEmailDraft ? (
          <MailDraftDeposit body={draft} onDeposit={onDepositEmailDraft} />
        ) : null}
        {!card.reachesOutside ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            // #1934.18 — sans affaire ET stade RÉELS choisis, la validation ne
            // peut pas dire ce qu'elle déplace, ni vers quoi : le bouton reste
            // fermé, et la carte écrit pourquoi.
            disabled={ignored || approving || (stageTarget ? !stageTargetState(stageTarget).ready : false)}
            onClick={() => onValidate()}
          >
            {t('actions.validate')}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="min-h-11" onClick={onToggleIgnored}>
          {t('actions.ignore')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * #2103.18 — LE MAIL DE SUIVI SE DÉPOSE EN BROUILLON, IL NE SE COPIE PLUS SEUL.
 *
 * `onDeposit` appelle `mailboxApi.createDraft` derrière un « UN BROUILLON,
 * AUCUN ENVOI » : rien ne part tant que le commercial n'a pas lui-même ouvert
 * sa messagerie et cliqué « Envoyer ». Le destinataire est TAPÉ ici, jamais
 * deviné — une adresse inventée serait la donnée fictive que la doctrine
 * interdit.
 */
function MailDraftDeposit({
  body,
  onDeposit,
}: {
  body: string
  onDeposit: (params: { to: string; body: string }) => Promise<{ webUrl: string | null }>
}) {
  const { t } = useTranslation('meetings')
  const [to, setTo] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ webUrl: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Volontairement simple, même règle que `parseGuestList` : c'est le
  // fournisseur qui tranche en dernier ressort, une validation plus fine
  // rejetterait des adresses légitimes.
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())

  if (result) {
    return (
      <Box className="flex flex-col gap-1">
        <Text size="xs" className="text-[var(--success-soft-text)]">
          {t('cascade.depositDraft.done')}
        </Text>
        {result.webUrl ? (
          <a
            href={result.webUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--bellum-text-secondary)] underline"
          >
            {t('cascade.depositDraft.openLink')}
          </a>
        ) : null}
      </Box>
    )
  }

  const deposit = async () => {
    setPending(true)
    setError(null)
    try {
      setResult(await onDeposit({ to: to.trim(), body }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <Box className="flex flex-col gap-1">
      <Input
        type="email"
        value={to}
        onChange={event => setTo(event.target.value)}
        placeholder={t('cascade.depositDraft.placeholder')}
        aria-label={t('cascade.depositDraft.label')}
      />
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={!validEmail || pending}
        onClick={() => void deposit()}
      >
        {pending ? t('actions.depositingDraft') : t('actions.depositDraft')}
      </Button>
      {error ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * #1934.18 — LE CHOIX DE L'AFFAIRE ET DU STADE, ou la raison pour laquelle il
 * n'y en a pas.
 *
 * Chaque blocage a SA phrase — jamais un menu vide pour plusieurs situations :
 * aucun CRM, aucune affaire ouverte, stades illisibles, pipeline de l'affaire
 * introuvable. Le stade actuel d'une affaire s'affiche par son LIBELLÉ quand le
 * pipeline est lu, et « stade actuel non lu » sinon — jamais son identifiant
 * brut, qui ne dit rien à personne.
 */
function StagePicker({ target }: { target: StageTarget }) {
  const { t } = useTranslation('meetings')
  const helpId = useId()
  const state = stageTargetState(target)

  if (!state.ready && (state.block === 'noCrm' || state.block === 'noDeals' || state.block === 'unreadable')) {
    return (
      <Text size="xs" className="text-[var(--warning-soft-text)]">
        {state.block === 'unreadable'
          ? t(
              `cascade.stage.unreadable.${state.unreadableReason === 'scope_missing' ? 'scope' : state.unreadableReason === 'empty' ? 'empty' : 'other'}`,
            )
          : t(`cascade.stage.${state.block}`)}
      </Text>
    )
  }
  if (!state.ready && state.block === 'loading') {
    return (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('cascade.stage.loading')}
      </Text>
    )
  }

  const currentLabel = (deal: StageTarget['deals'][number]): string => {
    const known = pipelineOf(deal, target.pipelines)?.stages.find(stage => stage.id === deal.stage)
    return known ? t('cascade.stage.currentStage', { stage: known.label }) : t('cascade.stage.unknownStage')
  }
  const pipeline = state.pipeline
  const dealChosen = state.ready || state.block === 'pickStage' || state.block === 'dealPipelineUnknown'
  const noExactMatch =
    pipeline && target.proposedStage && !pipeline.stages.some(stage => stage.label === target.proposedStage)

  return (
    <Box className="space-y-1">
      <SelectField
        size="sm"
        ariaLabel={t('cascade.stage.pickDeal')}
        ariaDescribedBy={helpId}
        placeholder={t('cascade.stage.placeholder')}
        value={target.selectedDealId}
        onChange={target.onSelectDeal}
        options={target.deals.map(deal => ({
          value: deal.id,
          label: `${deal.name ?? deal.id} · ${currentLabel(deal)}`,
        }))}
      />
      {dealChosen && !pipeline ? (
        <Text size="xs" className="text-[var(--warning-soft-text)]">
          {t('cascade.stage.dealPipelineUnknown')}
        </Text>
      ) : null}
      {pipeline ? (
        <SelectField
          size="sm"
          ariaLabel={t('cascade.stage.pickStage', { pipeline: pipeline.label })}
          ariaDescribedBy={helpId}
          placeholder={t('cascade.stage.stagePlaceholder')}
          value={target.selectedStageId}
          onChange={target.onSelectStage}
          options={pipeline.stages.map(stage => ({ value: stage.id, label: stage.label }))}
        />
      ) : null}
      {noExactMatch ? (
        <Text size="xs" className="text-[var(--warning-soft-text)]">
          {t('cascade.stage.noExactMatch', { stage: target.proposedStage })}
        </Text>
      ) : null}
      <Text id={helpId} size="xs" color="text-[var(--bellum-text-secondary)]">
        {pipeline ? `${t('cascade.stage.pipeline', { pipeline: pipeline.label })} · ` : ''}
        {t('cascade.stage.pending')}
      </Text>
    </Box>
  )
}

/**
 * L'extrait, ou le fait qu'il n'y en ait pas.
 *
 * Une phrase citée est mise entre guillemets ; des notes prises à la main le
 * DISENT, plutôt que d'afficher la note du commercial comme si le client
 * l'avait prononcée.
 */
function EvidenceLine({ evidence }: { evidence: MeetingEvidence }) {
  const { t } = useTranslation('meetings')
  if (evidence.kind === 'notes-derived') {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('cascade.notesDerived')}
      </Text>
    )
  }
  // #2319.63 — la déclaration de l'utilisateur se DIT comme telle : ce n'est ni
  // une phrase du client, ni une note de la réunion.
  if (evidence.kind === 'user-statement') {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('cascade.userStatement')}
      </Text>
    )
  }
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]">
      {t('cascade.excerptLabel')} : « {evidence.excerpt} »
    </Text>
  )
}

/**
 * Le récapitulatif d'avant validation.
 *
 * Il énumère ce que le bouton va écrire, et il NOMME séparément ce qu'il
 * n'emportera pas. Cette séparation-là est la promesse du produit : « aucune
 * action externe envoyée » ne se tient pas dans une couleur de puce.
 */
function BeforeValidation({
  cascade,
  internalKept,
  onApprove,
  approving,
}: {
  cascade: Cascade
  internalKept: readonly MeetingCascadeCard[]
  onApprove: () => void
  approving: boolean
}) {
  const { t } = useTranslation('meetings')
  const credits = cascade.summary.estimatedCredits

  const internalList = cascade.summary.internalWrites
    .map(write => t(countKey(write.kind), { count: write.count }))
    .join(', ')
  const externalList = cascade.summary.externalDrafts.map(kind => t(`outputs.${kind}`, { count: 1 })).join(', ')
  const sources = cascade.summary.sources
    .map(source => `${t(sourceKey(source))}${source.detail ? ` ${source.detail}` : ''}`)
    .join(' + ')

  return (
    <Box className="space-y-3 rounded-xl bg-[var(--bellum-surface-2)] p-4">
      <Text size="sm" weight="medium">
        {t('panel.title')}
      </Text>

      <Text size="xs">
        {internalList ? t('panel.internalWrites', { list: internalList }) : t('panel.noInternalWrites')}
      </Text>

      <Text size="xs" className={externalList ? 'text-[var(--warning-soft-text)]' : undefined}>
        {externalList
          ? t('panel.externalDrafts', { list: externalList, count: cascade.summary.externalDrafts.length })
          : t('panel.noExternalDrafts')}
      </Text>

      {sources ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('panel.sources', { list: sources })}
        </Text>
      ) : null}

      <Box className="space-y-2">
        <Button disabled={internalKept.length === 0 || approving} onClick={onApprove} className="min-h-11">
          {t('panel.validateInternal', { count: internalKept.length })}
        </Button>
        {cascade.summary.externalDrafts.length > 0 ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('panel.externalNeverBatched')}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}
