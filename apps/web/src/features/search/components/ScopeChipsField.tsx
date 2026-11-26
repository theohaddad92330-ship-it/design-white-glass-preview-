import { Text } from '@bellum/ui'
import { Plus, X } from 'lucide-react'
import { useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FIELD_TITLE } from './AnalyzeChrome'

/**
 * Saisie libre d'une liste de libellés (priorités, entités/thèmes exclus) pour le
 * cadrage de collecte (Théo P0-02 étape 3).
 *
 * Libre — et pas une liste à cocher — parce qu'avant le run, les filiales du
 * groupe ne sont PAS connues : elles sortent de la phase 1. Proposer une liste
 * ici reviendrait à l'inventer. Le commercial nomme ce qu'il connaît ; ce qu'il
 * exclut est réellement retiré du dossier côté serveur.
 *
 * #1110 — cet argument vaut pour les EXCLUSIONS (des entités qu'on ne connaît
 * pas encore), pas pour les PRIORITÉS, qui sont des thèmes. « Faudrait savoir
 * sur quoi on peut chercher […] connaître un peu le glossaire pour orienter
 * BELLUM. » D'où `suggestions` : des amorces CLIQUABLES, optionnelles, qui ne
 * ferment pas le champ. Ce qu'on y met vient de l'appelant — et le seul
 * appelant qui en fournit tire les siennes du profil de l'ESN, jamais d'un
 * glossaire maison.
 *
 * #1126 — « Ah oui ça c'est bien. […] Il faut aussi que je voie où je peux les
 * ajouter. » Les amorces ÉTAIENT déjà cliquables — c'est #1110 qui les a
 * posées — et un clic les ajoute bien au champ. Ce qui manquait est le chemin :
 * une rangée introduite par « Ce que tu vends : » se lit comme un affichage, et
 * une action qu'on ne voit pas n'existe pas. Trois choses le disent maintenant,
 * au même endroit : le libellé nomme le geste, chaque amorce porte un « + » et
 * un nom accessible qui dit l'action ET sa cible, et `suggestionsSource` mène là
 * où la LISTE elle-même se complète.
 */
