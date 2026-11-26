import {
  OUTREACH_APPROVAL_VIEWS,
  OUTREACH_QUALITY_FLAG_KINDS,
  callTaskNextStatuses,
  documentSourceTitles,
  marketMemorySourcedVariables,
  outreachTextDiff,
  type OutreachApprovalView,
  type OutreachCallTask,
  type OutreachCallTaskStatus,
  type OutreachMessage,
  type OutreachQualityFlagKind,
} from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, Text, cn } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSession } from '@/lib/hooks/use-session'
import { formatDate } from '@/lib/locale'
import { alternativeHooksFor, type AlternativeHook } from '../alternative-hooks'
import { outreachKeys, outreachMessagesApi } from '../api'
import { MessageVariables } from './MessageVariables'

/**
 * #2382 — le centre d'approbation de l'outreach, en SOUS-VUE dédiée (reco du
 * registre tranchée le 22/09 soir §1) : l'écran d'Actions reste l'écran
 * partagé ERP/CRM/workflows, rien n'y est redessiné.
 *
 * Il lit le message CANONIQUE (#2366) — le même objet que Laura, Contacts ou
 * Séquences ont préparé —, jamais une copie propre à l'écran.
 */
export function OutreachApprovalCenter() {
  const { t } = useTranslation('outreach')
  const { user } = useSession()
  const qc = useQueryClient()
  const { data: messages = [] } = useQuery<OutreachMessage[]>({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    enabled: !!user,
  })
  // #2366.5 — RÉFUTÉ en prod le 23/09 : les appels ont leur PROPRE source
  // (indépendante des messages), mais vivaient dans un sous-composant monté
  // seulement APRÈS le silence ci-dessous — un appel réel restait invisible
  // dès qu'aucun message n'était encore préparé. Remontée ici pour peser dans
  // la même condition de silence.
  const { data: calls = [] } = useQuery<OutreachCallTask[]>({
    queryKey: ['outreach', 'call-tasks'],
    queryFn: () => outreachMessagesApi.listCalls(),
    enabled: !!user,
  })
  // `undefined` = l'utilisateur n'a pas encore choisi : la vue ouverte d'office suit
  // alors ce que l'espace contient (voir `view` plus bas), puis son choix gagne.
  const [chosenView, setView] = useState<OutreachApprovalView | null | undefined>(undefined)

  const counts = useMemo(() => {
    const out = new Map<OutreachApprovalView, number>()
    for (const message of messages) if (message.view) out.set(message.view, (out.get(message.view) ?? 0) + 1)
    return out
  }, [messages])
  // #3419 (recette prod 02/10) — ce qui BLOQUE s'ouvre d'abord : un message
  // bloqué ne se valide pas, il se corrige, et son motif est la seule chose qui
  // dise quoi corriger. Le rôle change l'ORDRE, jamais le contenu : les six
  // autres vues restent à un clic, comptées sur leurs pastilles.
  const view = chosenView !== undefined ? chosenView : counts.get('blocked') ? 'blocked' : 'to_review'
  const shown = messages.filter(m => m.view === view)

  // #2382.9 — « Valider tout » : ce qui est AFFICHÉ, conforme et que le lecteur
  // a le droit de valider. Chaque élément part avec la version VUE : ce qui a
  // changé depuis est exclu par le serveur, jamais validé.
  const approvable = shown.filter(
    m => m.can_approve && m.blockers.length === 0 && (m.view === 'to_review' || m.view === 'modified'),
  )

  const approve = useMutation({
    mutationFn: (items: { id: string; version: number }[]) => outreachMessagesApi.approve({ items }),
    onSuccess: result => {
      void qc.invalidateQueries({ queryKey: outreachKeys.all })
      if (result.excluded.length > 0) {
        toast.warning(t('approval.partial', { approved: result.approved.length, excluded: result.excluded.length }), {
          description: result.excluded.map(e => t(`approval.excluded.${e.reason}`)).join(' · '),
        })
      } else {
        toast.success(t('approval.done', { count: result.approved.length }))
      }
    },
    onError: err => toast.error(err instanceof Error ? err.message : t('approval.failed')),
  })

  // On n'affiche pas ce qu'on n'a pas : sans aucun message ET sans aucun
  // appel, la sous-vue se tait. L'un des deux suffit à la garder visible.
  if (messages.length === 0 && calls.length === 0) return null

  return (
    <Box as="section" aria-labelledby="outreach-approval-title" className="flex flex-col gap-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Text element="h2" id="outreach-approval-title" size="base" weight="semibold">
          {t('approval.title')}
        </Text>
        {approvable.length > 0 ? (
          <Button
            size="sm"
            disabled={approve.isPending}
            onClick={() => approve.mutate(approvable.map(m => ({ id: m.id, version: m.current_version })))}
          >
            {t('approval.approveAll', { count: approvable.length })}
          </Button>
        ) : null}
      </Box>
      {/* #2382.1 — les sept vues, dans l'ordre de la spec. */}
      <FilterChips
        ariaLabel={t('approval.views')}
        options={OUTREACH_APPROVAL_VIEWS.map(v => ({ value: v, label: t(`approval.view.${v}`), count: counts.get(v) }))}
        value={view}
        onChange={setView}
        size="sm"
      />
      {shown.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('approval.emptyView')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map(message => (
            <ApprovalCard
              key={message.id}
              message={message}
              pending={approve.isPending}
              onApprove={() => approve.mutate([{ id: message.id, version: message.current_version }])}
            />
          ))}
        </ul>
      )}
      <CallTasks calls={calls} />
    </Box>
  )
}

