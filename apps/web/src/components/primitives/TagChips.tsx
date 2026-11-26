import { Link } from '@tanstack/react-router'

/**
 * #2159.26 — LES ÉTIQUETTES d'une fiche (décision Louis 19/09/2026).
 *
 * Posées par l'import (colonne « Tags » d'un export CRM), normalisées côté
 * serveur (`normalizeTags`). Chaque étiquette est un LIEN vers la liste
 * filtrée sur elle : c'est le chemin le plus court de « ce compte est
 * “grand compte” » à « montre-moi les autres ».
 *
 * Une fiche sans étiquette ne rend RIEN — ni liste vide, ni « aucune
 * étiquette » : l'absence de classement n'appelle aucun geste sur la fiche.
 *
 * Un vrai `<a>` (ce qui se clique se tabule), cible ≥ 44 px au doigt.
 */
export function TagChips({
  tags,
  list,
  label,
}: {
  tags: readonly string[] | null | undefined
  /** La liste que chaque étiquette ouvre, filtrée. */
  list: 'accounts' | 'contacts'
  /** Nom accessible de la liste (« Étiquettes du compte »). */
  label: string
}) {
  if (!tags || tags.length === 0) return null
  const className =
    'inline-flex min-h-6 items-center rounded-full bg-[var(--bellum-surface-2)] px-2.5 text-xs text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'

  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {tags.map(tag => (
        <li key={tag}>
          {list === 'accounts' ? (
            <Link to="/accounts" search={{ tag }} className={className}>
              {tag}
            </Link>
          ) : (
            <Link to="/contacts" search={{ tag }} className={className}>
              {tag}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