export function ScopeChipsField({
  label,
  hint,
  warning,
  placeholder,
  values,
  onChange,
  removeLabel,
  addLabel,
  disabled = false,
  suggestions = [],
  recommended = [],
  recommendedLabel,
  emptySuggestionsHint,
  suggestionsSource,
  suggestionsInside = false,
  after,
}: {
  label: string
  hint?: string
  /**
   * #4142 (audit du 13/10, point (a)) — un avertissement distinct du `hint` :
   * le `hint` décrit le champ en permanence, ceci dit qu'un geste PRÉCIS
   * vient de changer ce que le champ FAIT (ex. : l'ancre unique perdue dès
   * une 2ᵉ valeur). Absent ⇒ rien de plus qu'avant.
   */
  warning?: string
  placeholder: string
  values: string[]
  onChange: (next: string[]) => void
  removeLabel: (value: string) => string
  /** Nom accessible d'une amorce — il dit l'action, pas seulement le mot-clé. */
  addLabel?: (value: string) => string
  disabled?: boolean
  /** Amorces cliquables (#1110). Vide = champ inchangé, à l'octet près. */
  suggestions?: string[]
  /**
   * #1591.1 — celles que la mémoire marché RETROUVE sur le compte sélectionné.
   *
   * Elles remontent en tête et portent un mot — « Recommandé ». Elles ne sont
   * ni ajoutées ni retirées : la liste reste celle du Profil ESN, on marque
   * seulement ce que le corpus a observé. Vide (aucun compte sélectionné,
   * aucun recoupement) ⇒ rangée inchangée, à l'octet près.
   */
  recommended?: readonly string[]
  /** Le mot posé sur une amorce recommandée. Absent ⇒ aucune marque. */
  recommendedLabel?: string
  /** Ce qui s'affiche à la place quand il n'y a rien à proposer. */
  emptySuggestionsHint?: string
  /**
   * Le chemin vers l'endroit où la LISTE d'amorces se complète (#1126) — fourni
   * par l'appelant, parce qu'une route d'application n'a rien à faire dans un
   * champ de saisie générique. Absent ⇒ rien de plus qu'avant.
   */
  suggestionsSource?: ReactNode
  /**
   * #4512 — les amorces DANS le champ, après la saisie : un seul champ à pastilles, plus de rangée
   * « clique pour l'ajouter » à part qui répétait le titre. Absent ⇒ rangée sous le champ, comme avant.
   */
  suggestionsInside?: boolean
  /** #4512 — ce qui appartient au MÊME champ sous la saisie (ex. : les exclusions de source sous les thèmes). */
  after?: ReactNode
}) {
  const { t } = useTranslation('search')
  const [draft, setDraft] = useState('')

  // Comparaison à la CASSE PRÈS, comme le dédoublonnage du champ juste en
  // dessous : « Data / IA » saisi et « data / ia » observé sont le même thème.
  const recommendedFolded = new Set(recommended.map(value => value.toLowerCase()))
  const isRecommended = (value: string) => recommendedFolded.has(value.toLowerCase())

  const commit = (raw: string) => {
    const next = [...values]
    // #1079 : une saisie peut porter PLUSIEURS libellés d'un coup — le testeur
    // écrit « il faut préciser que l'on doit séparer par une virgule ». On le
    // dit sous le champ, et on l'applique aussi au collage : coller
    // « data, cloud, ERP » posait un seul libellé de trois mots, qui n'excluait
    // rien.
    for (const part of raw.split(',')) {
      const value = part.trim()
      if (!value) continue
      // Doublon (à la casse près) ignoré : deux fois le même critère n'exclut pas
      // deux fois plus.
      if (!next.some(existing => existing.toLowerCase() === value.toLowerCase())) next.push(value)
    }
    if (next.length !== values.length) onChange(next)
    setDraft('')
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    if (!pasted.includes(',')) return
    event.preventDefault()
    commit(`${draft}${pasted}`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    // Retour arrière sur un champ vide = retirer le dernier libellé.
    if (event.key === 'Backspace' && draft === '' && values.length > 0) onChange(values.slice(0, -1))
  }

  const suggestionChips = suggestions
    .filter(value => !values.some(existing => existing.toLowerCase() === value.toLowerCase()))
    /* #1591.1 : les recommandées d'abord. `sort` est stable depuis
       ES2019, donc l'ordre DÉCLARÉ par l'ESN survit à l'intérieur de
       chaque groupe — la liste reste celle que son auteur reconnaît. */
    .sort((a, b) => Number(isRecommended(b)) - Number(isRecommended(a)))
    .map(value => {
      const marked = isRecommended(value) && Boolean(recommendedLabel)
      return (
        <button
          key={value}
          type="button"
          disabled={disabled}
          /* Le mot fait partie du nom ACCESSIBLE, pas seulement de la
             couleur : un lecteur d'écran doit entendre « Recommandé ». */
          aria-label={addLabel ? (marked ? `${addLabel(value)} — ${recommendedLabel}` : addLabel(value)) : undefined}
          onClick={() => commit(value)}
          className={
            marked
              ? 'inline-flex min-h-6 items-center gap-1 rounded border border-[var(--bellum-text-accent)] px-1.5 text-xs text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)] disabled:opacity-50 pointer-coarse:min-h-11'
              : 'inline-flex min-h-6 items-center gap-1 rounded border border-dashed border-[var(--bellum-border)] px-1.5 text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] disabled:opacity-50 pointer-coarse:min-h-11'
          }
        >
          <Plus className="size-3 shrink-0" aria-hidden />
          {value}
          {marked ? <span className="ml-0.5 font-medium">· {recommendedLabel}</span> : null}
        </button>
      )
    })

  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs" className={FIELD_TITLE}>
        {label}
      </Text>
      {hint ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
      {warning ? (
        <Text size="xs" className="text-[var(--bellum-warning-text)]">
          {warning}
        </Text>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2 py-1.5">
        {values.map(value => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
          >
            {value}
            <button
              type="button"
              aria-label={removeLabel(value)}
              disabled={disabled}
              onClick={() => onChange(values.filter(item => item !== value))}
              className="text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => commit(draft)}
          placeholder={values.length === 0 ? placeholder : ''}
          aria-label={label}
          className="min-w-24 flex-1 bg-transparent text-sm text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)]"
        />
        {suggestionsInside ? suggestionChips : null}
      </div>
      {/* #1079 : la règle de validation était invisible — un champ qui accepte
          une liste doit dire comment on la sépare, sinon le premier libellé
          saisi part avec le second collé dedans. */}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('confirm.focus.commitHint')}
      </Text>

      {/* #1110 : les amorces. Une déjà posée disparaît de la rangée — la
          reproposer inviterait à un clic qui ne fait rien.
          #1126 : la rangée dit maintenant qu'elle EST un geste. */}
      {suggestions.length > 0 && !suggestionsInside ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('confirm.focus.suggestionsLead')}
          </Text>
          {suggestionChips}
        </div>
      ) : suggestions.length === 0 && emptySuggestionsHint ? (
        /* Rien à proposer se DIT. Un espace sans offres saisies verrait sinon
           une rangée absente, qu'on lirait « Bellum ne sait rien proposer ». */
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {emptySuggestionsHint}
        </Text>
      ) : null}
      {after}

      {/* #1126 : « où je peux les ajouter » ne se limite pas à la recherche en
          cours — un thème qui manque à la rangée se pose dans le profil, et ce
          chemin n'était affiché QUE lorsqu'il n'y avait rien à proposer. */}
      {suggestions.length > 0 || emptySuggestionsHint ? suggestionsSource : null}
    </div>
  )
}