/**
 * #3752.7 — « Source : <titre du document> » : les documents de l'espace cités par les variables du
 * message, visibles SANS ouvrir le panneau Variables. Même requête (même clé) que `MessageVariables`.
 * Aucune variable sourcée sur un document → aucune ligne (on n'affiche pas ce qu'on n'a pas).
 */
function DocumentSourceLine({ messageId }: { messageId: string }) {
  const { t } = useTranslation('outreach')
  const query = useQuery({
    queryKey: [...outreachKeys.all, 'variables', messageId],
    queryFn: () => outreachMessagesApi.variables(messageId),
    staleTime: 15_000,
  })
  const titles = documentSourceTitles(query.data ?? [])
  if (titles.length === 0) return null
  return (
    <Text size="sm" className="text-[var(--bellum-text-secondary)]" data-testid="outreach-document-source">
      {t('approval.documentSource', { titles: titles.join(' · ') })}
    </Text>
  )
}

/**
 * #2877 / #3419.4 — « Mémoire marché : <extrait> » : les extraits de mémoire
 * marché cités par les variables du message, visibles SANS ouvrir le panneau
 * Variables — même requête (même clé) que `DocumentSourceLine` ci-dessus. Un
 * tel extrait ne lave jamais, seul, une variable pour l'usage externe (le
 * schéma le refuse) ; cette ligne avertit le relecteur avant même qu'il
 * ouvre le panneau. Aucune variable sourcée sur la mémoire marché → aucune
 * ligne (on n'affiche pas ce qu'on n'a pas).
 */
function MarketMemorySourceLine({ messageId }: { messageId: string }) {
  const { t } = useTranslation('outreach')
  const query = useQuery({
    queryKey: [...outreachKeys.all, 'variables', messageId],
    queryFn: () => outreachMessagesApi.variables(messageId),
    staleTime: 15_000,
  })
  const refs = marketMemorySourcedVariables(query.data ?? [])
  if (refs.length === 0) return null
  return (
    <Text size="sm" className="text-[var(--bellum-warning-text)]" data-testid="outreach-market-memory-source">
      {t('approval.marketMemorySource', { refs: refs.join(' · ') })}
    </Text>
  )
}

