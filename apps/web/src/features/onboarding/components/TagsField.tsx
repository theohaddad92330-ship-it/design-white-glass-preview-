import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Text } from '@bellum/ui'
import { X } from 'lucide-react'

type Props = {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  max?: number
  /**
   * #2088.19 — un exemple de FORME attendue (« Nom du client, secteur »),
   * affiché à côté du conseil de saisie. Jamais un nom d'entreprise réel
   * suggéré comme référence : ce champ n'a AUCUN catalogue à proposer (une
   * référence est un nom de client, en inventer une liste est exactement ce
   * que ce produit ne fait jamais — cf. docblock plus bas). Optionnel.
   */
  example?: string
  /**
   * #2540 — la question porte `optional: true` (#2059.7) : « Continuer »
   * avance déjà sur une liste vide, mais rien ne le DISAIT à l'écran. Ludovic
   * (ESN créée depuis quelques semaines, zéro référence) ne pouvait pas
   * savoir que laisser le champ vide était un choix accepté plutôt qu'un
   * oubli qui allait bloquer la suite. Absent (le défaut) = rendu historique
   * à l'octet près.
   */
  optional?: boolean
  /** #3923 — le nom accessible du champ quand aucun `<label>` ne le porte
   *  (« Mon profil »). Absent = rendu historique à l'octet près. */
  ariaLabel?: string
}

/**
 * Free-text chips (client references). There is no catalog to pick from — a
 * reference is a client NAME, and inventing a list of them is exactly what this
 * product must never do. Entrée ou virgule valide une puce; Retour arrière sur
 * un champ vide retire la dernière.
 */
export function TagsField({ values, onChange, placeholder, max, example, optional, ariaLabel }: Props) {
  const { t } = useTranslation('onboarding')
  const [draft, setDraft] = useState('')
  const [noneYet, setNoneYet] = useState(false)
  const atMax = max != null && values.length >= max

  const add = (raw: string): void => {
    const value = raw.trim()
    // Silently ignore blanks and duplicates rather than showing an error for
    // something the user obviously did not mean.
    if (!value || atMax || values.includes(value)) return
    onChange([...values, value])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
      setDraft('')
      return
    }
    if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map(value => (
            <span
              key={value}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-1 text-sm text-[var(--bellum-text-primary)]"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter(v => v !== value))}
                aria-label={t('complement.tags.remove', { value })}
                // #2002 (famille) — une icône de 14 px sans marge intérieure
                // était une cible de 14 px au doigt. Cible CARRÉE : il faut les
                // deux dimensions, un `min-h` seul laisse un trait de 14 px de
                // large (GA-30).
                className="text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-primary)] pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          add(draft)
          setDraft('')
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={atMax}
        maxLength={80}
      />

      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {atMax ? t('complement.tags.max', { max }) : t('complement.tags.hint')}
      </Text>
      {/* #2540 — champ facultatif ET vide : le dire explicitement, pas
          seulement le PERMETTRE en silence (`optional: true`, #2059.7). Une
          seconde entrée disparaît dès que le champ n'est plus vide — rien à
          rassurer, ce n'est plus « pas encore », c'est déjà répondu. */}
      {optional && values.length === 0 && (
        <>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('complement.tags.optionalHint')}
          </Text>
          {/* #2540 — un choix EXPLICITE : l'état reste « liste vide » (jamais
              une valeur inventée), le bouton ne fait que le DIRE à l'écran. */}
          <Button
            type="button"
            variant={noneYet ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={noneYet}
            onClick={() => setNoneYet(v => !v)}
            className="self-start"
          >
            {noneYet ? t('complement.tags.noneYetConfirmed') : t('complement.tags.noneYet')}
          </Button>
        </>
      )}
      {/* #2088.19 — exemple de forme, jamais affiché à la place du conseil de
          saisie ci-dessus (les deux répondent à des questions différentes :
          « comment valider » contre « à quoi ça ressemble »). */}
      {!atMax && example && (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {example}
        </Text>
      )}
    </div>
  )
}
