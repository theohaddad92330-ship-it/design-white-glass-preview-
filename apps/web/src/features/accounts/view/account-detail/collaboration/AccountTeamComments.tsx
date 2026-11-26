import { Button, FilterChips, Text } from '@bellum/ui'
import type { TeamComment } from '@bellum/contracts'
import { MessagesSquare } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountTeamComments, useCreateAccountTeamComment } from '../../../hooks/useAccountTeamComments'
import { useMyOpenThreads, useReplyToThread, useSetThreadResolution } from '../../../hooks/useTeamThreads'
import { useWorkspaceMembers, type WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'

type NamedMember = WorkspaceMember & { fullName: string }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Le token `@partiel` qui précède le curseur, s'il y en a un. */
const MENTION_TOKEN = /(?:^|\s)@([^\s@]*)$/

function activeMentionQuery(text: string, caret: number): string | null {
  const match = MENTION_TOKEN.exec(text.slice(0, caret))
  return match ? match[1] : null
}

/** Remplace le token `@partiel` actif par `@NomComplet `, curseur juste après. */
function insertMention(text: string, caret: number, fullName: string): { text: string; caret: number } {
  const before = text.slice(0, caret)
  const match = MENTION_TOKEN.exec(before)
  if (!match) return { text, caret }
  const atIndex = match.index + match[0].indexOf('@')
  const head = text.slice(0, atIndex)
  const tail = text.slice(caret)
  const mention = `@${fullName} `
  return { text: head + mention + tail, caret: (head + mention).length }
}

/**
 * Les collègues réellement NOMMÉS `@NomComplet` dans le texte — lu depuis le
 * texte lui-même, jamais une liste d'ids à part qui pourrait dériver : éditer
 * ou effacer la mention l'enlève naturellement, sans état à resynchroniser.
 */
function extractMentionedUserIds(body: string, members: readonly NamedMember[]): string[] {
  return members
    .filter(member => new RegExp(`(?:^|\\s)@${escapeRegExp(member.fullName)}(?:\\s|$)`).test(body))
    .map(member => member.userId)
}

/** Rend le corps d'un commentaire, les mentions confirmées mises en évidence. */
function renderCommentBody(body: string, mentionedUserIds: readonly string[], members: readonly NamedMember[]) {
  const names = members.filter(member => mentionedUserIds.includes(member.userId)).map(member => member.fullName)
  if (names.length === 0) return body
  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g')
  return body.split(pattern).map((part, index) =>
    names.some(name => part === `@${name}`) ? (
      <Text key={index} element="span" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {part}
      </Text>
    ) : (
      part
    ),
  )
}

/**
 * #2914 (#2128.10, #2128.9) — LE FIL DE COMMENTAIRES D'UN COMPTE, ENFIN SUR LA FICHE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aucune mention, aucun fil de commentaire ni partage de section interne sur
 * la fiche compte » (#2914). `TeamCommentEntity.account_id` existait, le
 * cockpit manager savait déjà ÉCRIRE un commentaire rattaché à un compte
 * (`TeamCommentsPanel.tsx`) — mais RIEN ne permettait de le RELIRE depuis la
 * fiche de CE compte : il se noyait dans le fil général de l'espace. Cette
 * section referme cette moitié — la lecture ET l'écriture, scopées.
 *
 * #2128.9 — mentionner un collègue. Le backend `mentioned_user_ids` existait
 * déjà (migration `1796321387113-TeamCommentsMentions`, re-vérifié côté
 * serveur comme membres de l'espace) mais AUCUN composant ne le composait :
 * ce fichier tapait un texte libre, jamais une mention. Ce lot compose la
 * mention ICI — autocomplétion sur `useWorkspaceMembers` (le même registre que
 * « Attribuer », `ContactAssignControl`), envoi des ids extraits du texte tapé
 * (jamais un id retenu qui ne serait plus nommé dans le corps), rendu en
 * évidence des mentions confirmées côté serveur.
 *
 * ⚠️ CE QUE CE LOT NE FAIT PAS (à dessein, hors périmètre borné) : notifier le
 * collègue mentionné (aucun système de notification n'existe pour ce fil) et
 * partager UNE SECTION précise du dossier (#2128.11 — livré séparément,
 * `AccountShareSection`). La mention reste ce qu'elle EST aujourd'hui : un
 * lien nommé dans le texte, jamais confondue avec une alerte envoyée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLACEMENT — dans l'onglet Historique, pas un onglet de plus
 * ─────────────────────────────────────────────────────────────────────────────
 * Même arbitrage que les deux sections ajoutées à l'onglet « Conditions
 * commerciales » des missions (#2930) : le dossier porte déjà plus de dix
 * onglets, et le mobile en tolère quatre avant que les cibles ne passent sous
 * 44 px. Une SECTION de plus dans un onglet existant, jamais un onglet de plus.
 *
 * Masquée tant que la requête n'a pas abouti — une API antérieure au module
 * (déploiement en cours) n'a pas encore l'endpoint : on ne dessine pas un
 * cadre vide. Une lecture en ÉCHEC le DIT (jamais confondue avec « aucun
 * commentaire »).
 */
export function AccountTeamComments({ accountId }: { accountId: string }) {
  const { t, i18n } = useTranslation('accounts')
  const comments = useAccountTeamComments(accountId)
  const create = useCreateAccountTeamComment(accountId)
  const namedMembers: NamedMember[] = (useWorkspaceMembers().data ?? []).filter(
    (member): member is NamedMember => !!member.fullName,
  )
  // #4158.31 — fils d'équipe : « mes fils ouverts », résoudre / rouvrir, répondre.
  const [onlyMine, setOnlyMine] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const myThreads = useMyOpenThreads(onlyMine)
  const resolution = useSetThreadResolution(accountId)
  const reply = useReplyToThread(accountId)
  const [body, setBody] = useState('')
  const [caret, setCaret] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  if (comments.isError) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('historyProofs.teamComments.loadError')}
      </Text>
    )
  }
  if (!comments.isSuccess) return null

  const all = comments.data.items
  // Un fil = une racine + ses réponses (du plus ancien au plus récent, comme le serveur les rend).
  const repliesOf = (rootId: string) => all.filter(comment => comment.parent_comment_id === rootId)
  const items: TeamComment[] = onlyMine
    ? (myThreads.data?.items ?? [])
    : all.filter(comment => !comment.parent_comment_id)
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'

  const mentionQuery = activeMentionQuery(body, caret)
  const suggestions =
    mentionQuery === null
      ? []
      : namedMembers
          .filter(member => member.fullName.toLocaleLowerCase().includes(mentionQuery.toLocaleLowerCase()))
          .slice(0, 5)

  const trackCaret = (event: { currentTarget: HTMLTextAreaElement }) =>
    setCaret(event.currentTarget.selectionStart ?? 0)

  const selectMention = (member: NamedMember) => {
    const next = insertMention(body, caret, member.fullName)
    setBody(next.text)
    setCaret(next.caret)
    const node = textareaRef.current
    if (node) {
      node.focus()
      node.setSelectionRange(next.caret, next.caret)
    }
  }

  const submit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    const mentionedUserIds = extractMentionedUserIds(trimmed, namedMembers)
    create.mutate(
      { body: trimmed, ...(mentionedUserIds.length > 0 ? { mentioned_user_ids: mentionedUserIds } : {}) },
      { onSuccess: () => setBody('') },
    )
  }

  return (
    <section aria-label={t('historyProofs.teamComments.title')} className="space-y-2">
      <div className="flex items-center gap-2">
        <MessagesSquare className="size-4 text-[var(--bellum-text-muted)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('historyProofs.teamComments.title')}
        </Text>
      </div>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('historyProofs.teamComments.subtitle')}
      </Text>

      <FilterChips
        ariaLabel={t('historyProofs.teamComments.title')}
        options={[
          { value: 'all', label: t('historyProofs.teamComments.filterAll') },
          { value: 'mine', label: t('historyProofs.teamComments.filterMine') },
        ]}
        value={onlyMine ? 'mine' : 'all'}
        onChange={value => setOnlyMine(value === 'mine')}
      />

      <div>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            disabled={create.isPending}
            rows={2}
            maxLength={2000}
            aria-label={t('historyProofs.teamComments.inputLabel')}
            placeholder={t('historyProofs.teamComments.placeholder')}
            onChange={event => {
              setBody(event.target.value)
              trackCaret(event)
            }}
            onClick={trackCaret}
            onKeyUp={trackCaret}
            className="w-full resize-y rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm text-[var(--bellum-text-primary)] disabled:opacity-60"
          />
          {suggestions.length > 0 ? (
            <ul
              role="listbox"
              aria-label={t('historyProofs.teamComments.mentionSuggestions')}
              className="absolute z-picker mt-1 w-full overflow-hidden rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] shadow-md"
            >
              {suggestions.map(member => (
                <li key={member.userId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => selectMention(member)}
                    className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]"
                  >
                    {member.fullName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" onClick={submit} disabled={create.isPending || body.trim().length === 0}>
            {create.isPending ? t('historyProofs.teamComments.sharing') : t('historyProofs.teamComments.share')}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {onlyMine ? t('historyProofs.teamComments.noMine') : t('historyProofs.teamComments.empty')}
        </Text>
      ) : (
        <ul className="space-y-3">
          {items.map(comment => (
            <li
              key={comment.id}
              className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Text size="sm" weight="medium">
                  {comment.author_name ?? t('historyProofs.teamComments.unknownMember')}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {new Date(comment.created_at).toLocaleDateString(locale)}
                </Text>
              </div>
              {onlyMine && comment.company_name ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('historyProofs.teamComments.onAccount', { company: comment.company_name })}
                </Text>
              ) : null}
              <Text size="sm" className="mt-1 whitespace-pre-wrap text-[var(--bellum-text-primary)]">
                {renderCommentBody(comment.body, comment.mentioned_user_ids ?? [], namedMembers)}
              </Text>
              {onlyMine
                ? null
                : repliesOf(comment.id).map(replyItem => (
                    <div key={replyItem.id} className="mt-2 border-l-2 border-[var(--bellum-border)] pl-3">
                      <Text size="xs" weight="medium">
                        {replyItem.author_name ?? t('historyProofs.teamComments.unknownMember')} ·{' '}
                        {new Date(replyItem.created_at).toLocaleDateString(locale)}
                      </Text>
                      <Text size="sm" className="whitespace-pre-wrap text-[var(--bellum-text-primary)]">
                        {renderCommentBody(replyItem.body, replyItem.mentioned_user_ids ?? [], namedMembers)}
                      </Text>
                    </div>
                  ))}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {comment.resolved_at ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('historyProofs.teamComments.resolvedOn', {
                      date: new Date(comment.resolved_at).toLocaleDateString(locale),
                    })}
                  </Text>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={resolution.isPending}
                  onClick={() => resolution.mutate({ id: comment.id, resolved: !comment.resolved_at })}
                >
                  {comment.resolved_at
                    ? t('historyProofs.teamComments.reopen')
                    : t('historyProofs.teamComments.resolve')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyingTo(replyingTo === comment.id ? null : comment.id)
                    setReplyBody('')
                  }}
                >
                  {t('historyProofs.teamComments.reply')}
                </Button>
              </div>
              {replyingTo === comment.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={replyBody}
                    rows={2}
                    maxLength={2000}
                    aria-label={t('historyProofs.teamComments.replyLabel')}
                    onChange={event => setReplyBody(event.target.value)}
                    className="w-full resize-y rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm text-[var(--bellum-text-primary)]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                      {t('historyProofs.teamComments.replyCancel')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={reply.isPending || replyBody.trim().length === 0}
                      onClick={() =>
                        reply.mutate(
                          { parentId: comment.id, body: replyBody.trim() },
                          { onSuccess: () => setReplyingTo(null) },
                        )
                      }
                    >
                      {t('historyProofs.teamComments.replySend')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
