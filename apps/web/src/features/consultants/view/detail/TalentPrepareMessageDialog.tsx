import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormTextareaField,
  SelectField,
  Text,
} from '@bellum/ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  DraftTalentMessageInput,
  TalentMessageDraft,
  TalentMessageObjective,
  TalentPreparedMessageChannel,
} from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { formatDateTime } from '@/lib/locale'
import { useDraftTalentMessage, usePrepareTalentMessage, useTalentPreparedMessages } from '../../talent-api'

/** Les canaux exposés à l'écran — sous-ensemble du vocabulaire outreach
 *  partagé (GA-26) : `manual`/`voicemail` sont des mécaniques de séquence,
 *  hors de propos pour un brouillon simple vers un candidat. */
const CHANNELS: TalentPreparedMessageChannel[] = ['email', 'linkedin', 'phone']

/**
 * #2185.51 — « Préparer un message », depuis la fiche consultant.
 *
 * #4347 — la fenêtre s'ouvre DÉJÀ RÉDIGÉE par Laura (décision Louis 19/10/2026 : « préparer les messages,
 * ça doit être généré par l'IA / Laura, pas des champs vides à remplir ») : objet et corps pré-remplis à partir
 * du consultant, du besoin et du client, relisibles et modifiables, « Régénérer » / « Plus court » / « Plus
 * direct » à portée. Un échec se DIT et laisse les champs vides — le client n'écrit jamais de texte de
 * remplacement. Un brouillon SUGGÉRÉ (`initialBody`) passe avant la rédaction automatique.
 *
 * Tranche minimale volontaire, distincte du moteur `outreach_messages`
 * (séquences, versions, preuve d'approbation — `contact_id` NOT NULL) :
 * un brouillon SIMPLE, jamais envoyé, jamais entré dans une séquence.
 * Généraliser ce moteur à une seconde entité est un chantier à part —
 * tranché sans Louis, brief nuit du 26/09/2026.
 */