/** #2382.2 — la carte : destinataire, contexte, message, coût, permission, risques, bloquants. */
function ApprovalCard({
  message,
  pending,
  onApprove,
}: {
  message: OutreachMessage
  pending: boolean
  onApprove: () => void
}) {
  const { t } = useTranslation('outreach')
  const [diffOpen, setDiffOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // #3419.3 (recette Z7 05/10, 0 élément) — le bouton n'était qu'au fond du formulaire
  // « Modifier » : la recette ne le trouvait pas. Il est maintenant DANS la rangée
  // d'actions de la carte ; il ouvre l'éditeur et charge les propositions.
  const [hooksOnOpen, setHooksOnOpen] = useState(false)
  const reviewable = message.view === 'to_review' || message.view === 'modified'
  // #2366.10 — un message parti ne se réécrit pas : on ne propose de modifier
  // que ce qui est encore préparé, validé ou planifié.
  const editable =
    message.can_approve && ['drafted', 'needs_review', 'approved', 'scheduled', 'failed'].includes(message.status)
  return (
    <li className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3">
      <Box className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="semibold">
          {message.contact_name ?? t('approval.unknownRecipient')}
        </Text>
        {/* #3419 — un siège porte son titre pour nom : le même texte ne s'écrit pas deux fois. */}
        {message.contact_role && message.contact_role !== message.contact_name ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {message.contact_role}
          </Text>
        ) : null}
        {message.account_name ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            · {message.account_name}
          </Text>
        ) : null}
        <Badge variant="outline">{t(`approval.channel.${message.channel}`)}</Badge>
        <Badge variant="outline">{t(`approval.intent.${message.intent}`)}</Badge>
        {/* #2366.4 — l'état du message, parmi les quinze de la machine. */}
        <Badge variant="outline" data-testid="outreach-message-status">
          {t(`messageStatus.${message.status}`)}
        </Badge>
      </Box>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <Field label={t('approval.field.source')} value={t(`approval.source.${message.source}`)} />
        <Field label={t('approval.field.date')} value={formatDate(message.updated_at) ?? ''} />
        {message.reason ? <Field label={t('approval.field.reason')} value={message.reason} /> : null}
        {/* Aucun coût n'est mesuré par message : on le DIT, jamais « 0 » (GA-18). */}
        <Field
          label={t('approval.field.cost')}
          value={message.approval?.cost != null ? String(message.approval.cost) : t('approval.notMeasured')}
        />
        <Field
          label={t('approval.field.permission')}
          value={t(`approval.permission.${message.required_permission.replace(':', '_')}`)}
        />
        <Field label={t('approval.field.version')} value={String(message.current_version)} />
      </dl>
      <DocumentSourceLine messageId={message.id} />
      <MarketMemorySourceLine messageId={message.id} />
      {message.subject ? (
        <Text size="sm" weight="semibold">
          {message.subject}
        </Text>
      ) : null}
      <Text size="sm" className="whitespace-pre-line">
        {message.body}
      </Text>
      {message.blockers.length > 0 ? (
        <Box className="flex flex-wrap gap-1" aria-label={t('approval.blockersLabel')}>
          {message.blockers.map(b => (
            <Badge key={b} variant="outline" className="text-[var(--danger-soft-text)]">
              {t(`approval.blocker.${b}`)}
            </Badge>
          ))}
        </Box>
      ) : null}
      {message.risks.length > 0 ? (
        <Box className="flex flex-wrap gap-1" aria-label={t('approval.risksLabel')}>
          {message.risks.map(r => (
            <Badge key={r} variant="outline" className="text-[var(--bellum-warning-text)]">
              {t(`approval.risk.${r}`)}
            </Badge>
          ))}
        </Box>
      ) : null}
      {message.approval ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('approval.proof', { version: message.approval.version, date: formatDate(message.approval.date) })}
        </Text>
      ) : null}
      <Box className="flex flex-wrap gap-2">
        {message.versions.length > 1 ? (
          <Button size="sm" variant="outline" aria-expanded={diffOpen} onClick={() => setDiffOpen(o => !o)}>
            {diffOpen ? t('approval.hideDiff') : t('approval.showDiff')}
          </Button>
        ) : null}
        {editable && !editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t('approval.edit')}
          </Button>
        ) : null}
        {editable && !editing ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setHooksOnOpen(true)
              setEditing(true)
            }}
          >
            {t('approval.hooks.button')}
          </Button>
        ) : null}
        {/* #3419.1 — les variables du message : dans la MÊME rangée, panneau déplié sous la carte. */}
        <Button size="sm" variant="outline" aria-expanded={variablesOpen} onClick={() => setVariablesOpen(o => !o)}>
          {variablesOpen ? t('approval.variables.hide') : t('approval.variables.toggle')}
        </Button>
        {/* #2877 (#2385.4) — signaler un problème : dans la MÊME rangée d'actions, jamais un bloc de plus. */}
        {message.can_approve ? (
          <QualityFlagControl messageId={message.id} flagged={message.my_quality_flags ?? []} />
        ) : null}
        {/* #2382.7 — le bouton n'existe que pour qui a le droit de valider CE message. */}
        {reviewable && message.can_approve && message.blockers.length === 0 ? (
          <Button size="sm" disabled={pending} onClick={onApprove}>
            {t('approval.approve')}
          </Button>
        ) : null}
      </Box>
      {editing ? (
        <EditForm
          message={message}
          loadHooksOnOpen={hooksOnOpen}
          onDone={() => {
            setEditing(false)
            setHooksOnOpen(false)
          }}
        />
      ) : null}
      {diffOpen ? <VersionsDiff message={message} /> : null}
      {variablesOpen ? <MessageVariables messageId={message.id} canWrite={message.can_approve} /> : null}
    </li>
  )
}

