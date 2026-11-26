import { SelectField, type SelectFieldOption } from '@bellum/ui'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/* ------------------------------------------------------------------ */
/*  Contrôles de formulaire partagés par les deux panneaux de filtres.  */
/*  Purement présentationnels — aucune logique de requête ici.          */
/* ------------------------------------------------------------------ */

function FieldModeTag({ mode }: { mode: 'include' | 'exclude' }) {
  const { t } = useTranslation('discover')
  const exclude = mode === 'exclude'
  return (
    <span
      data-testid="field-mode"
      className="w-fit rounded-full px-2 py-0.5 text-xs"
      style={{
        background: exclude ? 'var(--danger-soft-bg)' : 'var(--accent-soft-bg)',
        border: `1px solid ${exclude ? 'var(--danger-soft-border)' : 'var(--accent-soft-border)'}`,
        color: exclude ? 'var(--danger-soft-text)' : 'var(--accent-soft-text)',
      }}
    >
      {t(`rail.mode.${mode}`)}
    </span>
  )
}

export function Field({
  label,
  hint,
  notApplied,
  mode,
  wide,
  children,
}: {
  label: string
  /** F2-FIX #4301 — dit en mots simples si ce critère GARDE (`include`) ou ÉCARTE (`exclude`). Absent = pas d'étiquette. */
  mode?: 'include' | 'exclude'
  hint?: string
  /** « Le registre n'a pas su appliquer ce critère » — dit ICI, au point où
   *  l'utilisateur l'a posé, plutôt que dans une alerte en haut de page. Ce
   *  n'est pas une panne (la source a répondu, plus large que demandé), donc le
   *  ton reste neutre : pas d'ambre, pas d'icône d'alerte. */
  notApplied?: string
  /** R22-DV3 (#4413.1) — le champ prend TOUTE la rangée de la grille du groupe (des puces qui ont besoin de largeur). */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={wide ? 'col-span-full flex flex-col gap-1' : 'flex flex-col gap-1'}>
      {/* #4299.1 — libellé en texte de contraste AA : `--text-ghost` pâle sur fond pâle ne se lisait pas. */}
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {mode && <FieldModeTag mode={mode} />}
      {children}
      {notApplied && (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {notApplied}
        </span>
      )}
      {hint && (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      )}
    </div>
  )
}

const CONTROL_STYLE = {
  background: 'var(--bg-glass)',
  border: '1px solid var(--bg-glass-border)',
  color: 'var(--text-primary)',
} as const

export function TextInput({
  value,
  onChange,
  placeholder,
  onEnter,
  ariaLabel,
  visibleLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** #3879.2 — un libellé VISIBLE (un champ a un libellé, pas seulement un placeholder). */
  visibleLabel?: string
  onEnter?: () => void
  /** Pour une saisie posée HORS d'un `Field` (les filtres de résultats, où le
   *  libellé ne tient pas) : un `placeholder` n'est pas un nom accessible —
   *  il disparaît dès la première frappe. */
  ariaLabel?: string
}) {
  const input = (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault()
          onEnter()
        }
      }}
      // #4299.1 — ce que l'utilisateur a saisi se lit en gras ; un champ vide garde le poids normal.
      className={`h-8 w-full rounded-sm px-2.5 text-xs transition-colors focus:outline-none${value ? ' font-semibold' : ''}`}
      style={CONTROL_STYLE}
    />
  )
  if (!visibleLabel) return input
  return (
    <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <span className="shrink-0 whitespace-nowrap">{visibleLabel}</span>
      {input}
    </label>
  )
}

/**
 * La liste déroulante des filtres de Découvrir.
 *
 * Elle était un `<select>` NATIF, avec un `style` en ligne qui tentait de lui
 * donner les couleurs du produit — sans effet sur le menu déroulant lui-même,
 * que le système d'exploitation rend avec SES couleurs. En thème sombre,
 * c'était une liste blanche au milieu d'un écran noir. Un `<option>` de cet
 * écran allait jusqu'à forcer `background: '#1A1A24'`, une couleur qui
 * n'existe dans aucun thème du dépôt.
 *
 * Elle prend maintenant `options` plutôt que des enfants `<option>` : c'est ce
 * que `SelectField` attend, et ça retire au passage le chevron dessiné à la
 * main par-dessus (le composant porte le sien).
 */
export function SelectInput({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly SelectFieldOption[]
  ariaLabel?: string
}) {
  return <SelectField size="sm" value={value} onChange={onChange} options={options} ariaLabel={ariaLabel} />
}

export function ToggleChip({
  active,
  onClick,
  disabled = false,
  disabledHint,
  title,
  tone = 'include',
  describedBy,
  onReveal,
  onConceal,
  children,
}: {
  active: boolean
  onClick: () => void
  /**
   * #3815.3 — `aria-disabled`, jamais l'attribut natif `disabled` : un bouton
   * natif désactivé ne reçoit plus aucun `click` NI focus clavier (même défaut
   * que `OnboardingWizard.tsx` #2577.1/.2) — la raison doit rester LISIBLE
   * (tabulation, lecteur d'écran) plutôt que de disparaître avec le bouton.
   */
  disabled?: boolean
  /** La raison, visible AVANT le clic (`title`) — jamais seulement après un clic refusé. */
  disabledHint?: string
  /** #4362.1 — info-bulle permanente (ex. les bornes d'une taille). */
  title?: string
  /** #4301.1 — `exclude` : une pastille d'EXCLUSION se lit autrement qu'une inclusion (rouge, pas violet). */
  tone?: 'include' | 'exclude'
  /** #4315.3 — `id` d'une phrase qui dit ce que la case capte (description accessible, pas seulement `title`). */
  describedBy?: string
  /** #4315.3 — focus (clavier, toucher) ou survol : la phrase peut s'afficher. */
  onReveal?: () => void
  /** #4315.3 — le focus ou le survol s'arrête. */
  onConceal?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-describedby={describedBy}
      onFocus={onReveal}
      onBlur={onConceal}
      onMouseEnter={onReveal}
      onMouseLeave={onConceal}
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledHint : title}
      // #2506 — cible ≥ 44 px en pointeur grossier : une grille dense de
      // pastilles de secteurs était illisible ET intouchable au doigt.
      className="rounded-full px-2.5 py-1 text-xs transition-colors pointer-coarse:min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      style={{
        background: active
          ? tone === 'exclude'
            ? 'var(--danger-soft-bg)'
            : 'var(--accent-soft-bg)'
          : 'var(--bg-elevated)',
        border: `1px solid ${active ? (tone === 'exclude' ? 'var(--danger-soft-border)' : 'var(--accent-soft-border)') : 'var(--border-subtle)'}`,
        color: active
          ? tone === 'exclude'
            ? 'var(--danger-soft-text)'
            : 'var(--accent-soft-text)'
          : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}

/** Carte de filtres : champs + bouton de lancement + réinitialisation. */
export function FilterShell({
  hint,
  children,
  submitLabel,
  submitIcon,
  onSubmit,
  disabled,
  loading,
  disabledHint,
  onReset,
  resetLabel,
}: {
  hint: string
  children: ReactNode
  submitLabel: string
  submitIcon: ReactNode
  onSubmit: () => void
  disabled: boolean
  loading: boolean
  disabledHint?: string
  onReset: () => void
  resetLabel: string
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <p className="mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {hint}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: 'var(--violet-gradient)' }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitIcon}
          {submitLabel}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="text-xs transition-colors hover:text-[color:var(--text-primary)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          {resetLabel}
        </button>

        {disabledHint && (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {disabledHint}
          </span>
        )}
      </div>
    </div>
  )
}
