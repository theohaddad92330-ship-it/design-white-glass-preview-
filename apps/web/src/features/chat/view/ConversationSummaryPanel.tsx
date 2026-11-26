import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversationSummaryView } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { useConversationSummary, useCorrectConversationSummary } from '@/features/memory/hooks/useConversationSummary'

/**
 * #1955.30 / #1955.31 — LE RÉSUMÉ ROULANT DU FIL OUVERT, DANS `/chat`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le résumé (`conversation_summaries`, tome 6 §12.1) était déjà LISIBLE — mais
 * seulement dans Réglages › Mémoire de Laura (le registre, `GET /memory/ledger`),
 * jamais à l'endroit où la personne travaille. Ce panneau ne duplique pas le
 * registre : il lit CE fil précis (`GET /memory/summary`), là où on le lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « AUCUN RÉSUMÉ » N'EST PAS UNE ERREUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fil qui vient de s'ouvrir n'a pas encore de résumé — ce n'est pas absent
 * par panne, c'est absent parce que rien n'a encore été échangé. Le bouton
 * « Modifier » n'apparaît donc QUE si un résumé existe déjà : corriger un
 * résumé qui n'existe pas inventerait une mémoire (le serveur le refuse par un
 * 404, doctrine « JAMAIS de donnée fictive »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE `useQuery` EST DANS UN COMPOSANT À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce déclencheur est monté sur TOUT `/chat` (`ChatHeader`) — la même situation
 * que #1791.1 (`useConnectedCapabilities`) : « un hook RÉSEAU posé dans un
 * composant monté sur presque tout le produit fait tomber des tests qui ne
 * parlent pas de son sujet » (voir le commentaire de tête de
 * `demo-runs-the-real-shell.test.tsx`). `ConversationSummaryContent`
 * n'est rendu qu'après un premier clic (`open`) : les dizaines de tests qui
 * montent `<Chat />` sans `QueryClientProvider` — et sans jamais ouvrir ce
 * popover — ne construisent jamais ce sous-arbre, donc n'appellent jamais
 * `useQueryClient()`.
 */
export function ConversationSummaryContent({
  accountId,
  conversationId,
  sources,
  mailboxRead = false,
}: {
  accountId: string | null
  conversationId: string | null
  sources: readonly { kind: string; label: string; replies: number }[]
  /** #5032.9 — Laura a lu un fil de la messagerie de CE lecteur dans ce fil (voir `threadMailboxRead`). */
  mailboxRead?: boolean
}) {
  const { t, i18n } = useTranslation('chat')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const fieldId = useId()

  const query = useConversationSummary({ accountId, conversationId, enabled: true })
  const correct = useCorrectConversationSummary({ accountId, conversationId })

  function openEdit() {
    setDraft(query.data?.summary ?? '')
    setEditing(true)
  }

  function save() {
    const text = draft.trim()
    if (!text) return
    correct.mutate(text, { onSuccess: () => setEditing(false) })
  }

  // #5032.9 — « Laura a lu ce fil » vit ICI (panneau latéral), jamais dans le fil. Sans lecture : aucune ligne.
  const mailboxLine = mailboxRead ? (
    <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]" data-mailbox-read-panel>
      {t('summary.mailboxRead')}
    </Text>
  ) : null

  if (query.isLoading) {
    return (
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('summary.loading')}
      </Text>
    )
  }

  if (query.isError) {
    // « Non mesuré n'est jamais 0 » : une lecture ratée dit qu'elle a raté,
    // elle ne se lit jamais comme « aucun résumé ».
    return (
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('summary.loadFailed')}
      </Text>
    )
  }

  if (editing) {
    return (
      <Box className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
          {t('summary.editLabel')}
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={5}
          maxLength={2000}
          className="min-h-11 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2.5 py-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        />
        <Box className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!draft.trim() || correct.isPending} onClick={save}>
            {t('summary.save')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
            {t('summary.cancel')}
          </Button>
        </Box>
      </Box>
    )
  }

  if (!query.data) {
    return (
      <Box className="flex flex-col gap-2">
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('summary.empty')}
        </Text>
        <SummarySections sections={null} sources={sources} />
        {mailboxLine}
      </Box>
    )
  }

  return (
    <Box className="flex flex-col gap-2">
      <Text element="p" size="sm" className="whitespace-pre-line break-words">
        {query.data.summary}
      </Text>
      <SummarySections sections={query.data.sections ?? null} sources={sources} />
      {mailboxLine}
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('summary.updatedAt', {
          date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(query.data.updatedAt),
          ),
        })}
      </Text>
      <Button variant="secondary" size="sm" onClick={openEdit} className="self-start">
        {t('summary.edit')}
      </Button>
    </Box>
  )
}

type Sections = NonNullable<ConversationSummaryView>['sections']

/**
 * #1955.24-.29 — le résumé PAR CATÉGORIE : décisions prises, objets concernés,
 * actions en attente, corrections, questions posées, sources principales.
 * Chaque ligne vient d'un champ réel (l'état structuré du fil, ou les sources
 * citées par les réponses) ; une catégorie vide ne fait AUCUNE ligne — pas
 * même son titre (« on n'affiche pas ce qu'on n'a pas »).
 */
function SummarySections({
  sections,
  sources,
}: {
  sections: Sections | null
  sources: readonly { kind: string; label: string; replies: number }[]
}) {
  const { t } = useTranslation('chat')
  const groups: { key: string; title: string; items: string[] }[] = [
    { key: 'decisions', title: t('summary.sections.decisions'), items: sections?.decisions ?? [] },
    {
      key: 'objects',
      title: t('summary.sections.objects'),
      items: (sections?.objects ?? []).map(object => object.label),
    },
    {
      key: 'pending',
      title: t('summary.sections.pending'),
      items: (sections?.pendingActions ?? []).map(entry =>
        entry.target ? t('summary.sections.pendingOn', { action: entry.action, target: entry.target }) : entry.action,
      ),
    },
    {
      key: 'corrections',
      title: t('summary.sections.corrections'),
      items: (sections?.corrections ?? []).map(entry =>
        t(entry.reason ? `summary.sections.${entry.kind}WithReason` : `summary.sections.${entry.kind}`, {
          text: entry.text,
          reason: entry.reason ?? '',
        }),
      ),
    },
    { key: 'questions', title: t('summary.sections.questions'), items: sections?.questions ?? [] },
    {
      key: 'sources',
      title: t('summary.sections.sources'),
      items: sources.map(source => t('summary.sections.sourceCount', { label: source.label, count: source.replies })),
    },
  ].filter(group => group.items.length > 0)
  if (groups.length === 0) return null
  return (
    <Box className="flex flex-col gap-2 border-t border-[var(--bellum-border)] pt-2">
      {groups.map(group => (
        <section key={group.key} aria-label={group.title} className="space-y-0.5">
          <Text element="p" size="xs" weight="semibold">
            {group.title}
          </Text>
          <ul className="list-disc space-y-0.5 pl-4">
            {group.items.map((item, index) => (
              <li key={`${group.key}-${index}`}>
                <Text element="span" size="xs" className="break-words">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Box>
  )
}
