import { Input, SelectField, Textarea } from '@bellum/ui'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type InlineEditableKind = 'text' | 'number' | 'date' | 'select' | 'tags' | 'textarea'

export type InlineEditableFieldProps = {
  /** Le nom du champ : étiquette visible ET nom accessible (« Modifier <label> »). */
  label: string
  /** La valeur brute. `''` = absent, et se dit « Non renseigné » — jamais « 0 ». */
  value: string
  /** Enregistre. Rejeter = la valeur précédente revient et l'erreur se dit. */
  onSave: (next: string) => Promise<unknown>
  kind?: InlineEditableKind
  /** Pour `text` : le type HTML d'entrée (e-mail, téléphone, adresse). */
  inputType?: 'text' | 'email' | 'tel' | 'url'
  /** Pour `select`. Une option `''` vaut « non renseigné ». */
  options?: readonly { value: string; label: string }[]
  placeholder?: string
  hint?: string
  /** Lu mais jamais éditable (droit manquant) : aucun bouton, aucune fausse promesse. */
  disabled?: boolean
  /** Rendu de lecture sur mesure ; absent ⇒ la valeur (le libellé de l'option pour `select`, des puces pour `tags`). */
  display?: ReactNode
  min?: number
  max?: number
  /** L'id du bouton de lecture : permet d'y amener le focus depuis un autre geste. */
  id?: string
  /** #4577.3 — marqueur de provenance à côté de l'étiquette (« Saisi à la main ») ; absent = rien d'affiché. */
  provenanceNote?: string
  /**
   * #4577.6 — la valeur vient d'un connecteur ou du CV : elle se LIT, dit d'où elle vient, et ne s'ouvre qu'après un
   * geste explicite (« Corriger »). Verrouillée ≠ impossible à corriger : une correction humaine gagne toujours.
   */
  lockedNote?: string
}