/**
 * #2877 (#2385.4) — le relecteur DÉCLARE ce qui cloche (faux fait, CTA ou
 * persona incorrect). Le système ne le devine pas en lisant le corps ; un
 * signal n'est pas une décision — le message ne bouge pas. Les trois natures
 * se déplient DANS la rangée d'actions de la carte.
 */
function QualityFlagControl({
  messageId,
  flagged,
}: {
  messageId: string
  flagged: readonly OutreachQualityFlagKind[]
}) {
  const { t } = useTranslation('outreach')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const flag = useMutation({
    mutationFn: (kind: OutreachQualityFlagKind) => outreachMessagesApi.flagQuality(messageId, { kind }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: outreachKeys.all })
      toast.success(t('approval.flagged'))
      setOpen(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : t('approval.failed')),
  })
  return (
    <>
      <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {flagged.length > 0
          ? t('approval.flaggedAs', { kinds: flagged.map(kind => t(`approval.flagKind.${kind}`)).join(', ') })
          : t('approval.flag')}
      </Button>
      {open
        ? OUTREACH_QUALITY_FLAG_KINDS.map(kind => (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              aria-pressed={flagged.includes(kind)}
              disabled={flag.isPending || flagged.includes(kind)}
              onClick={() => flag.mutate(kind)}
            >
              {t(`approval.flagKind.${kind}`)}
            </Button>
          ))
        : null}
    </>
  )
}

/**
 * #2366.10 / #2382.6 — modifier crée une VERSION, jamais un écrasement. La
 * version vue part avec la modification : si quelqu'un a retouché entre-temps,
 * le serveur refuse au lieu d'écraser. Une modification substantielle d'un
 * message validé le renvoie à valider — c'est le serveur qui en décide.
 */
