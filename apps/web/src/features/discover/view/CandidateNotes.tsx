import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StickyNote } from 'lucide-react'
import {
  useCreateDiscoverCandidateNote,
  useDiscoverCandidateNotes,
} from '@/features/discover/hooks/useDiscoverCandidateNotes'

interface CandidateNotesProps {
  siren: string
  candidateName: string
}

/**
 * #2151.59 — une note libre sur CE candidat, écrite avant qu'il ne devienne un
 * compte, et retrouvée après : la reprise à la conversion est portée par le
 * serveur (`DiscoverCandidateNotesService.claimForAccount`,
 * `AccountsService.create` / `addToPortfolio`) — ce composant lit et écrit
 * simplement sur le SIREN, sans rien savoir de cette bascule.
 *
 * Zéro note se lit « aucune note », jamais « 0 » (GA-18 / GA-19).
 */
export function CandidateNotes({ siren, candidateName }: CandidateNotesProps) {
  const { t, i18n } = useTranslation('discover')
  const { data, isLoading, isError } = useDiscoverCandidateNotes(siren)
  const create = useCreateDiscoverCandidateNote(siren)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    create.mutate({ body }, { onSuccess: () => setDraft('') })
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const notes = data?.notes ?? []

  return (
    <div data-testid="candidate-notes" className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
      <p
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <StickyNote className="h-[11px] w-[11px]" />
        {t('card.notes.title')}
      </p>

      <div className="mb-2 flex flex-col items-start gap-1.5">
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={t('card.notes.placeholder')}
          aria-label={t('card.notes.aria', { name: candidateName })}
          rows={2}
          className="w-full rounded-md p-2 text-xs"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={draft.trim().length === 0 || create.isPending}
          className="rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 pointer-coarse:min-h-11"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          {create.isPending ? t('card.notes.saving') : t('card.notes.add')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('card.notes.loading')}
        </p>
      ) : isError ? (
        // Un échec de lecture ne se lit JAMAIS « aucune note » — même règle que
        // le panneau de notes du socle CRM (`NotesPanel`).
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('card.notes.loadError')}
        </p>
      ) : notes.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          {t('card.notes.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {notes.map(note => (
            <li key={note.id} className="rounded-md p-2 text-xs" style={{ background: 'var(--bg-elevated)' }}>
              <p className="mb-0.5 flex flex-wrap items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <span className="font-medium">{note.authorName ?? t('card.notes.unknownAuthor')}</span>
                <span>{formatDate(note.createdAt)}</span>
              </p>
              <p className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                {note.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
