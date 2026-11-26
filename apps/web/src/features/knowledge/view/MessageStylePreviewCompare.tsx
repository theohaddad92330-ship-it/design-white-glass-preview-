import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, Sparkles, X } from 'lucide-react'
import type { MessageStylePreviewLayer, MessageStyleTemplate } from '@bellum/contracts'
import { useContactSearchResults } from '@/features/global-search/useContactSearchResults'
import { useMessageStylePreviewCompare } from '@/features/message-style/hooks/useMessageStyle'

const LAYER_ORDER: readonly MessageStylePreviewLayer[] = ['generic', 'workspace', 'user', 'final']

type PickedContact = { id: string; label: string }

/**
 * #2369.11 (reste, épopée #2768) — comparer, pour UN template (son
 * objectif/canal), le MÊME message d'exemple sous les quatre couches. Un
 * contact réel est requis (`IaClient.generateMessage` vérifie sa
 * propriété IA-side) — jamais un exemple sur des données inventées
 * (doctrine « jamais de donnée fictive »).
 */
export function MessageStylePreviewCompare({
  template,
  onClose,
}: {
  template: MessageStyleTemplate
  onClose: () => void
}) {
  const { t } = useTranslation('knowledge')
  const [query, setQuery] = useState('')
  const [contact, setContact] = useState<PickedContact | null>(null)
  const [context, setContext] = useState('')
  const contactResults = useContactSearchResults(contact ? '' : query)
  const compare = useMessageStylePreviewCompare()

  const handleGenerate = () => {
    if (!contact) return
    compare.mutate({
      objective: template.objective,
      channel: template.channel,
      contactId: contact.id,
      context: context.trim() || undefined,
    })
  }

  return (
    <div
      className="rounded-xl p-4 mt-3"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-[color:var(--text-primary)]">{t('style.preview.title')}</h4>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('style.preview.subtitle', { objective: template.objective })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('style.preview.closeAria')}
          className="flex h-11 w-11 items-center justify-center rounded-md shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {contact ? (
          <div
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[color:var(--text-primary)]">{contact.label}</span>
            <button
              type="button"
              onClick={() => setContact(null)}
              aria-label={t('style.preview.clearContactAria')}
              className="flex h-11 items-center px-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--text-ghost)' }}
            />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('style.preview.contactPlaceholder')}
              className="w-full rounded-md py-2 pl-9 pr-3 text-sm bg-transparent outline-none"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            {contactResults.data && contactResults.data.data.length > 0 && (
              <div
                className="absolute z-10 mt-1 w-full rounded-md py-1 max-h-56 overflow-auto"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                {contactResults.data.data.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setContact({
                        id: item.id,
                        label: item.title ? `${item.full_name} — ${item.title}` : item.full_name,
                      })
                      setQuery('')
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:opacity-80"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span>{item.full_name}</span>
                    {item.title && (
                      <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                        {item.title}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder={t('style.preview.contextPlaceholder')}
          rows={2}
          className="w-full rounded-md p-2 text-sm bg-transparent outline-none resize-none"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!contact || compare.isPending}
          className="flex h-11 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-white transition-opacity disabled:opacity-50 self-start px-3"
          style={{ background: 'var(--violet-gradient)' }}
        >
          {compare.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {t('style.preview.generate')}
        </button>
      </div>

      {compare.isError && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('style.preview.errorState')}
        </p>
      )}

      {compare.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {LAYER_ORDER.map(layer => {
            const result = compare.data?.find(r => r.layer === layer) ?? null
            return (
              <div
                key={layer}
                className="rounded-lg p-3 flex flex-col gap-2"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {t(`style.preview.layer.${layer}`)}
                </span>
                {result?.text ? (
                  <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                    {result.text}
                  </p>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-ghost)' }}>
                    {t('style.preview.layerEmpty')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
