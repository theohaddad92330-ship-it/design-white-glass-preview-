import type { MailThread, MailboxCapabilities, MailboxSender } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectField,
  Text,
  Textarea,
} from '@bellum/ui'
import { Copy, RefreshCw, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateDraft, useDraftReply, useMailboxSenders, useSendMail } from '../api'

/**
 * #2104.5 — DEUX gestes distincts sur la ligne de fil, chacun son brouillon
 * (DÉCISION Louis 17/09 matin). `kind` ne change QUE les mots (titre,
 * description) : le mécanisme de dépôt reste unique (GA-26), sinon « répondre »
 * et « relancer » deviendraient deux façons de préparer un brouillon qui
 * divergeraient avec le temps.
 */
export type DraftKind = 'reply' | 'follow_up'

/**
 * Préparer un brouillon — et, sur un clic humain explicite, l'envoyer.
 *
 * C'est la règle produit la plus ancienne du dépôt (« on prépare, le commercial
 * envoie ») et l'exigence la plus répétée des méta-analyses : « créer de VRAIS
 * brouillons, pas seulement du texte dans l'app ». La boîte de dialogue le dit
 * en toutes lettres, parce qu'un utilisateur qui doute de ce que fait un bouton
 * ne le clique pas.
 *
 * #4405.1 — « Répondre » s'ouvre sur un mail DÉJÀ rédigé (retour bêta 21/10 :
 * « prépare la réponse devrait prégénérer le mail prêt à l'envoi »). Le texte
 * vient du serveur (`POST /mailbox/reply-draft`, qui lit le fil avec le jeton de
 * l'utilisateur — le corps d'un mail ne transite jamais par le navigateur), et
 * reste éditable. Rien n'est déposé ni envoyé à l'ouverture : les deux gestes
 * ci-dessous restent derrière un clic. Un échec laisse le champ VIDE à rédiger,
 * jamais un texte deviné. « Relancer » (`follow_up`) n'est pas concerné : une
 * relance ne répond à aucun message précis.
 *
 * #2104.32 — L'ENVOI (DÉCISION Louis 17/09) : un bouton derrière un clic
 * humain explicite, jamais automatique — le copilote n'envoie jamais seul
 * (D65). Il emprunte le chemin EXISTANT (`useSendMail` → lot d'un seul
 * destinataire, déjà consommé par `ContactMailboxDialog`), pas une route
 * neuve : mêmes garde-fous (opt-out, idempotence par `batchId`).
 */
