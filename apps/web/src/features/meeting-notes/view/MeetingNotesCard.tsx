import {
  meetingRecapApprovalInput,
  type MeetingCascade as Cascade,
  type MeetingExtractedItem,
  type MeetingInternalOutputKind,
  type MeetingNotesInputKind,
  type MeetingRecap,
} from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, Input, Text, Textarea } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CrmDealPipelines } from '@/features/crm/api'
import { useCrmDealPipelines } from '@/features/crm/hooks/useCrmDealPipelines'
import { useCrmPresence } from '@/features/crm/hooks/useCrmPresence'
import { useCreateDraft, useMailboxStatus } from '@/features/mailbox/api'
import { useApproveInternal, useMeetingCascade, type MeetingApprovalOutcome } from '@/features/meetings/api'
import { exactStageMatch, pipelineOf, stageTargetState } from '@/features/meetings/stage-target'
import { MeetingCascade } from '@/features/meetings/view/MeetingCascade'
import {
  trackActionsCreated,
  trackFollowupCreated,
  trackMeetingCompleted,
  trackNotesAdded,
  trackSummaryApproved,
  trackSummaryGenerated,
} from '@/lib/product-tracker'
import {
  readFileAsBase64,
  useCreateNoteTasks,
  useExtractMeetingDocument,
  useTranscribe,
  useTranscriptionStatus,
} from '../api'

/** #2985 — la carte vit le plus souvent dans le dossier de compte
 *  (`TabPlan.tsx`) ; `MeetingLiveView.tsx` (mode live de `/briefing/`) impose
 *  son propre écran via la prop `screen`. */
const MEETING_NOTES_DEFAULT_SCREEN = '/accounts/$id'

/**
 * Le compte rendu de rendez-vous (§5.3, §7.2).
 *
 * Trois gestes séparés plutôt qu'une chaîne automatique : on dépose ou on colle,
 * on structure, puis on CHOISIT les actions à poser dans le CRM. Une chaîne qui
 * s'exécute d'un bloc ne laisse aucune place au « non, cette action n'est pas
 * pour moi » — et les actions d'un compte rendu circulent.
 *
 * Le dépôt d'un enregistrement n'apparaît que si le serveur sait transcrire. Un
 * bouton qui échoue au clic est pire qu'un bouton absent.
 */
