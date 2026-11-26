import type { ManagerMemberStats, TeamComment } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FilterChips,
  SelectField,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountsCache } from '@/features/accounts/hooks/useAccountsInfiniteScroll'
import { useCreateTeamComment, useSetTeamCommentResolution, useTeamComments } from '../../hooks/useTeamComments'

const FIELD =
  'w-full resize-y rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2 text-sm text-[var(--bellum-text-primary)] disabled:opacity-60'

/**
 * Activité & échanges › Échanges d'équipe — Théo D team-activite (« Les sujets ouverts »).
 *
 * Le fil de commentaires d'équipe de l'espace : rien d'inventé, que du texte réellement écrit,
 * l'auteur et l'horodatage réels. Chaque sujet est une carte (auteur, date, statut « À discuter »
 * / « Résolu », texte, compte lié, collègues mentionnés), avec « Répondre » et « Marquer résolu »
 * — les MÊMES portes que le fil du compte (`/team-comments`, `parent_comment_id`, `resolution`).
 * « Partager un point » ouvre la fenêtre de Théo : le point, le compte concerné, les mentions.
 *
 * Les conversations privées ne sont pas agrégées : seul ce fil d'équipe est lu ici.
 * Masqué tant que la requête n'a pas abouti (deploy-skew : pas de bloc vide dessiné).
 */