/** « a, b , c » → ['a', 'b', 'c'], sans vide. */
function tagsOf(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

/**
 * #4402.1 (retour bêta 21/10) — UN composant d'édition EN LIGNE, pour tous les types de champ (texte, nombre,
 * date, choix, liste d'étiquettes) : la fiche se modifie champ par champ, sans passer par une modale.
 *
 * - clic ou Entrée sur la valeur → le champ devient éditable ;
 * - Entrée ou perte de focus → enregistre (une valeur inchangée n'appelle pas l'API) ;
 * - Échap → annule ;
 * - erreur → la valeur précédente revient et l'erreur se DIT (`role="alert"`), jamais une valeur qui change en silence.
 *
 * Accessibilité : la valeur est un bouton tabulable nommé « Modifier <champ> » (GA-32/35), cible ≥ 44 px.
 */
export function InlineEditableField({
  label,
  value,
  onSave,
  kind = 'text',
  inputType = 'text',
  options = [],
  placeholder,
  hint,
  disabled = false,
  display,
  min,
  max,
  id,
  provenanceNote,
  lockedNote,
}: InlineEditableFieldProps) {
  const { t } = useTranslation('common')
  const editingHintId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  // Un seul enregistrement par ouverture : Entrée PUIS le blur du démontage ne doivent pas écrire deux fois.
  const settled = useRef(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      triggerRef.current?.focus()
    }
  }, [editing])

  const open = () => {
    settled.current = false
    setDraft(value)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    settled.current = true
    refocus.current = true
    setDraft(value)
    setEditing(false)
  }

  const commit = async (next: string, { restoreFocus }: { restoreFocus: boolean }) => {
    if (settled.current) return
    settled.current = true
    if (restoreFocus) refocus.current = true
    if (next === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t('inlineEdit.unknownError'))
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      return
    }
    if (event.key !== 'Enter') return
    // Un texte long garde Entrée pour la ligne suivante : Ctrl/Cmd + Entrée enregistre.
    if (kind === 'textarea' && !(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    void commit(draft, { restoreFocus: true })
  }

  const selected = options.find(option => option.value === value)
  const readView: ReactNode =
    display ??
    (kind === 'tags' ? (
      <span className="flex flex-wrap gap-1.5">
        {tagsOf(value).map(tag => (
          <span
            key={tag}
            className="rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-primary)]"
          >
            {tag}
          </span>
        ))}
      </span>
    ) : kind === 'select' ? (
      (selected?.label ?? value)
    ) : (
      value
    ))
  const empty =
    kind === 'tags' ? tagsOf(value).length === 0 : kind === 'select' ? value === '' || !selected?.label : value === ''
  // Une valeur absente ne s'écrit pas « Non renseigné » partout (un mur de « Non renseigné » dit ce qu'on n'a pas) :
  // en édition, c'est un GESTE (« Ajouter »). Le texte « Non renseigné » ne sert qu'à un champ lu sans droit d'écriture.
  const emptyView = (
    <span className="text-[var(--bellum-text-muted)]">{disabled ? t('inlineEdit.empty') : t('inlineEdit.add')}</span>
  )

  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--bellum-text-secondary)]">
        {label}
        {provenanceNote ? <span className="text-[var(--bellum-text-muted)]">{provenanceNote}</span> : null}
      </span>
      {disabled ? (
        <div className="min-h-11 py-2 text-sm text-[var(--bellum-text-primary)]">{empty ? emptyView : readView}</div>
      ) : lockedNote && !unlocked && !editing ? (
        // #4577.6 — la valeur est lue, jamais éditable d'un clic : on dit d'où elle vient, et le geste est nommé.
        <div className="grid gap-1">
          <div className="min-h-11 py-2 text-sm text-[var(--bellum-text-primary)]">{empty ? emptyView : readView}</div>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-[var(--bellum-text-muted)]">
            {lockedNote}
            <button
              type="button"
              aria-label={t('inlineEdit.unlock', { label })}
              onClick={() => setUnlocked(true)}
              className="min-h-11 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-secondary)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('inlineEdit.unlockAction')}
            </button>
          </span>
        </div>
      ) : editing ? (
        <div className="grid gap-1">
          {kind === 'select' ? (
            // GA-251 — jamais de <select> natif : SelectField suit le thème. Pas de blur ici (Radix garde le focus
            // dans son menu) : le choix enregistre, Échap annule.
            <div onKeyDown={onKeyDown}>
              <SelectField
                ariaLabel={label}
                disabled={saving}
                value={draft}
                options={options}
                onChange={next => {
                  setDraft(next)
                  void commit(next, { restoreFocus: true })
                }}
                className="min-h-11 w-full"
              />
            </div>
          ) : kind === 'textarea' ? (
            <Textarea
              aria-label={label}
              aria-describedby={editingHintId}
              autoFocus
              readOnly={saving}
              value={draft}
              placeholder={placeholder}
              onChange={event => setDraft(event.target.value)}
              onBlur={() => void commit(draft, { restoreFocus: false })}
              onKeyDown={onKeyDown}
              className="min-h-24"
            />
          ) : (
            <Input
              aria-label={label}
              aria-describedby={editingHintId}
              autoFocus
              readOnly={saving}
              type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : inputType}
              inputMode={kind === 'number' ? 'numeric' : undefined}
              min={kind === 'number' ? min : undefined}
              max={kind === 'number' ? max : undefined}
              value={draft}
              placeholder={placeholder}
              onChange={event => setDraft(event.target.value)}
              onBlur={() => void commit(draft, { restoreFocus: false })}
              onKeyDown={onKeyDown}
              className="min-h-11"
            />
          )}
          {/* #4577.7 — l'état « en cours de modification » et la sortie, lus à la prise de focus (aria-describedby). */}
          <span id={editingHintId} className="sr-only">
            {t('inlineEdit.editingHint')}
          </span>
          {hint ? <span className="text-xs text-[var(--bellum-text-muted)]">{hint}</span> : null}
        </div>
      ) : (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-label={t('inlineEdit.edit', { label })}
          onClick={open}
          className="min-h-11 w-full min-w-0 cursor-text rounded-md px-2 py-2 text-left text-sm text-[var(--bellum-text-primary)] [overflow-wrap:anywhere] hover:bg-[var(--bellum-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {empty ? emptyView : readView}
        </button>
      )}
      {saving ? (
        <span role="status" className="text-xs text-[var(--bellum-text-muted)]">
          {t('inlineEdit.saving')}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-[var(--danger-soft-text)]">
          {t('inlineEdit.error', { message: error })}
        </span>
      ) : null}
    </div>
  )
}
