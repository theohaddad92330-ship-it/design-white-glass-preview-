import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/**
 * #1446 — LA SAISIE D'ODOO A QUITTÉ LA GRILLE.
 *
 * *« Ne pas afficher directement quatre champs techniques dans la grille
 * principale. »* Quatre libellés, quatre champs et une aide au milieu de quinze
 * cartes de trois lignes : cette carte faisait à elle seule la hauteur de trois
 * voisines, et tout le catalogue se lisait de travers à cause d'un connecteur.
 *
 * Ce que ces gardes tiennent — et la troisième est la plus importante, parce
 * qu'elle protège une décision qu'un déménagement fait facilement perdre :
 *  · la carte n'affiche AUCUN champ tant qu'on n'a rien demandé ;
 *  · elle porte le même geste que les autres, un bouton ;
 *  · **c'est une clé d'API, pas un mot de passe, et le champ reste masqué.**
 *    Odoo accepte les deux au même endroit : une clé se révoque depuis le profil
 *    sans changer le mot de passe du compte, et elle n'ouvre pas l'interface.
 */
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/features/odoo/hooks/useOdooStatus', () => ({
  ODOO_STATUS_KEY: ['odoo-status'],
  useOdooStatus: () => ({ data: { connected: false }, isLoading: false }),
}))
vi.mock('@/features/odoo/api', () => ({ odooApi: { connect: vi.fn(), disconnect: vi.fn() } }))
vi.mock('./ConnectorDiagnostics', () => ({ ConnectorDiagnostics: () => null }))

const { OdooCard } = await import('./OdooCard')

function champsVisibles(): number {
  return document.querySelectorAll('input').length
}

describe('la carte Odoo', () => {
  it('lit un corpus non vide : la carte se rend, avec son nom', () => {
    render(<OdooCard state="available" tools={[]} />)
    expect(screen.getByText('Odoo')).toBeInTheDocument()
  })

  it('n’affiche AUCUN champ dans la grille', () => {
    render(<OdooCard state="available" tools={[]} />)
    expect(champsVisibles()).toBe(0)
  })

  it('porte le même geste que les autres cartes : un bouton', () => {
    render(<OdooCard state="available" tools={[]} />)
    expect(screen.getByRole('button', { name: /Connecter Odoo/i })).toBeInTheDocument()
  })

  it('ouvre la saisie au clic, avec ses quatre champs', async () => {
    render(<OdooCard state="available" tools={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Odoo/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(champsVisibles()).toBe(4)
  })

  it('demande une CLÉ d’API, masquée — jamais un mot de passe', async () => {
    render(<OdooCard state="available" tools={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Odoo/i }))

    const key = document.querySelector('#odoo-key')
    // Masqué : elle ne doit pas rester lisible sur l'écran d'un open space.
    expect(key?.getAttribute('type')).toBe('password')

    // Et l'écran DIT la différence. Odoo accepte les deux au même endroit : ne
    // pas la dire laisserait coller un mot de passe de compte dans ce champ.
    const dialog = screen.getByRole('dialog').textContent?.toLowerCase() ?? ''
    expect(dialog).toContain('clé d’api')
    expect(dialog).toContain('pas ton mot de passe')
  })

  it('dit OÙ trouver la clé — la question que tout le monde pose', async () => {
    render(<OdooCard state="available" tools={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Odoo/i }))
    expect(screen.getByRole('dialog').textContent).toContain('Clés API')
  })
})

/**
 * ⚠️ UN BOUTON QUI N'OUVRE RIEN EST PIRE QUE PAS DE BOUTON.
 *
 * Un élément React est TOUJOURS vrai, même quand le composant rend `null` :
 * `details={<ConnectorBenefits …/>}` faisait apparaître « Voir le détail » sur
 * un connecteur sans aucune ligne de registre. Le cas n'est pas théorique —
 * `connectorState` rend délibérément `available` quand le serveur n'a AUCUNE
 * ligne, pour qu'une entrée oubliée au catalogue dégrade en carte branchable
 * plutôt que de faire disparaître un outil qui marche.
 */
describe('sans aucune ligne de registre', () => {
  it('ne montre pas de bouton « Voir le détail » — il n’ouvrirait rien', () => {
    render(<OdooCard state="available" tools={[]} />)
    expect(screen.queryByRole('button', { name: /détail/i })).toBeNull()
  })

  it('mais la carte reste là, avec son geste', () => {
    render(<OdooCard state="available" tools={[]} />)
    expect(screen.getByText('Odoo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Connecter Odoo/i })).toBeInTheDocument()
  })
})
