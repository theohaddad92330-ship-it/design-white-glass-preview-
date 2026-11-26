import { Badge, Box, Button, Card, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamComment } from '@bellum/contracts'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useCreateTeamComment, useTeamComments } from '@/features/manager/hooks/useTeamComments'
import { useResolveTeamTopic } from '@/features/team-activity/hooks/useTeamThreads'
import { useTeam } from '@/features/team/hooks/useTeam'

const FIELD_CLASS =
  'w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 py-2 text-sm text-[var(--bellum-text-primary)]'

function Topic({
  root,
  replies,
  nameOf,
}: {
  root: TeamComment
  replies: TeamComment[]
  nameOf: (id: string) => string
}) {
  const { t, i18n } = useTranslation('teamActivity')
  const resolve = useResolveTeamTopic()
  const reply = useCreateTeamComment()
  const [replying, setReplying] = useState(false)
  const [body, setBody] = useState('')
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const resolved = root.resolved_at !== null

  const send = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    reply.mutate(
      { body: trimmed, parent_comment_id: root.id },
      {
        onSuccess: () => {
          setBody('')
          setReplying(false)
        },
      },
    )
  }

  return (
    <Card className="p-4">
      <article className="space-y-2">
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Text size="sm" weight="semibold">
            {root.author_name ?? t('unknownMember')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {new Date(root.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
          <Badge variant={resolved ? 'secondary' : 'info'} className="text-xs">
            {resolved ? t('discussions.resolved') : t('discussions.toDiscuss')}
          </Badge>
        </Box>
        <Text size="sm" className="whitespace-pre-wrap">
          {root.body}
        </Text>
        <Box display="flex" className="flex-wrap items-center gap-3">
          {root.account_id && root.company_name && (
            <Link
              to="/accounts/$id"
              params={{ id: root.account_id }}
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              {root.company_name}
            </Link>
          )}
          {root.mentioned_user_ids.map(id => (
            <Text key={id} size="sm" color="text-[var(--bellum-text-secondary)]">
              @{nameOf(id)}
            </Text>
          ))}
        </Box>
        {replies.length > 0 && (
          <ul className="space-y-2 border-l border-[var(--bellum-border)] pl-3">
            {replies.map(item => (
              <li key={item.id}>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {item.author_name ?? t('unknownMember')} ·{' '}
                  {new Date(item.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </Text>
                <Text size="sm" className="whitespace-pre-wrap">
                  {item.body}
                </Text>
              </li>
            ))}
          </ul>
        )}
        {replying && (
          <Box className="space-y-2">
            <textarea
              className={FIELD_CLASS}
              rows={2}
              maxLength={2000}
              aria-label={t('discussions.replyLabel')}
              value={body}
              onChange={event => setBody(event.target.value)}
            />
            <Button className="min-h-11" onClick={send} disabled={reply.isPending || body.trim().length === 0}>
              {t('discussions.sendReply')}
            </Button>
          </Box>
        )}
        <Box display="flex" className="flex-wrap gap-2">
          {!replying && (
            <Button variant="secondary" className="min-h-11" onClick={() => setReplying(true)}>
              {t('discussions.reply')}
            </Button>
          )}
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => resolve.mutate({ id: root.id, resolved: !resolved })}
          >
            {resolved ? t('discussions.reopen') : t('discussions.markResolved')}
          </Button>
        </Box>
      </article>
    </Card>
  )
}

/**
 * Théo D team-activite.R2 / N2 — « Échanges d'équipe » : les sujets ouverts de l'espace. Le moteur
 * existe (`/team-comments` : racine, réponses, @mention, compte lié, résolu) ; cet écran le range en
 * sujets à état. Les conversations privées ne sont jamais agrégées ici.
 */
export function TeamDiscussions() {
  const { t } = useTranslation('teamActivity')
  const comments = useTeamComments()
  const share = useCreateTeamComment()
  const { team } = useTeam()
  const [composing, setComposing] = useState(false)
  const [body, setBody] = useState('')
  const [mention, setMention] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const members = team?.members ?? []
  const nameOf = (id: string) => members.find(member => member.userId === id)?.fullName ?? t('unknownMember')

  const { open, resolved, repliesOf } = useMemo(() => {
    const items = comments.data?.items ?? []
    const roots = items.filter(item => item.parent_comment_id === null)
    const byParent = new Map<string, TeamComment[]>()
    for (const item of items) {
      if (item.parent_comment_id) {
        byParent.set(item.parent_comment_id, [...(byParent.get(item.parent_comment_id) ?? []), item])
      }
    }
    return {
      open: roots.filter(root => root.resolved_at === null),
      resolved: roots.filter(root => root.resolved_at !== null),
      repliesOf: (id: string) => (byParent.get(id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }
  }, [comments.data])

  const submit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    share.mutate(
      { body: trimmed, ...(mention ? { mentioned_user_ids: [mention] } : {}) },
      {
        onSuccess: () => {
          setBody('')
          setMention('')
          setComposing(false)
        },
      },
    )
  }

  const shown = showResolved ? [...open, ...resolved] : open

  return (
    <section className="space-y-4" aria-label={t('discussions.title')}>
      <Box display="flex" className="flex-wrap items-start justify-between gap-3">
        <Box>
          <Text element="h2" size="xl" weight="bold">
            {t('discussions.title')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('discussions.subtitle')}
          </Text>
        </Box>
        <Button className="min-h-11" onClick={() => setComposing(value => !value)}>
          {t('discussions.share')}
        </Button>
      </Box>

      {composing && (
        <Card className="space-y-3 p-4">
          <label className="block space-y-1">
            <Text size="sm" weight="medium">
              {t('discussions.pointLabel')}
            </Text>
            <textarea
              className={FIELD_CLASS}
              rows={3}
              maxLength={2000}
              placeholder={t('discussions.pointPlaceholder')}
              value={body}
              onChange={event => setBody(event.target.value)}
            />
          </label>
          <SelectField
            value={mention}
            ariaLabel={t('discussions.mentionLabel')}
            emptyOption={{ label: t('discussions.nobody') }}
            options={members.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? t('unknownMember'),
            }))}
            onChange={setMention}
          />
          <Button className="min-h-11" onClick={submit} disabled={share.isPending || body.trim().length === 0}>
            {t('discussions.submit')}
          </Button>
        </Card>
      )}

      {comments.isError && <ScreenState state="error" message={t('errors.load')} />}
      {comments.isLoading && <ScreenState state="loading" message={t('states.loading')} />}
      {comments.isSuccess && shown.length === 0 && (
        <ScreenState
          state="empty_never"
          title={t('discussions.emptyTitle')}
          message={t('discussions.empty')}
          action={{ label: t('discussions.emptyAction'), onClick: () => setComposing(true) }}
        />
      )}
      <div className="space-y-3">
        {shown.map(root => (
          <Topic key={root.id} root={root} replies={repliesOf(root.id)} nameOf={nameOf} />
        ))}
      </div>
      {resolved.length > 0 && (
        <Button
          variant="secondary"
          className="min-h-11"
          aria-pressed={showResolved}
          onClick={() => setShowResolved(value => !value)}
        >
          {showResolved ? t('discussions.hideResolved') : t('discussions.showResolved', { count: resolved.length })}
        </Button>
      )}
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('discussions.privacy')}
      </Text>
    </section>
  )
}