export function DraftDialog({
  thread,
  kind = 'reply',
  open,
  onOpenChange,
  signature,
  capabilities,
}: {
  thread: MailThread | null
  kind?: DraftKind
  open: boolean
  onOpenChange: (open: boolean) => void
  signature: string | null
  capabilities: MailboxCapabilities
}) {
  const { t } = useTranslation('mailbox')
  const createDraft = useCreateDraft()
  const send = useSendMail()
  const draftReply = useDraftReply()
  // #4546.5 — l'expéditeur se choisit parmi SES boîtes qui peuvent envoyer ; l'écran dit laquelle part.
  const senders = useMailboxSenders(open && capabilities.send)
  const sendable = useMemo(() => (senders.data ?? []).filter(sender => sender.capabilities.send), [senders.data])
  const [senderId, setSenderId] = useState<string | null>(null)
  const activeSender = sendable.find(sender => sender.connectionId === senderId) ?? sendable[0] ?? null
  const senderLabel = (sender: MailboxSender, index: number) =>
    sender.address ?? t('draft.senderUnnamed', { n: index + 1 })
  const { i18n } = useTranslation()
  // Un fil, une demande : l'ouverture ne rejoue pas la génération (StrictMode, re-rendus).
  const requestedFor = useRef<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  // Clé d'idempotence du lot d'envoi : une par ouverture, comme
  // `ContactMailboxDialog`. Un double-clic ne renvoie pas deux fois.
  const [batchId, setBatchId] = useState(() => crypto.randomUUID())

  const to = thread?.counterpart ?? ''
  // Décision Louis (refonte Théo) : toute fenêtre de préparation s'ouvre DÉJÀ rédigée — la relance aussi. Le générateur
  // lit le fil entier : sur un fil dont le dernier message est le nôtre, ce qu'il rédige est la relance.
  const generateFor = open && thread ? thread.threadId : null

  // `overwrite` = « Régénérer » : Laura réécrit, le texte courant est remplacé (le commercial l'a demandé).
  const generate = (overwrite: boolean) => {
    if (!thread) return
    draftReply.mutate(
      {
        threadId: thread.threadId,
        // #4405.1 — jamais une chaîne vide : le contrat la refuse, un fil de groupe n'a pas d'interlocuteur.
        ...(thread.counterpart ? { counterpart: thread.counterpart } : {}),
        locale: i18n.language.startsWith('en') ? 'en' : 'fr',
      },
      {
        // À l'ouverture, ce que l'utilisateur a déjà tapé pendant l'attente n'est jamais écrasé.
        onSuccess: result => {
          setSubject(previous => (overwrite ? result.subject : previous || result.subject))
          setBody(previous => (!overwrite && previous.trim() ? previous : result.body))
        },
      },
    )
  }

  useEffect(() => {
    if (!generateFor || !thread) {
      requestedFor.current = null
      return
    }
    if (requestedFor.current === generateFor) return
    requestedFor.current = generateFor
    generate(false)
    // `draftReply` et `thread` changent à chaque rendu : la clé de la demande est le fil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateFor])
  const defaultSubject = thread?.subject
    ? thread.subject.startsWith('Re:')
      ? thread.subject
      : `Re: ${thread.subject}`
    : ''
  const effectiveSubject = subject || defaultSubject
  const valid = Boolean(thread && to && effectiveSubject && body.trim())
  const busy = createDraft.isPending || send.isPending
  const done = Boolean(createDraft.data) || Boolean(send.data)
  const sendOutcome = send.data?.outcomes[0] ?? null

  const submit = () => {
    if (!thread || !valid) return
    createDraft.mutate({
      to,
      cc: [],
      subject: effectiveSubject,
      body,
      threadId: thread.threadId,
      appendSignature: true,
      documentIds: [],
    })
  }

  const submitSend = () => {
    if (!thread || !valid) return
    send.mutate({
      batchId,
      mode: 'send',
      items: [{ to, subject: effectiveSubject, body, threadId: thread.threadId }],
      ...(activeSender ? { senderConnectionId: activeSender.connectionId } : {}),
    })
  }

  // #2104.30 — copier objet + corps, un geste local qui ne dépose rien : le
  // panneau frère `DraftPanel` (`prepare_message`, `PendingActions.tsx`) a ce
  // bouton depuis longtemps, celui-ci en était dépourvu.
  const copy = () => {
    void navigator.clipboard?.writeText(effectiveSubject ? `${effectiveSubject}\n\n${body}` : body)
    toast.success(t('draft.copied'))
  }

  const close = () => {
    setSubject('')
    setBody('')
    setBatchId(crypto.randomUUID())
    createDraft.reset()
    send.reset()
    requestedFor.current = null
    draftReply.reset()
    onOpenChange(false)
  }

  // Ce qui s'est réellement passé — jamais « envoyé » par défaut, comme
  // `ContactMailboxDialog` : un désabonné écarté ou un échec fournisseur
  // restent ce qu'ils sont, pas un succès déguisé.
  const outcomeMessage = (): string => {
    if (createDraft.data) return t('draft.success')
    if (!sendOutcome) return t('draft.sendSuccess')
    if (sendOutcome.status === 'sent') return t('draft.sendSuccess')
    if (sendOutcome.status === 'drafted') return t('draft.success')
    if (sendOutcome.status === 'skipped' && sendOutcome.reason === 'suppressed') {
      return t('draft.skippedSuppressed')
    }
    if (sendOutcome.status === 'skipped') return t('draft.skippedOther')
    return t('draft.sendFailed', { error: sendOutcome.error ?? '' })
  }

  return (
    <Dialog open={open} onOpenChange={value => (value ? onOpenChange(true) : close())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{kind === 'follow_up' ? t('draft.followUpTitle') : t('draft.replyTitle')}</DialogTitle>
          <DialogDescription>
            {kind === 'follow_up' ? t('draft.followUpDescription') : t('draft.description')}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <Box className="flex flex-col gap-3">
            <Text size="sm">{outcomeMessage()}</Text>
            {createDraft.data?.webUrl ? (
              <Button asChild size="sm" variant="outline" className="w-fit">
                <a href={createDraft.data.webUrl} target="_blank" rel="noreferrer">
                  {t('draft.openDraft')}
                </a>
              </Button>
            ) : null}
          </Box>
        ) : (
          <Box className="flex flex-col gap-3">
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="draft-to">{t('draft.to')}</Label>
              <Input id="draft-to" value={to} readOnly />
            </Box>
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="draft-subject">{t('draft.subject')}</Label>
              <Input id="draft-subject" value={effectiveSubject} onChange={event => setSubject(event.target.value)} />
            </Box>
            {draftReply.isPending ? (
              <Text size="sm" role="status" className="text-[var(--bellum-text-secondary)]">
                {t('draft.generating')}
              </Text>
            ) : null}
            {draftReply.isError ? (
              <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
                {t('draft.generateFailed')}
              </Text>
            ) : null}
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="draft-body">{t('draft.body')}</Label>
              <Textarea id="draft-body" rows={8} value={body} onChange={event => setBody(event.target.value)} />
            </Box>
            {/* Garde-fou n°2 : on ne promet une signature que si on en a lu une. */}
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {signature ? t('draft.signatureNotice') : t('draft.noSignatureNotice')}
            </Text>
            {capabilities.send && activeSender ? (
              sendable.length > 1 ? (
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor="draft-sender">{t('draft.sendFrom')}</Label>
                  <SelectField
                    id="draft-sender"
                    value={activeSender.connectionId}
                    onChange={setSenderId}
                    options={sendable.map((sender, index) => ({
                      value: sender.connectionId,
                      label: senderLabel(sender, index),
                    }))}
                    size="sm"
                    className="min-w-0 max-w-full"
                  />
                </Box>
              ) : (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('draft.sendsFrom', { address: senderLabel(activeSender, 0) })}
                </Text>
              )
            ) : null}
            {/* Ce que fait chaque bouton, écrit à côté — comme `ContactMailboxDialog`. */}
            {capabilities.send ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('draft.sendExplain')}
              </Text>
            ) : null}
            {createDraft.isError || send.isError ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {((createDraft.error ?? send.error) as Error).message}
              </Text>
            ) : null}
          </Box>
        )}

        {/* #4405.1 — la rangée SE REPLIE (cinq boutons ne tiennent pas sur 468 px) : plus de « …uler » hors de la modale. */}
        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button variant="outline" size="sm" className="min-h-11" onClick={close} disabled={busy}>
            {done ? t('draft.close') : t('draft.cancel')}
          </Button>
          {done ? null : (
            <>
              <Button
                size="sm"
                className="min-h-11"
                variant="ghost"
                onClick={() => generate(true)}
                disabled={draftReply.isPending}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                {t('draft.regenerate')}
              </Button>
              <Button size="sm" className="min-h-11" variant="ghost" onClick={copy} disabled={!body.trim()}>
                <Copy className="size-3.5" aria-hidden />
                {t('draft.copy')}
              </Button>
              <Button size="sm" className="min-h-11" variant="outline" onClick={submit} disabled={!valid || busy}>
                {createDraft.isPending ? t('draft.submitting') : t('draft.submit')}
              </Button>
              {/* #2104.32 — DÉCISION Louis 17/09 : un clic humain EXPLICITE,
                  jamais un envoi déclenché par le copilote (D65). */}
              {capabilities.send ? (
                <Button size="sm" className="min-h-11" icon={Send} onClick={submitSend} disabled={!valid || busy}>
                  {send.isPending ? t('draft.sending') : t('draft.send')}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