export function MeetingNotesCard({
  accountId,
  companyName,
  website,
  siren,
  eventId,
  isInternalMeeting,
  screen = MEETING_NOTES_DEFAULT_SCREEN,
}: {
  accountId: string
  /**
   * #1934.18 — l'ancre de la lecture CRM : le stade proposé doit désigner une
   * AFFAIRE, et une affaire se trouve par le nom de la société. Absent ⇒ aucune
   * lecture (`useCrmPresence` reste désactivé), et la carte le dit.
   */
  companyName?: string | null
  website?: string | null
  siren?: string | null
  /** #2103.37 — le rendez-vous source, quand cette carte en vient un. */
  eventId?: string
  /**
   * #2103.31 — relayé TEL QUEL jusqu'à `MeetingCascade` (lu sur les invités
   * par l'appelant, `deriveMeetingType`) ; absent (`TabPlan.tsx`, note sans
   * rendez-vous) = comportement inchangé.
   */
  isInternalMeeting?: boolean
  /** #2985 — le MOTIF de route de l'appelant, pour l'analytique produit ;
   *  défaut = l'hôte le plus courant (`TabPlan.tsx`). */
  screen?: string
}) {
  const { t } = useTranslation('accounts')
  const { data: status } = useTranscriptionStatus()
  const transcribe = useTranscribe()
  const extractDocument = useExtractMeetingDocument()
  const structure = useMeetingCascade()
  const approve = useApproveInternal()
  const createTasks = useCreateNoteTasks()
  // #2103.18 — le mail de suivi se DÉPOSE en brouillon dans la VRAIE
  // messagerie connectée, jamais par un chemin d'envoi : `createDraft` va
  // vers `mailboxApi.createDraft` (« UN BROUILLON, AUCUN ENVOI »).
  const { data: mailboxStatus } = useMailboxStatus()
  const createDraft = useCreateDraft()

  const [notes, setNotes] = useState('')
  const [recap, setRecap] = useState<MeetingRecap | null>(null)
  const [cascade, setCascade] = useState<Cascade | null>(null)
  // Le texte vient-il d'une transcription ? C'est la seule information qui
  // décide si un extrait CITABLE existe — donc elle suit le texte jusqu'au
  // prompt, et elle n'est vraie que si l'utilisateur a réellement déposé un
  // enregistrement.
  const [fromTranscript, setFromTranscript] = useState(false)
  // #2103.4 / #2542.3 — un document joint lu PARTIELLEMENT (page sans calque
  // texte, scan glissé dans un dossier autrement numérique) se DIT : « non
  // mesuré n'est jamais 0 » (GA-18/GA-19), jamais présenté comme une lecture
  // complète.
  const [documentPartial, setDocumentPartial] = useState(false)
  const [outcomes, setOutcomes] = useState<MeetingApprovalOutcome[] | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  /**
   * #2319.93 — accepter/modifier/refuser CHAQUE personne citée, pas la carte
   * en bloc. Réinitialisé à chaque nouveau compte rendu, TOUTES retenues par
   * défaut : cocher pour l'utilisateur reviendrait à décider à sa place, mais
   * ne rien cocher du tout romprait le comportement déjà en production (valider
   * la carte envoyait déjà la liste entière).
   */
  const [mentionedEdits, setMentionedEdits] = useState<Array<{ fullName: string; role: string; included: boolean }>>([])
  const [error, setError] = useState<string | null>(null)
  /** #1934.18 — l'affaire et l'IDENTIFIANT de stade retenus. Vides = rien
   *  n'est proposable : le bouton de la carte reste fermé. */
  const [stageDealId, setStageDealId] = useState('')
  const [stageId, setStageId] = useState('')
  /**
   * #2319.61-.62 — la NATURE du texte collé. Un e-mail est COLLÉ par
   * l'utilisateur : la boîte n'est jamais lue pour le trouver (D58, D65).
   */
  const [pastedKind, setPastedKind] = useState<Exclude<MeetingNotesInputKind, 'transcript'>>('notes')
  /** #2319.63 — la déclaration de l'utilisateur, gardée À PART des notes. */
  const [statement, setStatement] = useState('')
  /**
   * #2319.57 — l'accord EXPLICITE des participants. Sans lui, le dépôt d'un
   * enregistrement reste fermé, et l'API le refuse de toute façon.
   */
  const [recordingConsent, setRecordingConsent] = useState(false)

  // Mêmes paramètres que le bandeau de présence du hero : react-query partage
  // le cache, donc aucun appel réseau de plus sur la page.
  const { data: crmPresence } = useCrmPresence({ companyName, website, siren })
  const crmConnected = Boolean(crmPresence?.provider)
  // Les stades RÉELS, lus seulement quand un CRM a répondu ET qu'un stade est
  // proposé : sans l'un ou l'autre, la question ne se pose pas.
  const pipelinesQuery = useCrmDealPipelines(crmConnected && Boolean(recap?.crmStage))
  // Une lecture en ÉCHEC (réseau, permission) n'est pas « en cours » : sans ce
  // repli, la carte attendrait pour toujours au lieu de dire qu'elle ne peut rien.
  const dealPipelines: CrmDealPipelines | undefined = pipelinesQuery.isError
    ? { status: 'unreadable', reason: 'request_failed', pipelines: [] }
    : pipelinesQuery.data
  const stageInput = {
    crmConnected,
    deals: crmPresence?.openDeals ?? [],
    pipelines: dealPipelines,
    selectedDealId: stageDealId,
    selectedStageId: stageId,
  }
  const onSelectDeal = (dealId: string) => {
    setStageDealId(dealId)
    // Changer d'affaire change de pipeline : le stade repart de la seule
    // présélection admise — une égalité EXACTE de libellé — ou de rien.
    const deal = stageInput.deals.find(candidate => candidate.id === dealId)
    setStageId(exactStageMatch(pipelineOf(deal, dealPipelines), recap?.crmStage?.proposedStage))
  }

  const onFile = async (file: File | undefined) => {
    // #2319.57 — deux portes : le champ est fermé sans accord, et ce retour
    // tient même si un navigateur laissait passer l'évènement.
    if (!file || !recordingConsent) return
    setError(null)
    try {
      const audioB64 = await readFileAsBase64(file)
      const result = await transcribe.mutateAsync({
        audioB64,
        filename: file.name,
        language: 'fr',
        recordingConsent: true,
      })
      // La transcription REMPLACE la zone de texte plutôt que de partir
      // directement en compte rendu : l'utilisateur doit pouvoir corriger un
      // nom mal entendu avant que ça n'entre dans un document.
      setNotes(previous => (previous.trim() ? `${previous}\n\n${result.text}` : result.text))
      setFromTranscript(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /**
   * #2103.4 — un document joint (PDF/Word), lu et ajouté à la zone de texte —
   * pas une transcription : `fromTranscript` reste `false`, et la nature du
   * texte passe sur « un compte rendu importé » (`pastedKind`), la seule
   * entrée déjà nommée pour ça. Aucun accord d'enregistrement à cocher : ce
   * n'est pas un enregistrement, et l'extraction ne coûte rien (pas de clé,
   * pas d'appel payant, cf. `extractDocument` côté API).
   */
  const onDocumentFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const fileB64 = await readFileAsBase64(file)
      const result = await extractDocument.mutateAsync({ fileB64, filename: file.name })
      setNotes(previous => (previous.trim() ? `${previous}\n\n${result.text}` : result.text))
      setPastedKind('imported_report')
      setDocumentPartial(result.partial)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const onStructure = async () => {
    setError(null)
    setRecap(null)
    setCascade(null)
    setOutcomes(null)
    // #2985 — le bouton reste fermé sur un champ vide (`!notes.trim()`) : cet
    // appel porte donc toujours une soumission réelle.
    trackNotesAdded(screen)
    try {
      const result = await structure.mutateAsync({
        notes,
        accountId,
        fromTranscript,
        inputKind: fromTranscript ? 'transcript' : pastedKind,
        ...(statement.trim() ? { userStatement: statement.trim() } : {}),
        // #2103.37 — rattache le compte rendu à SON rendez-vous, quand il vient
        // d'un rendez-vous précis (jamais deviné : absent en dehors du live).
        ...(eventId ? { sourceEventId: eventId } : {}),
      })
      setRecap(result.recap)
      setCascade(result.cascade)
      // #2985 — « non mesuré n'est jamais 0 » : un résumé vide n'émet rien.
      if (result.recap.summary.trim()) trackSummaryGenerated(screen)
      // Rien n'est coché par défaut : cocher pour l'utilisateur revient à
      // décider à sa place.
      setChosen(new Set())
      // #2319.93 — chaque personne citée repart RETENUE (même comportement
      // qu'avant ce chantier) mais individuellement refusable ou modifiable.
      setMentionedEdits(
        result.recap.mentionedContacts.map(contact => ({
          fullName: contact.fullName,
          role: contact.role,
          included: true,
        })),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /**
   * Valide les écritures INTERNES retenues.
   *
   * Les actions du compte rendu partent avec le lot quand `next_steps` en fait
   * partie : c'est le seul chemin d'écriture réellement branché aujourd'hui, et
   * les autres sorties disent ce qui leur manque plutôt que de répondre « fait ».
   */
  const onApprove = async (kinds: MeetingInternalOutputKind[]) => {
    if (!recap) return
    setError(null)
    const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const tasks = recap.nextSteps.map(step => ({
      subject: step.action,
      body: [step.owner, step.due].filter(Boolean).join(' · '),
      dueAt,
    }))
    // #1934.18 — le stade ne part qu'avec SON affaire et l'IDENTIFIANT d'un stade
    // réel de son pipeline — la même dérivation que celle qui ouvre le bouton.
    // Sinon `crmStage` est absent et l'API répond `skipped`. Le libellé du
    // modèle ne voyage jamais : l'API relit tout le reste sur le CRM.
    const target = stageTargetState(stageInput)
    const crmStage =
      recap.crmStage && target.ready
        ? {
            dealId: target.deal.id,
            stageId: target.stage.id,
            ...(recap.crmStage.rationale ? { rationale: recap.crmStage.rationale } : {}),
          }
        : null
    // #1903.12 — le compte rendu ne part QUE quand `recap` fait partie du lot,
    // avec le compte déjà ouvert sur cet écran (jamais deviné côté API).
    // #3758 — même dérivation que `NoteCascadeProposal` (GA-26, à un seul
    // endroit) : `body` ET l'instantané structuré que relira la carte
    // `post_meeting_summary` de Laura.
    const recapInput = meetingRecapApprovalInput(recap, accountId)
    // #2777 — les personnes citées ne partent QUE quand `contacts` fait partie
    // du lot, avec le même compte déjà ouvert (jamais deviné côté API).
    // #2319.93 — SEULES les personnes encore retenues partent, avec le nom et
    // le rôle éventuellement CORRIGÉS avant validation : une case décochée
    // refuse cette personne sans toucher aux autres.
    const mentioned = mentionedEdits
      .filter(edit => edit.included)
      .map(edit => ({ fullName: edit.fullName.trim(), role: edit.role.trim() }))
      .filter(edit => edit.fullName.length > 0)
      .map(edit => ({ fullName: edit.fullName, ...(edit.role ? { role: edit.role } : {}) }))
    // #2777 — l'opportunité candidate ne part QUE quand `opportunity` fait
    // partie du lot, avec le même compte déjà ouvert (jamais deviné par l'API).
    const opportunityInput = recap.opportunity ? { accountId, title: recap.opportunity.title } : null
    // #2777 — le besoin exprimé ne part QUE quand `need` fait partie du lot,
    // avec le même compte — jamais de projet deviné (#2558.1).
    const needInput = recap.need
      ? { accountId, title: recap.need.title, ...(recap.need.detail ? { detail: recap.need.detail } : {}) }
      : null
    // #2777 — les apprentissages ne partent QUE quand `learnings` fait partie
    // du lot, avec le même compte — bande `n4_bounded_auto`, aucune file de
    // validation.
    const learningEntries = recap.learnings.map(learning => ({ kind: learning.kind, content: learning.content }))
    try {
      const result = await approve.mutateAsync({
        kinds,
        ...(tasks.length > 0 ? { tasks } : {}),
        ...(crmStage ? { crmStage } : {}),
        ...(kinds.includes('recap') && recapInput.body ? { recap: recapInput } : {}),
        ...(kinds.includes('contacts') && mentioned.length > 0 ? { contacts: { accountId, mentioned } } : {}),
        ...(kinds.includes('opportunity') && opportunityInput ? { opportunity: opportunityInput } : {}),
        ...(kinds.includes('need') && needInput ? { need: needInput } : {}),
        ...(kinds.includes('learnings') && learningEntries.length > 0
          ? { learnings: { accountId, entries: learningEntries } }
          : {}),
      })
      setOutcomes(result.outcomes)
      // #2985 — approuvé au sens du traceur = ÉCRIT : jamais sur `blocked`,
      // `skipped`, `failed` ni `proposed` (une proposition CRM n'est pas une
      // confirmation).
      if (result.outcomes.some(item => item.kind === 'recap' && item.outcome === 'done')) {
        trackSummaryApproved(screen)
        // #2319.123 — tranché sans Louis (29/09/2026) : même geste, deux
        // mesures — voir la décision dans `product-tracker.ts`.
        trackMeetingCompleted(screen)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const onCreateTasks = async () => {
    if (!recap) return
    setError(null)
    const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const tasks = [...chosen]
      .map(index => recap.nextSteps[index])
      .filter((step): step is MeetingRecap['nextSteps'][number] => Boolean(step))
      .map(step => ({
        subject: step.action,
        body: [step.owner, step.due].filter(Boolean).join(' · '),
        dueAt,
      }))
    if (tasks.length === 0) return
    try {
      const result = await createTasks.mutateAsync({ tasks })
      if (result.failed.length > 0) {
        setError(result.failed.map(f => `${f.subject} : ${f.reason}`).join(' — '))
      } else {
        setChosen(new Set())
        // #2985 — SANS échec seulement : un lot partiel ne se dit pas « créé ».
        trackActionsCreated(screen)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const toggle = (index: number) =>
    setChosen(previous => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  /** #2319.93 — REFUSER une seule personne citée, sans toucher aux autres. */
  const toggleMentioned = (index: number) =>
    setMentionedEdits(previous =>
      previous.map((edit, i) => (i === index ? { ...edit, included: !edit.included } : edit)),
    )
  /** #2319.93 — MODIFIER le nom ou le rôle d'une seule personne citée avant validation. */
  const editMentioned = (index: number, field: 'fullName' | 'role', value: string) =>
    setMentionedEdits(previous => previous.map((edit, i) => (i === index ? { ...edit, [field]: value } : edit)))

  // #2103.18 — absent tant qu'aucune messagerie ne sait créer de brouillon :
  // un bouton qui échouerait au clic est pire qu'un bouton absent.
  const canDepositEmailDraft = Boolean(mailboxStatus?.connected && mailboxStatus.capabilities.draft)
  const onDepositEmailDraft = canDepositEmailDraft
    ? async ({ to, body }: { to: string; body: string }) => {
        const result = await createDraft.mutateAsync({
          to,
          cc: [],
          subject: t('meetingNotes.followUpSubject'),
          body,
          appendSignature: true,
          documentIds: [],
        })
        // #2985 — un BROUILLON déposé, jamais un envoi (le copilote prépare).
        trackFollowupCreated(screen)
        return { webUrl: result.webUrl }
      }
    : undefined

  return (
    <Box className="space-y-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="space-y-1">
        <Text weight="medium" size="sm">
          {t('meetingNotes.title')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('meetingNotes.subtitle')}
        </Text>
      </Box>

      {status?.available ? (
        <Box className="space-y-1">
          <label className="flex min-h-11 cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={recordingConsent}
              onChange={event => setRecordingConsent(event.target.checked)}
            />
            <Text element="span" size="xs">
              {t('meetingNotes.consent')}
            </Text>
          </label>
          {/* #2434.65 — la policy VOCALE dédiée à CETTE réunion, distincte de
              celle de Laura (`CHAT_VOICE_MESSAGE_RETENTION_DAYS`, 30 jours) :
              `MeetingNotesService.transcribe` ne stocke jamais le fichier
              audio déposé ici (`Buffer` transcrit puis jeté, aucune écriture
              `storage_objects`) — seul le TEXTE transcrit rejoint le compte
              rendu. Vraie tant que le service ne change pas de mécanique. */}
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('meetingNotes.recordingPolicy')}
          </Text>
          <input
            type="file"
            accept="audio/*"
            className="text-xs"
            aria-label={t('meetingNotes.audioHint')}
            disabled={transcribe.isPending || !recordingConsent}
            onChange={event => void onFile(event.target.files?.[0])}
          />
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {!recordingConsent
              ? t('meetingNotes.consentRequired')
              : transcribe.isPending
                ? t('meetingNotes.transcribing')
                : t('meetingNotes.audioHint')}
          </Text>
        </Box>
      ) : null}

      {/* #2103.4 — un document joint (PDF/Word), lu et ajouté à la zone de
          texte. Toujours visible, contrairement au dépôt audio : l'extraction
          ne dépend d'aucune clé externe (`extract_document_text`, pur Python,
          aucun appel payant) — il n'y a rien à déclarer indisponible. Aucun
          accord à cocher : ce n'est pas un enregistrement. */}
      <Box className="space-y-1">
        <input
          type="file"
          accept=".pdf,.docx,.doc,.rtf,application/pdf"
          className="text-xs"
          aria-label={t('meetingNotes.documentHint')}
          disabled={extractDocument.isPending}
          onChange={event => void onDocumentFile(event.target.files?.[0])}
        />
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {extractDocument.isPending ? t('meetingNotes.extractingDocument') : t('meetingNotes.documentHint')}
        </Text>
        {documentPartial ? (
          <Text size="xs" color="text-[var(--bellum-warning-text)]">
            {t('meetingNotes.documentPartial')}
          </Text>
        ) : null}
      </Box>

      {/* #2319.61-.62 — ce que l'utilisateur colle. Une transcription ne se
          choisit pas ici : elle vient du dépôt d'un enregistrement. */}
      <Box className="space-y-1">
        <FilterChips
          ariaLabel={t('meetingNotes.inputKind.label')}
          legend={t('meetingNotes.inputKind.label')}
          options={(['notes', 'imported_report', 'email'] as const).map(kind => ({
            value: kind,
            label: t(`meetingNotes.inputKind.${kind}`),
          }))}
          value={pastedKind}
          onChange={next => setPastedKind(next ?? 'notes')}
        />
        {pastedKind === 'email' ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('meetingNotes.emailHint')}
          </Text>
        ) : null}
      </Box>

      <Textarea
        rows={6}
        value={notes}
        placeholder={t('meetingNotes.placeholder')}
        onChange={event => {
          setNotes(event.target.value)
          // Un texte retouché à la main n'est plus une transcription : on
          // cesse donc de promettre des citations vérifiables.
          setFromTranscript(false)
        }}
      />

      {/* #2103.7 / #2103.24-.26 — « Aucune note pour l'instant » n'est pas un
          état à sélectionner : ne rien taper EST cet état, et le bouton
          « Structurer » reste déjà fermé sur un champ vide (`!notes.trim()`).
          Trois questions courtes guident sans rien écrire à la place de
          l'utilisateur — elles s'effacent dès qu'une note existe. */}
      {!notes.trim() ? (
        <Box className="flex flex-col gap-1 rounded-lg border border-dashed border-[var(--bellum-border)] p-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('meetingNotes.noNotes.title')}
          </Text>
          <ul className="flex flex-col gap-0.5">
            {(['learned', 'nextStep', 'owner'] as const).map(question => (
              <li key={question}>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t(`meetingNotes.noNotes.${question}`)}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      {/* #2319.63 — la déclaration de l'utilisateur, DISTINCTE des notes : ce
          qu'il affirme ne se confond pas avec ce que le client a dit. */}
      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
          {t('meetingNotes.statementLabel')}
        </Text>
        <Textarea
          rows={2}
          value={statement}
          placeholder={t('meetingNotes.statementPlaceholder')}
          onChange={event => setStatement(event.target.value)}
        />
      </label>

      <Button size="sm" disabled={!notes.trim() || structure.isPending} onClick={() => void onStructure()}>
        {structure.isPending ? t('meetingNotes.structuring') : t('meetingNotes.structure')}
      </Button>

      {/* La cascade d'abord : c'est elle qui dit ce qui a été préparé, d'où ça
          vient, et ce qui ne partira jamais avec le lot. Le compte rendu détaillé
          reste dessous — la cascade compte les sorties, elle ne les recopie pas. */}
      {cascade ? (
        <MeetingCascade
          cascade={cascade}
          fromTranscript={fromTranscript}
          drafts={{
            ...(recap?.followUpEmail ? { follow_up_email: recap.followUpEmail } : {}),
            ...(recap?.reminder ? { reminder: recap.reminder.content } : {}),
          }}
          onApprove={kinds => void onApprove(kinds)}
          approving={approve.isPending}
          {...(isInternalMeeting ? { isInternalMeeting } : {})}
          {...(onDepositEmailDraft ? { onDepositEmailDraft } : {})}
          stageTarget={{
            // `provider` non nul = un CRM a répondu. `matched: false` veut dire
            // « il a répondu et n'a rien trouvé » — deux phrases différentes,
            // et la carte les distingue.
            ...stageInput,
            proposedStage: recap?.crmStage?.proposedStage ?? null,
            onSelectDeal,
            onSelectStage: setStageId,
          }}
          {...(outcomes ? { outcomes } : {})}
        />
      ) : null}

      {recap ? <RecapView recap={recap} chosen={chosen} onToggle={toggle} /> : null}

      {/* #2319.93 — chaque personne citée s'accepte, se modifie ou se refuse
          SÉPARÉMENT : la carte « personnes citées » de la cascade ne dit qu'un
          compte, ce bloc dit CHACUNE. */}
      {recap && recap.mentionedContacts.length > 0 ? (
        <MentionedContactsEditor edits={mentionedEdits} onToggle={toggleMentioned} onEdit={editMentioned} />
      ) : null}

      {recap && recap.nextSteps.length > 0 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={chosen.size === 0 || createTasks.isPending}
          onClick={() => void onCreateTasks()}
        >
          {t('meetingNotes.pushTasks', { count: chosen.size })}
        </Button>
      ) : null}

      {error ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      ) : null}
    </Box>
  )
}

function RecapView({
  recap,
  chosen,
  onToggle,
}: {
  recap: MeetingRecap
  chosen: Set<number>
  onToggle: (index: number) => void
}) {
  const { t } = useTranslation('accounts')
  const empty =
    !recap.summary &&
    recap.decisions.length === 0 &&
    recap.nextSteps.length === 0 &&
    recap.openQuestions.length === 0 &&
    recap.signals.length === 0 &&
    EXTRACTIONS.every(key => recap[key].length === 0) &&
    recap.dates.length === 0

  // Un compte rendu vide est un état VALABLE : des notes qui ne portent aucune
  // décision ne doivent pas en produire trois.
  if (empty) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('meetingNotes.nothingFound')}
      </Text>
    )
  }

  return (
    <Box className="space-y-3 rounded-lg bg-[var(--bellum-surface-2)] p-3">
      {recap.summary ? <Text size="sm">{recap.summary}</Text> : null}

      {recap.decisions.length > 0 ? (
        <Section title={t('meetingNotes.decisions')}>
          {recap.decisions.map(item => (
            <Text key={item} size="xs">
              • {item}
            </Text>
          ))}
        </Section>
      ) : null}

      {recap.nextSteps.length > 0 ? (
        <Section title={t('meetingNotes.nextSteps')}>
          {recap.nextSteps.map((step, index) => (
            <label key={`${step.action}-${index}`} className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={chosen.has(index)} onChange={() => onToggle(index)} />
              <Text size="xs">
                {step.action}
                {/* Propriétaire et échéance ne s'affichent que s'ils ont été DITS
                    en réunion — un « à définir » inventé se lit comme un fait. */}
                {step.owner || step.due ? (
                  <span className="text-[var(--bellum-text-muted)]">
                    {' '}
                    — {[step.owner, step.due].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </Text>
            </label>
          ))}
        </Section>
      ) : null}

      {/* #2103.32 — le gap se DIT plutôt que de se taire. On a bien regardé
          (le reste du compte rendu le prouve) et rien n'a été trouvé : un vrai
          constat, pas une absence de mesure. */}
      {recap.nextSteps.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('meetingNotes.noNextStep')}
        </Text>
      ) : null}

      {recap.openQuestions.length > 0 ? (
        <Section title={t('meetingNotes.openQuestions')}>
          {recap.openQuestions.map(item => (
            <Text key={item} size="xs">
              • {item}
            </Text>
          ))}
        </Section>
      ) : null}

      {recap.signals.length > 0 ? (
        <Section title={t('meetingNotes.signals')}>
          <Box className="flex flex-wrap gap-1">
            {recap.signals.map(item => (
              <Badge key={item} variant="outline" className="text-xs">
                {item}
              </Badge>
            ))}
          </Box>
        </Section>
      ) : null}

      {/* #2319.64-.74 — les extractions SÉPARÉES, chacune sous son titre. */}
      {EXTRACTIONS.map(key =>
        recap[key].length > 0 ? (
          <Section key={key} title={t(`meetingNotes.${key}`)}>
            {recap[key].map((item: MeetingExtractedItem) => (
              <Text key={item.content} size="xs">
                • {item.content}
              </Text>
            ))}
          </Section>
        ) : null,
      )}

      {recap.dates.length > 0 ? (
        <Section title={t('meetingNotes.dates')}>
          {recap.dates.map(item => (
            <Text key={`${item.label}-${item.when}`} size="xs">
              • {item.label} — {item.when}
            </Text>
          ))}
        </Section>
      ) : null}

      {recap.followUpEmail ? (
        <Section title={t('meetingNotes.followUp')}>
          <Text size="xs" className="whitespace-pre-wrap">
            {recap.followUpEmail}
          </Text>
        </Section>
      ) : null}
    </Box>
  )
}

/**
 * #2319.93 — les personnes citées, une par une : ACCEPTER (case cochée),
 * MODIFIER (nom, rôle) ou REFUSER (case décochée) chacune AVANT que la carte
 * « personnes citées » ne parte. Décocher une personne ne retire qu'elle —
 * les autres partent inchangées.
 */
function MentionedContactsEditor({
  edits,
  onToggle,
  onEdit,
}: {
  edits: Array<{ fullName: string; role: string; included: boolean }>
  onToggle: (index: number) => void
  onEdit: (index: number, field: 'fullName' | 'role', value: string) => void
}) {
  const { t } = useTranslation('accounts')
  return (
    <Box className="space-y-2 rounded-lg bg-[var(--bellum-surface-2)] p-3">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {t('meetingNotes.mentionedContacts.title')}
      </Text>
      {edits.map((edit, index) => (
        <Box key={index} className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className="size-4"
              checked={edit.included}
              aria-label={t('meetingNotes.mentionedContacts.includeLabel', { name: edit.fullName })}
              onChange={() => onToggle(index)}
            />
          </label>
          <Input
            value={edit.fullName}
            disabled={!edit.included}
            aria-label={t('meetingNotes.mentionedContacts.fullNameLabel', { name: edit.fullName })}
            onChange={event => onEdit(index, 'fullName', event.target.value)}
            className="min-w-40 flex-1"
          />
          <Input
            value={edit.role}
            disabled={!edit.included}
            placeholder={t('meetingNotes.mentionedContacts.rolePlaceholder')}
            aria-label={t('meetingNotes.mentionedContacts.roleLabel', { name: edit.fullName })}
            onChange={event => onEdit(index, 'role', event.target.value)}
            className="min-w-32 flex-1"
          />
        </Box>
      ))}
    </Box>
  )
}

/**
 * #2319.64-.74 — les listes extraites à part, dans l'ordre de la spécification
 * (les dates, qui portent aussi leur échéance, ont leur propre rendu).
 */
const EXTRACTIONS = ['facts', 'requests', 'criteria', 'clientCommitments', 'userCommitments'] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box className="space-y-1">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {title}
      </Text>
      {children}
    </Box>
  )
}
