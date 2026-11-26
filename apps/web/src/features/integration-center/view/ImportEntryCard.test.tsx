import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2091.11 — LA CARTE « TU AS DÉJÀ DES FICHIERS OU UN CRM ? », AU MOMENT DES
 * INTÉGRATIONS.
 *
 * L'assistant de reprise (`/settings/import`) existait déjà, mais ailleurs
 * (Réglages) : quelqu'un qui vient de brancher ses outils ne pense pas à
 * aller le chercher là-bas. Cette carte ne réécrit rien — elle LIE vers
 * l'assistant existant (loi 4 du tome 7 : jamais un deuxième import).
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} data-to={to} {...rest}>
      {children}
    </a>
  ),
}))

const { ImportEntryAction } = await import('./ImportEntryCard')

/**
 * Refonte Théo (PR12) — la carte devient le geste principal de l'en-tête
 * (`.bo11-head-actions` « Importer ») : même lien, même libellé, et la question
 * voyage avec le bouton (titre au survol).
 */
describe('le geste de reprise de données, dans l’en-tête des intégrations', () => {
  it('lie vers l’assistant de reprise EXISTANT, jamais un second import', () => {
    render(<ImportEntryAction />)
    expect(screen.getByRole('link').getAttribute('data-to')).toBe('/settings/mes-donnees')
  })

  it('CRM-SYNC-D.3 — le libellé de l’import de FICHIERS, la question et « sur sa carte » restent dits', () => {
    render(<ImportEntryAction />)
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('Importer un fichier')
    expect(link.getAttribute('title')).toMatch(/tu as déjà des fichiers ou un crm/i)
    expect(link.getAttribute('title')).toMatch(/sur sa carte/i)
    expect(screen.queryByText(/assistant de reprise/i)).toBeNull()
  })

  it('une cible tactile de 44 px (GA-35)', () => {
    render(<ImportEntryAction />)
    expect(screen.getByRole('link').className).toContain('min-h-11')
  })
})
