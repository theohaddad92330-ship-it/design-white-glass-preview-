import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, GitBranch, Link2, Lock, LockOpen, UserRoundCog } from 'lucide-react'
import { Button, Input, SelectField, Text } from '@bellum/ui'
import { toast } from 'sonner'
import { isLegalHoldReviewOverdue } from '@bellum/contracts'
import {
  attachChatConversation,
  branchChatConversation,
  getChatConversation,
  setChatConversationLegalHold,
  setChatConversationOwner,
  type ChatConversationDetailView,
} from '@/features/chat/api/agentChatApi'
import { useWorkspaceMembers, type WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'

/**
 * #2430 — « Détails du fil » : ce que l'OBJET CONVERSATION porte (décision de
 * Louis, 22/09/2026 soir, §10), et les gestes qui l'écrivent.
 *
 *  · #2430.12 — le PROPRIÉTAIRE (qui l'a ouvert, ou à qui il a été transféré)
 *    et le transfert à un membre de l'espace ; le RATTACHEMENT au compte de la
 *    portée en cours, ou le détachement.
 *  · #2430.2  — « Explorer une autre hypothèse » ouvre un fil NEUF relié à
 *    celui-ci ; une branche montre le lien vers son fil d'origine.
 *  · #2430.10 — la CONSERVATION LÉGALE : lue par tous, posée ou levée par un
 *    gérant de l'espace ; sous conservation, le fil ne se retire pas.
 *  · #2430.11 — les VERSIONS figées partagées, par leur numéro et leur date.
 *
 * Chaque geste est un clic explicite, et chaque échec est DIT : aucune valeur
 * n'est supposée à l'écran avant que le serveur l'ait rendue. Le panneau ne lit
 * rien tant qu'il n'a pas été ouvert (même motif que `ParticipantsPanel`).
 */
function memberName(members: readonly WorkspaceMember[], userId: string | null, fallback: string): string {
  const member = members.find(entry => entry.userId === userId)
  return member?.fullName || member?.email || fallback
}

export function DetailsContent({ accountId, conversationId }: { accountId: string | null; conversationId: string }) {
  const { t, i18n } = useTranslation('chat')
  // #2075.29 — LE MÊME libellé que `commercialAudit.strategy.*`
  // (`AuditStrategyOptions.tsx`), jamais une seconde traduction (GA-26).
  const { t: tAudit } = useTranslation('commercialAudit')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const queryKey = ['chat', 'conversation', conversationId]
  const { data, isLoading, isError } = useQuery<ChatConversationDetailView, Error>({
    queryKey,
    queryFn: () => getChatConversation(conversationId),
    retry: false,
  })
  const members = useWorkspaceMembers().data ?? []
  const [nextOwner, setNextOwner] = useState('')
  const [busy, setBusy] = useState(false)
  // #2439.13 — « expliquer pourquoi » : la conservation légale exige une
  // raison à la pose, jamais à la levée.
  const [holdReason, setHoldReason] = useState('')
  // #2439.13 — le délai de revue : OPTIONNEL, DÉCLARÉ par le gérant, jamais deviné.
  const [holdReviewBy, setHoldReviewBy] = useState('')

  async function run(gesture: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await gesture()
      toast.success(success)
      await queryClient.invalidateQueries({ queryKey })
    } catch {
      toast.error(t('conversationObject.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function explore() {
    setBusy(true)
    try {
      const branch = await branchChatConversation(conversationId)
      toast.success(t('conversationObject.branch.done'))
      // La portée voyage avec la branche : même compte, fil neuf.
      await navigate({
        to: '/chat',
        search: { conversationId: branch.conversationId, ...(accountId ? { accountId } : {}) },
      })
    } catch {
      toast.error(t('conversationObject.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <Muted>{t('conversationObject.loading')}</Muted>
  // Un fil pas encore écrit n'a rien à décrire ; une lecture ratée se DIT.
  if (isError || !data) return <Muted>{t('conversationObject.unavailable')}</Muted>

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  const unknown = t('conversationObject.unknownMember')
  const transferable = members.filter(member => member.userId !== data.ownerUserId)

  return (
    <div className="space-y-3">
      {/* #2430.12 — le propriétaire, et d'où il vient. */}
      <section className="space-y-1.5">
        <Text element="p" size="sm">
          {data.ownerUserId
            ? t(`conversationObject.owner.${data.ownerSource}`, {
                name: memberName(members, data.ownerUserId, unknown),
              })
            : t('conversationObject.owner.none')}
        </Text>
        {transferable.length > 0 ? (
          <div className="flex items-center gap-2">
            <SelectField
              value={nextOwner}
              onChange={setNextOwner}
              ariaLabel={t('conversationObject.owner.pick')}
              placeholder={t('conversationObject.owner.pick')}
              options={transferable.map(member => ({
                value: member.userId,
                label: member.fullName || member.email || unknown,
              }))}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={UserRoundCog}
              disabled={!nextOwner || busy}
              onClick={() =>
                void run(() => setChatConversationOwner(conversationId, nextOwner), t('conversationObject.owner.done'))
              }
            >
              {t('conversationObject.owner.transfer')}
            </Button>
          </div>
        ) : null}
      </section>

      {/* #2430.12 — rattaché à un compte, ou pas. */}
      <section className="space-y-1.5">
        <Text element="p" size="sm">
          {data.attachedAccountId ? t('conversationObject.attach.attached') : t('conversationObject.attach.none')}
        </Text>
        {data.attachedAccountId ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(() => attachChatConversation(conversationId, null), t('conversationObject.attach.detached'))
            }
          >
            {t('conversationObject.attach.detach')}
          </Button>
        ) : accountId ? (
          <Button
            variant="ghost"
            size="sm"
            icon={Link2}
            disabled={busy}
            onClick={() =>
              void run(() => attachChatConversation(conversationId, accountId), t('conversationObject.attach.done'))
            }
          >
            {t('conversationObject.attach.toScope')}
          </Button>
        ) : null}
      </section>

      {/* #2430.2 — la branche : son origine, et en ouvrir une nouvelle. */}
      <section className="space-y-1.5">
        {data.parentConversationId ? (
          <Button
            variant="ghost"
            size="sm"
            icon={GitBranch}
            onClick={() =>
              void navigate({
                to: '/chat',
                search: { conversationId: data.parentConversationId ?? undefined, ...(accountId ? { accountId } : {}) },
              })
            }
          >
            {t('conversationObject.branch.openParent')}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" icon={GitBranch} disabled={busy} onClick={() => void explore()} fullWidth>
          {t('conversationObject.branch.explore')}
        </Button>
        <Muted>{t('conversationObject.branch.notice')}</Muted>
      </section>

      {/* #2430.10 / #2439.13 — la conservation légale, et sa raison. */}
      <section className="space-y-1.5">
        <Text element="p" size="sm">
          {data.legalHold
            ? t('conversationObject.legalHold.on', { date: dateFormat.format(new Date(data.legalHold.since)) })
            : t('conversationObject.legalHold.off')}
        </Text>
        {data.legalHold?.reason ? (
          <Muted>{t('conversationObject.legalHold.reason', { reason: data.legalHold.reason })}</Muted>
        ) : null}
        {data.legalHold?.reviewBy ? (
          <Text
            element="p"
            size="xs"
            className={
              isLegalHoldReviewOverdue(data.legalHold.reviewBy)
                ? 'flex items-center gap-1 text-[var(--danger-soft-text)]'
                : 'text-[var(--bellum-text-muted)]'
            }
          >
            {isLegalHoldReviewOverdue(data.legalHold.reviewBy) ? <AlertTriangle className="size-3.5 shrink-0" /> : null}
            {t(
              isLegalHoldReviewOverdue(data.legalHold.reviewBy)
                ? 'conversationObject.legalHold.reviewOverdue'
                : 'conversationObject.legalHold.reviewBy',
              { date: dateFormat.format(new Date(data.legalHold.reviewBy)) },
            )}
          </Text>
        ) : null}
        {data.canManage ? (
          data.legalHold ? (
            <Button
              variant="ghost"
              size="sm"
              icon={LockOpen}
              disabled={busy}
              onClick={() =>
                void run(
                  () => setChatConversationLegalHold(conversationId, false),
                  t('conversationObject.legalHold.lifted'),
                )
              }
            >
              {t('conversationObject.legalHold.lift')}
            </Button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  value={holdReason}
                  onChange={event => setHoldReason(event.target.value)}
                  placeholder={t('conversationObject.legalHold.reasonPlaceholder')}
                  aria-label={t('conversationObject.legalHold.reasonLabel')}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Lock}
                  disabled={busy || !holdReason.trim()}
                  onClick={() =>
                    void run(
                      () =>
                        setChatConversationLegalHold(
                          conversationId,
                          true,
                          holdReason.trim(),
                          holdReviewBy ? `${holdReviewBy}T00:00:00.000Z` : undefined,
                        ),
                      t('conversationObject.legalHold.placed'),
                    ).then(() => {
                      setHoldReason('')
                      setHoldReviewBy('')
                    })
                  }
                >
                  {t('conversationObject.legalHold.place')}
                </Button>
              </div>
              {/* #2439.13 — OPTIONNEL : une conservation sans date de revue reste posée
                  jusqu'à la levée manuelle, exactement comme avant ce champ. */}
              <Input
                type="date"
                value={holdReviewBy}
                onChange={event => setHoldReviewBy(event.target.value)}
                aria-label={t('conversationObject.legalHold.reviewByLabel')}
                className="w-full"
              />
            </div>
          )
        ) : null}
      </section>

      {/* #2075.29 / #2075.30 — CE QUE L'AUDIT DISAIT à l'ouverture du fil
          depuis lui : figé, jamais relu depuis l'audit courant (voir le
          docblock d'`attachAuditSnapshot`). `null` = ce fil ne vient pas de
          l'audit : aucune ligne, comme les versions figées ci-dessous. */}
      {data.auditSnapshot ? (
        <section className="space-y-1.5">
          <Text element="p" size="xs" weight="semibold">
            {t('conversationObject.auditSnapshot.title')}
          </Text>
          <Muted>
            {t('conversationObject.auditSnapshot.version', {
              version: data.auditSnapshot.auditVersion ?? t('conversationObject.auditSnapshot.versionUnknown'),
            })}
          </Muted>
          {data.auditSnapshot.strategy ? (
            <Muted>
              {t('conversationObject.auditSnapshot.strategy', {
                strategy: tAudit(`strategy.${data.auditSnapshot.strategy}`),
              })}
            </Muted>
          ) : null}
          {data.auditSnapshot.firstActions.length > 0 ? (
            <div className="space-y-0.5">
              <Muted>{t('conversationObject.auditSnapshot.firstActionsTitle')}</Muted>
              <ul className="space-y-0.5">
                {data.auditSnapshot.firstActions.map(action => (
                  <li key={action}>
                    <Muted>{action}</Muted>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* #1904.6 / doctrine — une inconnue se NOMME, elle ne devient
              jamais un « 0 » : aucune ligne quand la liste est vide. */}
          {data.auditSnapshot.unknowns.length > 0 ? (
            <div className="space-y-0.5">
              <Muted>{t('conversationObject.auditSnapshot.unknownsTitle')}</Muted>
              <ul className="space-y-0.5">
                {data.auditSnapshot.unknowns.map(unknown => (
                  <li key={unknown}>
                    <Muted>{unknown}</Muted>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* #2430.11 — les versions figées partagées. Aucune : aucune ligne. */}
      {data.versions.length > 0 ? (
        <section className="space-y-1">
          <Text element="p" size="xs" weight="semibold">
            {t('conversationObject.versions.title')}
          </Text>
          <ul className="space-y-0.5">
            {data.versions.map(version => (
              <li key={version.version}>
                <Muted>
                  {t('conversationObject.versions.item', {
                    version: version.version,
                    date: dateFormat.format(new Date(version.upToAt)),
                  })}
                </Muted>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function Muted({ children }: { children: string }) {
  return (
    <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
      {children}
    </Text>
  )
}