function EditForm({
  message,
  onDone,
  loadHooksOnOpen = false,
}: {
  message: OutreachMessage
  onDone: () => void
  loadHooksOnOpen?: boolean
}) {
  const { t } = useTranslation('outreach')
  const qc = useQueryClient()
  const [subject, setSubject] = useState(message.subject ?? '')
  const [body, setBody] = useState(message.body)
  const revise = useMutation({
    mutationFn: () =>
      outreachMessagesApi.revise(message.id, {
        subject: subject.trim().length > 0 ? subject : null,
        body,
        base_version: message.current_version,
      }),
    onSuccess: updated => {
      void qc.invalidateQueries({ queryKey: outreachKeys.all })
      toast.success(
        updated.approval === null && message.approval !== null ? t('approval.editInvalidated') : t('approval.edited'),
      )
      onDone()
    },
    onError: err => toast.error(err instanceof Error ? err.message : t('approval.failed')),
  })
  // #3419.3 — « Autres accroches » : le moteur réécrit l'OUVERTURE du message en cours
  // d'édition (consigne `revision`), le commercial accepte ou non. Accepter ne fait QUE
  // remplir le champ ci-dessous : la version ne naît qu'au clic « Enregistrer une nouvelle version ».
  const [hooks, setHooks] = useState<AlternativeHook[] | null>(null)
  // Les ouvertures déjà proposées : le moteur ne les ressert pas au clic suivant.
  const [seenOpenings, setSeenOpenings] = useState<string[]>([])
  const loadHooks = useMutation({
    mutationFn: () =>
      outreachMessagesApi.alternativeHook({
        contactId: message.contact_id,
        channel: message.channel,
        currentBody: body,
        previousHooks: seenOpenings,
      }),
    onSuccess: data => {
      const proposals = alternativeHooksFor(data, body)
      setHooks(proposals)
      const openings = proposals.flatMap(proposal => (proposal.opening ? [proposal.opening] : []))
      if (openings.length > 0) setSeenOpenings(previous => [...previous, ...openings].slice(-5))
    },
    onError: () => toast.error(t('approval.hooks.failed')),
  })
  const { mutate: fetchHooks } = loadHooks
  useEffect(() => {
    if (loadHooksOnOpen) fetchHooks()
  }, [loadHooksOnOpen, fetchHooks])
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={event => {
        event.preventDefault()
        revise.mutate()
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('approval.subject')}
        <input
          className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
          value={subject}
          onChange={event => setSubject(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('approval.body')}
        <textarea
          className="min-h-32 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-2"
          value={body}
          onChange={event => setBody(event.target.value)}
        />
      </label>
      <Box className="flex flex-col gap-2">
        <Box>
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={loadHooks.isPending}
            onClick={() => loadHooks.mutate()}
          >
            {loadHooks.isPending ? t('approval.hooks.loading') : t('approval.hooks.button')}
          </Button>
        </Box>
        {hooks !== null && hooks.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('approval.hooks.none')}
          </Text>
        ) : null}
        {hooks !== null && hooks.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label={t('approval.hooks.listLabel')}>
            {hooks.map((hook, index) => (
              <li
                key={`${index}-${hook.text}`}
                className="flex flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-2"
              >
                <Text size="sm">{hook.text}</Text>
                {hook.anchor ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('approval.hooks.anchor', { hook: hook.anchor })}
                  </Text>
                ) : null}
                <Box>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setBody(hook.text)
                      setHooks(null)
                    }}
                  >
                    {t('approval.hooks.use')}
                  </Button>
                </Box>
              </li>
            ))}
          </ul>
        ) : null}
      </Box>
      <Box className="flex gap-2">
        <Button size="sm" type="submit" disabled={revise.isPending}>
          {t('approval.saveVersion')}
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={onDone}>
          {t('approval.cancelEdit')}
        </Button>
      </Box>
    </form>
  )
}

/**
 * #2366.5 — les appels à passer, avec LEUR état (douze, distincts de ceux du
 * message). Un appel n'est jamais rangé dans une vue de message.
 */
