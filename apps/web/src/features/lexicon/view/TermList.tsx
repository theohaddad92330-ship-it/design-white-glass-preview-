import { useState } from 'react'

/**
 * Une liste de mots libres, ajoutés un par un.
 *
 * Extraite de `OfferPortfolioSection` quand le lexique a gagné son propre écran
 * (D17) : les mots interdits n'apparaissent plus à deux endroits sous la même
 * forme — c'est la loi 4 du tome 7, et un réglage qui vit à deux endroits
 * diverge au premier écran qui n'écrit que l'un des deux.
 */
export function TermList({
  terms,
  placeholder,
  removeLabel,
  addLabel,
  onChange,
  disabled,
}: {
  terms: string[]
  placeholder: string
  removeLabel: (term: string) => string
  addLabel: string
  onChange: (next: string[]) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState('')
  const add = (): void => {
    const value = draft.trim()
    if (!value || terms.includes(value)) return setDraft('')
    onChange([...terms, value])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {terms.map(term => (
          <button
            key={term}
            type="button"
            disabled={disabled}
            onClick={() => onChange(terms.filter(entry => entry !== term))}
            aria-label={removeLabel(term)}
            className="min-h-11 rounded-badge border border-[var(--bellum-border)] bg-card px-3 py-1.5 text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] disabled:opacity-50"
          >
            {term} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-11 flex-1 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || !draft.trim()}
          className="min-h-11 rounded-control border border-[var(--bellum-border)] px-3 text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] disabled:opacity-50"
        >
          {addLabel}
        </button>
      </div>
    </div>
  )
}
