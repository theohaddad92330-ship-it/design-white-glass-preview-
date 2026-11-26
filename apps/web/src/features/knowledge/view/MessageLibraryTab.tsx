import { readableTemplate } from '@/lib/readable-template'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { Loader2, MessageSquareQuote } from 'lucide-react'
import { evaluateReadiness, unconfirmedMandatoryFacts, type MessageLibraryEntry } from '@bellum/contracts'
import { useConfirmMandatoryFact } from '@/features/message-library/hooks/useConfirmMandatoryFact'
import { useConfirmMessageClaim } from '@/features/message-library/hooks/useConfirmMessageClaim'
import { AddMessageExampleDialog } from './AddMessageExampleDialog'
import { useImportMessageLibraryDefaults, useMessageLibrary } from '@/features/message-library/hooks/useMessageLibrary'

/**
 * #3427 — la bibliothèque d'exemples commerciaux, en LECTURE. Même gabarit que
 * `OutreachAssetsTab` (grille de cartes, pastilles sobres) : un exemple, son
 * texte, son statut. Un exemple que la règle absolue bloque (statut archivé,
 * affirmation sans donnée réelle) dit POURQUOI, en une ligne — il n'est jamais
 * masqué. Aucune écriture ici : l'import vit côté API.
 */
export function MessageLibraryTab() {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useMessageLibrary()
  const rows = data ?? []
  const importDefaults = useImportMessageLibraryDefaults()
  // #4158.50 — le formulaire ne se monte (et son hook de mutation) qu'ouvert.
  const [adding, setAdding] = useState(false)
  const addButton = (
    <Button variant="secondary" className="min-h-11" onClick={() => setAdding(true)}>
      {t('messageLibrary.add.button')}
    </Button>
  )
  const addDialog = adding ? <AddMessageExampleDialog open onOpenChange={setAdding} /> : null

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-ghost)' }} />
      </div>
    )
  }
  if (isError) {
    return (
      <p className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        {t('messageLibrary.errorState')}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <MessageSquareQuote className="h-6 w-6" style={{ color: 'var(--text-ghost)' }} />
        <Text size="sm" color="text-[var(--text-muted)]">
          {t('messageLibrary.empty')}
        </Text>
        <button
          type="button"
          onClick={() => importDefaults.mutate()}
          disabled={importDefaults.isPending}
          className="flex items-center gap-2 h-11 px-4 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--violet-gradient)' }}
        >
          {t('messageLibrary.importButton')}
        </button>
        {addButton}
        {importDefaults.isError && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('messageLibrary.importError')}
          </p>
        )}
        {addDialog}
      </div>
    )
  }

  return (
    <div>
      <Text size="sm" color="text-[var(--text-muted)]" className="mb-3">
        {t('messageLibrary.intro')}
      </Text>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {addButton}
        <button
          type="button"
          onClick={() => importDefaults.mutate()}
          disabled={importDefaults.isPending}
          className="h-11 text-sm underline text-[var(--text-muted)] disabled:opacity-60"
        >
          {t('messageLibrary.completeButton')}
        </button>
      </div>
      {addDialog}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(entry => (
          <LibraryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function blockedReason(entry: MessageLibraryEntry, t: (key: string, options?: Record<string, unknown>) => string) {
  const readiness = evaluateReadiness(entry)
  if (readiness.ready) return null
  if (entry.status === 'historique' || entry.status === 'interdit') return t('messageLibrary.blocked.archived')
  if (unconfirmedMandatoryFacts(entry).length > 0) return null // #3439.1 — rendu par `MandatoryFacts`, pas deux fois
  // #3438 — rendu par le bloc « Affirmations », pas deux fois (comme les faits obligatoires).
  if (entry.claims.length > 0) return readiness.blockedClaims.length > 0 ? null : t('messageLibrary.blocked.review')
  return t('messageLibrary.blocked.review')
}

function LibraryCard({ entry }: { entry: MessageLibraryEntry }) {
  const { t } = useTranslation('knowledge')
  const { t: tEngagement } = useTranslation('engagement')
  const reason = blockedReason(entry, t)
  const confirm = useConfirmMandatoryFact()
  const confirmClaim = useConfirmMessageClaim()
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <MessageSquareQuote className="h-[18px] w-[18px]" style={{ color: 'var(--text-muted)' }} />
      <p className="text-sm font-medium text-[color:var(--text-primary)]">{entry.title}</p>
      <p className="text-xs line-clamp-4 whitespace-pre-line" style={{ color: 'var(--text-ghost)' }}>
        {readableTemplate(entry.text)}
      </p>
      {entry.mandatoryFacts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t(
              unconfirmedMandatoryFacts(entry).length > 0
                ? 'messageLibrary.facts.title'
                : 'messageLibrary.facts.titleDone',
            )}
          </p>
          <ul className="flex flex-col gap-1.5">
            {entry.mandatoryFacts.map(fact => {
              const done = !unconfirmedMandatoryFacts(entry).includes(fact)
              return (
                <li key={fact} className="flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--text-ghost)' }}>{fact}</span>
                  {done ? (
                    <span style={{ color: 'var(--text-muted)' }}>{t('messageLibrary.facts.confirmed')}</span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-11 shrink-0"
                      isLoading={confirm.isPending && confirm.variables?.fact === fact}
                      onClick={() => confirm.mutate({ id: entry.id, fact })}
                    >
                      {t('messageLibrary.facts.confirm')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {entry.claims.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t(
              entry.claims.some(claim => claim.verifiedFactId == null)
                ? 'messageLibrary.claims.title'
                : 'messageLibrary.claims.titleDone',
            )}
          </p>
          <ul className="flex flex-col gap-1.5">
            {entry.claims.map((claim, claimIndex) => (
              <li key={`${claimIndex}-${claim.statement}`} className="flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-ghost)' }}>{claim.statement}</span>
                {claim.verifiedFactId != null ? (
                  <span style={{ color: 'var(--text-muted)' }}>{t('messageLibrary.claims.verified')}</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 shrink-0"
                    isLoading={
                      confirmClaim.isPending &&
                      confirmClaim.variables?.id === entry.id &&
                      confirmClaim.variables?.claimIndex === claimIndex
                    }
                    onClick={() => confirmClaim.mutate({ id: entry.id, claimIndex })}
                  >
                    {t('messageLibrary.claims.confirm')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {reason && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {reason}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-auto pt-2">
        {[
          t(`messageLibrary.status.${entry.status}`),
          t(`messageLibrary.mode.${entry.mode}`),
          t(`messageLibrary.channel.${entry.channel}`),
          tEngagement(`composer.parameters.personas.${entry.persona}`),
        ].map(label => (
          <span
            key={label}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
