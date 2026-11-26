import { Fragment } from 'react'
import { highlightParts, type ParsedSearch } from '../model/signal-search'

/**
 * Lot 768 — un texte dont les mots trouvés par la recherche sont surlignés (`<mark>`). Couleurs par jetons du
 * thème (le doublet « accent doux » est déjà gardé en contraste AA, clair et sombre) — jamais un hexadécimal.
 * Sans recherche, le texte est rendu tel quel.
 */
export function Highlighted({ text, search }: { text: string; search: ParsedSearch | null | undefined }) {
  if (!search) return <>{text}</>
  return (
    <>
      {highlightParts(text, search).map((part, index) =>
        part.hit ? (
          <mark
            key={index}
            data-testid="search-mark"
            className="rounded-sm bg-[var(--accent-soft-bg)] px-0.5 text-[var(--accent-soft-text)]"
          >
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