export function TeamCommentsPanel({ members = [] }: { members?: ManagerMemberStats[] }) {
  const { t } = useTranslation('manager')
  const comments = useTeamComments()
  if (!comments.isSuccess) return null

  const items = comments.data.items
  const topics = items.filter(comment => !comment.parent_comment_id)
  const repliesOf = (id: string) => items.filter(comment => comment.parent_comment_id === id)

  return (
    <section aria-label={t('teamComments.region')} data-board-block="exchanges" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--bellum-text-primary)]">{t('teamComments.title')}</h2>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('teamComments.subtitle')}
          </Text>
        </div>
        <ShareDialog members={members} />
      </div>

      {topics.length === 0 ? (
        <Text size="sm" data-testid="team-comments-empty" className="text-[var(--bellum-text-secondary)]">
          {t('teamComments.empty')}
        </Text>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {topics.map(topic => (
            <li key={topic.id}>
              <TopicCard topic={topic} replies={repliesOf(topic.id)} members={members} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TopicCard({
  topic,
  replies,
  members,
}: {
  topic: TeamComment
  replies: TeamComment[]
  members: ManagerMemberStats[]
}) {
  const { t, i18n } = useTranslation('manager')
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const resolution = useSetTeamCommentResolution()
  const resolved = !!topic.resolved_at
  const author = topic.author_name ?? t('activity.unknownMember')
  const mentioned = topic.mentioned_user_ids
    .map(id => members.find(member => member.user_id === id)?.name)
    .filter((name): name is string => !!name)

  return (
    <article
      data-topic={topic.id}
      className="flex h-full flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
          >
            {author.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-semibold text-[var(--bellum-text-primary)]">{author}</strong>
            <small className="block text-xs text-[var(--bellum-text-muted)]">
              {new Date(topic.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </small>
          </span>
        </div>
        <span
          className={`inline-flex min-h-6 shrink-0 items-center rounded-badge border px-2 text-xs font-medium ${
            resolved
              ? 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
              : 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
          }`}
        >
          {resolved ? t('teamComments.status.resolved') : t('teamComments.status.open')}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-[var(--bellum-text-primary)]">{topic.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        {topic.account_id && topic.company_name ? (
          <Link
            to="/accounts/$id"
            params={{ id: topic.account_id }}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {topic.company_name}
          </Link>
        ) : null}
        {mentioned.map(name => (
          <span key={name} className="text-xs font-medium text-[var(--accent-soft-text)]">
            {`@${name}`}
          </span>
        ))}
      </div>
      {replies.length > 0 ? (
        <ul aria-label={t('teamComments.replies')} className="space-y-2 border-l-2 border-[var(--bellum-border)] pl-3">
          {replies.map(reply => (
            <li key={reply.id} className="text-sm">
              <span className="font-medium text-[var(--bellum-text-primary)]">
                {reply.author_name ?? t('activity.unknownMember')}
              </span>{' '}
              <span className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">{reply.body}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--bellum-border)] pt-3">
        <ReplyDialog topic={topic} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={resolution.isPending}
          onClick={() => resolution.mutate({ id: topic.id, resolved: !resolved })}
        >
          {resolved ? t('teamComments.reopen') : t('teamComments.resolve')}
        </Button>
      </div>
    </article>
  )
}

/** « Répondre » — la réponse s'accroche au sujet (`parent_comment_id`), rien d'autre ne part. */
function ReplyDialog({ topic }: { topic: TeamComment }) {
  const { t } = useTranslation(['manager', 'common'])
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const create = useCreateTeamComment()
  const submit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    create.mutate(
      { body: trimmed, parent_comment_id: topic.id },
      {
        onSuccess: () => {
          setBody('')
          setOpen(false)
        },
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11">
          {t('manager:teamComments.reply')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manager:teamComments.replyTitle')}</DialogTitle>
          <DialogDescription className="line-clamp-3 whitespace-pre-wrap">{topic.body}</DialogDescription>
        </DialogHeader>
        <textarea
          value={body}
          rows={4}
          maxLength={2000}
          disabled={create.isPending}
          aria-label={t('manager:teamComments.replyLabel')}
          onChange={event => setBody(event.target.value)}
          className={FIELD}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending || body.trim().length === 0}>
            {t('manager:teamComments.replySend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Partager un point » — Théo `dlg-share` : le point, le compte concerné, les collègues à mentionner. */
function ShareDialog({ members }: { members: ManagerMemberStats[] }) {
  const { t } = useTranslation(['manager', 'common'])
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [accountId, setAccountId] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const create = useCreateTeamComment()
  const accounts = useAccountsCache(useAccounts({ limit: 100 }).data)

  const submit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    create.mutate(
      {
        body: trimmed,
        ...(accountId ? { account_id: accountId } : {}),
        ...(mentions.length > 0 ? { mentioned_user_ids: mentions } : {}),
      },
      {
        onSuccess: () => {
          setBody('')
          setAccountId('')
          setMentions([])
          setOpen(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11 shrink-0">
          {t('manager:teamComments.share')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manager:teamComments.shareTitle')}</DialogTitle>
          <DialogDescription>{t('manager:teamComments.shareBody')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('manager:teamComments.inputLabel')}
            </span>
            <textarea
              value={body}
              rows={4}
              maxLength={2000}
              disabled={create.isPending}
              placeholder={t('manager:teamComments.placeholder')}
              onChange={event => setBody(event.target.value)}
              className={FIELD}
            />
          </label>
          <div className="space-y-1">
            <span className="block text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('manager:teamComments.accountLabel')}
            </span>
            <SelectField
              value={accountId}
              ariaLabel={t('manager:teamComments.accountLabel')}
              options={[
                { value: '', label: t('manager:teamComments.noAccount') },
                ...accounts.map(account => ({ value: account.id, label: account.company_name })),
              ]}
              onChange={setAccountId}
            />
          </div>
          {members.length > 0 ? (
            <FilterChips
              multiple
              size="sm"
              legend={t('manager:teamComments.mentionLabel')}
              ariaLabel={t('manager:teamComments.mentionLabel')}
              options={members.map(member => ({ value: member.user_id, label: member.name }))}
              values={mentions}
              onToggle={value =>
                setMentions(prev => (prev.includes(value) ? prev.filter(id => id !== value) : [...prev, value]))
              }
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending || body.trim().length === 0}>
            {create.isPending ? t('manager:teamComments.sharing') : t('manager:teamComments.shareSend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