/** #2366.5 — `calls` vient du parent (remonté pour peser dans son silence, #2366.5 réfuté 23/09). */
function CallTasks({ calls }: { calls: readonly OutreachCallTask[] }) {
  const { t } = useTranslation('outreach')
  if (calls.length === 0) return null
  return (
    <Box className="flex flex-col gap-2">
      <Text element="h3" size="sm" weight="semibold">
        {t('approval.calls')}
      </Text>
      <ul className="flex flex-col gap-2">
        {calls.map(call => (
          <li key={call.id} className="flex flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-3">
            <Box className="flex flex-wrap items-center gap-2">
              <Text size="sm" weight="semibold">
                {call.contact_name ?? t('approval.unknownRecipient')}
              </Text>
              <Badge variant="outline" data-testid="outreach-call-status">
                {t(`callStatus.${call.status}`)}
              </Badge>
            </Box>
            <Text size="sm">{call.objective}</Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {call.reason}
            </Text>
            <CallTaskMoves call={call} />
          </li>
        ))}
      </ul>
    </Box>
  )
}

/**
 * #2366.5 — l'issue d'un appel se pose d'un geste. Les gestes offerts sont lus
 * à la table du serveur (`callTaskNextStatuses`) : un état terminal (qualifié,
 * refusé…) n'en offre aucun, et aucun statut inatteignable n'est proposé.
 */
function CallTaskMoves({ call }: { call: OutreachCallTask }) {
  const { t } = useTranslation('outreach')
  const queryClient = useQueryClient()
  const move = useMutation({
    mutationFn: (to: OutreachCallTaskStatus) =>
      outreachMessagesApi.transitionCall(call.id, { to, cause: t('approval.callMoveCause'), proof: null }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['outreach', 'call-tasks'] }),
    onError: () => toast.error(t('approval.callMoveError')),
  })
  const next = callTaskNextStatuses(call.status)
  if (next.length === 0) return null
  return (
    <Box className="flex flex-wrap gap-1 pt-1">
      {next.map(to => (
        <Button
          key={to}
          type="button"
          size="xs"
          variant="outline"
          disabled={move.isPending}
          className="rounded-full text-xs pointer-coarse:min-h-11"
          onClick={() => move.mutate(to)}
        >
          {t('approval.callMoveTo', { status: t(`callStatus.${to}`) })}
        </Button>
      ))}
    </Box>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box className="flex gap-1">
      <dt className="text-[var(--bellum-text-muted)]">{label}</dt>
      <dd>{value}</dd>
    </Box>
  )
}

/**
 * #2382.3 — gabarit source → version personnalisée → version finale. Chaque
 * étape surligne ce qui ENTRE et ce qui SORT ; une étape absente (pas de
 * gabarit, pas de retouche) ne fait aucune ligne.
 */
function VersionsDiff({ message }: { message: OutreachMessage }) {
  const { t } = useTranslation('outreach')
  const template = message.versions.find(v => v.kind === 'template')
  const personalized = message.versions.find(v => v.kind === 'personalized')
  const final = message.versions.at(-1)
  const steps: { key: string; from: string; to: string }[] = []
  if (template && personalized) steps.push({ key: 'personalization', from: template.body, to: personalized.body })
  if (personalized && final && final.version !== personalized.version) {
    steps.push({ key: 'userEdit', from: personalized.body, to: final.body })
  }
  return (
    <Box className="flex flex-col gap-2" data-testid="outreach-diff">
      {steps.map(step => (
        <Box key={step.key} className="flex flex-col gap-1">
          <Text size="sm" weight="semibold">
            {t(`approval.diff.${step.key}`)}
          </Text>
          <ul className="flex flex-col gap-0.5 text-sm">
            {outreachTextDiff(step.from, step.to).map((line, index) => (
              <li
                key={`${step.key}-${index}`}
                className={cn(
                  'rounded px-1',
                  line.op === 'added' && 'text-[var(--bellum-success-text)]',
                  line.op === 'removed' && 'text-[var(--danger-soft-text)] line-through',
                )}
              >
                {line.op !== 'same' ? <span className="sr-only">{t(`approval.diff.op.${line.op}`)} </span> : null}
                {line.op === 'added' ? '+ ' : line.op === 'removed' ? '− ' : ''}
                {line.text}
              </li>
            ))}
          </ul>
        </Box>
      ))}
    </Box>
  )
}