export function TalentPrepareMessageDialog({
  talentId,
  talentName,
  open,
  onOpenChange,
  initialBody,
}: {
  talentId: string
  talentName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * #2948 (#2329.53) — un brouillon SUGGÉRÉ (revalidation de fraîcheur, par
   * exemple), jamais envoyé d'office : la personne l'ouvre déjà rempli, le
   * relit, le modifie ou le vide avant de cliquer « Préparer ». Même geste
   * que le champ vide, juste un point de départ différent — aucun nouveau
   * chemin d'envoi.
   */
  initialBody?: string
}) {
  const { t } = useTranslation('consultants')
  const { data: messages } = useTalentPreparedMessages(open ? talentId : undefined)
  const prepare = usePrepareTalentMessage(talentId)
  const drafter = useDraftTalentMessage(talentId)
  const [channel, setChannel] = useState<TalentPreparedMessageChannel>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState(initialBody ?? '')
  // #4347 — la rédaction de Laura : en cours, en échec (la raison NOMMÉE), et ce sur quoi elle repose.
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [basis, setBasis] = useState<TalentMessageDraft['basis'] | null>(null)
  // #4347.3 — l'objectif retenu par le serveur (déduit), et le choix explicite de la personne s'il y en a un.
  const [objective, setObjective] = useState<TalentMessageObjective | null>(null)
  const [chosenObjective, setChosenObjective] = useState<TalentMessageObjective | null>(null)
  // Un jeton par demande : une réponse arrivée après un changement de canal ou une fermeture est jetée.
  const requestRef = useRef(0)

  const requestDraft = (
    variant?: NonNullable<DraftTalentMessageInput['variant']>,
    forChannel = channel,
    forObjective: TalentMessageObjective | null = chosenObjective,
  ) => {
    const token = (requestRef.current += 1)
    const previousBody = body.trim()
    setDrafting(true)
    setDraftError(null)
    drafter
      .mutateAsync({
        channel: forChannel,
        ...(forObjective ? { objective: forObjective } : {}),
        ...(variant ? { variant, ...(previousBody ? { previousBody } : {}) } : {}),
      })
      .then(draft => {
        if (requestRef.current !== token) return
        setSubject(draft.subject ?? '')
        setBody(draft.body)
        setBasis(draft.basis)
        setObjective(draft.objective)
      })
      .catch((error: unknown) => {
        if (requestRef.current !== token) return
        setDraftError(
          error instanceof ApiError && error.code === 'talent_message_unavailable'
            ? t('detail.preparedMessages.draftUnavailable')
            : t('detail.preparedMessages.draftFailed'),
        )
      })
      .finally(() => {
        if (requestRef.current === token) setDrafting(false)
      })
  }

  // #2948 (#2329.53) — l'instance vit pour toute la durée de la fiche
  // (`TalentDetailPage` la monte une fois) : sans cet effet, un `initialBody`
  // suggéré APRÈS le premier montage — depuis un bouton de revalidation
  // ouvert plus tard — ne remplirait jamais le brouillon.
  useEffect(() => {
    if (open) setBody(initialBody ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // #4347 — à l'ouverture, et à chaque changement de canal : Laura rédige. Sauf si un brouillon SUGGÉRÉ
  // occupe déjà le champ (revalidation) : il n'est jamais écrasé sans le geste « Régénérer ».
  useEffect(() => {
    if (!open || initialBody) return
    requestDraft(undefined, channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel])

  const reset = () => {
    requestRef.current += 1
    setDrafting(false)
    setDraftError(null)
    setBasis(null)
    setObjective(null)
    setChosenObjective(null)
    setChannel('email')
    setSubject('')
    setBody(initialBody ?? '')
  }

  const submit = () => {
    if (!body.trim()) return
    prepare
      .mutateAsync({ channel, subject: subject.trim() || null, body: body.trim() })
      .then(() => reset())
      .catch(() => {
        // Le toast d'échec est déjà porté par `usePrepareTalentMessage` — le
        // brouillon reste dans le formulaire pour ne pas le perdre.
      })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('detail.preparedMessages.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('detail.preparedMessages.description')}</DialogDescription>
        </DialogHeader>

        {objective ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="talent-message-objective">
            <Text size="sm">
              {t('detail.preparedMessages.objective.label')}{' '}
              <strong>{t(`detail.preparedMessages.objective.${objective}`)}</strong>
            </Text>
            <Button
              variant="ghost"
              size="sm"
              disabled={drafting}
              onClick={() => {
                const next: TalentMessageObjective =
                  objective === 'propose_mission' ? 'revalidate_availability' : 'propose_mission'
                setChosenObjective(next)
                requestDraft(undefined, channel, next)
              }}
            >
              {t(
                `detail.preparedMessages.objective.${objective === 'propose_mission' ? 'revalidate_availability' : 'propose_mission'}`,
              )}
            </Button>
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-xs text-[var(--bellum-text-muted)]">
          {t('detail.preparedMessages.channel')}
          <SelectField
            value={channel}
            onChange={next => setChannel(next as TalentPreparedMessageChannel)}
            options={CHANNELS.map(value => ({ value, label: t(`detail.preparedMessages.channels.${value}`) }))}
            ariaLabel={t('detail.preparedMessages.channel')}
            size="sm"
            className="w-full"
          />
        </label>

        {channel === 'email' ? (
          <FormField
            label={t('detail.preparedMessages.subject')}
            inputProps={{ value: subject, onChange: e => setSubject(e.target.value), maxLength: 200 }}
          />
        ) : null}

        <FormTextareaField
          label={t('detail.preparedMessages.body')}
          inputProps={{ value: body, onChange: e => setBody(e.target.value), rows: 8, maxLength: 4000 }}
        />

        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Button variant="outline" size="sm" disabled={drafting} onClick={() => requestDraft('regenerate')}>
            {t('detail.preparedMessages.regenerate')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={drafting || !body.trim()}
            onClick={() => requestDraft('shorter')}
          >
            {t('detail.preparedMessages.shorter')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={drafting || !body.trim()}
            onClick={() => requestDraft('more_direct')}
          >
            {t('detail.preparedMessages.moreDirect')}
          </Button>
          {drafting ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('detail.preparedMessages.drafting')}
            </Text>
          ) : null}
        </div>

        {draftError ? (
          <p role="alert" className="text-sm text-[var(--danger-soft-text)]">
            {draftError}
          </p>
        ) : null}

        {basisSources(basis).length > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('detail.preparedMessages.basis', { sources: basisSources(basis).join(', ') })}
          </Text>
        ) : null}

        {(messages ?? []).length > 0 ? (
          <div className="flex flex-col gap-2">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
              {t('detail.preparedMessages.history')}
            </Text>
            <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
              {(messages ?? []).map(message => (
                <li key={message.id} className="rounded-md border border-[var(--bellum-border)] p-2">
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t(`detail.preparedMessages.channels.${message.channel}`)} · {formatDateTime(message.createdAt)}
                    {message.preparedByName ? ` · ${message.preparedByName}` : ''}
                  </Text>
                  <Text size="sm" className="line-clamp-2">
                    {message.body}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" disabled={!body.trim() || prepare.isPending} onClick={submit}>
            {t('detail.preparedMessages.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Ce sur quoi Laura s'est appuyée : seulement ce qui existe — une absence ne fait aucune ligne. */
function basisSources(basis: TalentMessageDraft['basis'] | null): string[] {
  if (!basis) return []
  return [basis.consultant, basis.need, basis.client].filter((source): source is string => Boolean(source))
}
