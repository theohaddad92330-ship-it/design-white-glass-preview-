import { fireEvent, screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { LinkedObjectsSummary, type LinkedObjectsSummaryBucket } from './LinkedObjectsSummary'

/**
 * #2124 (lot M1-9) — le résumé compact des objets liés au compte, monté dans
 * TabProjects (« Opportunités ») et TabMissions (« Historique & preuves »).
 *
 * ⚠️ Doctrine « une valeur absente ne s'affiche JAMAIS 0 » (CLAUDE.md) : le
 * porteur et le signal « positionné » DISPARAISSENT quand ils ne sont pas
 * mesurés — c'est le test qui doit rougir si `?? 0` ou un tiret muet
 * remplacent un jour cette absence.
 *
 * ⚠️ `renderWithRouter` monte une VRAIE route qui se résout de façon
 * asynchrone (voir `TabProjects.filters.test.tsx`) : la première assertion de
 * chaque test passe par `findByText`, qui attend et réessaie.
 */
const bucket = (over: Partial<LinkedObjectsSummaryBucket> = {}): LinkedObjectsSummaryBucket => ({
  key: 'active',
  title: 'Opportunités actives',
  emptyLabel: 'Aucune opportunité active pour l’instant.',
  rows: [],
  ...over,
})

describe('LinkedObjectsSummary', () => {
  it('affiche le titre du bucket avec son compte', async () => {
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[
          bucket({
            rows: [{ id: 'p-1', label: 'Refonte SI', ownerName: null, actions: [] }],
          }),
        ]}
      />,
    )
    expect(await screen.findByText('Opportunités actives (1)')).toBeInTheDocument()
  })

  it('un bucket vide affiche sa phrase, jamais une liste vide muette', async () => {
    renderWithRouter(<LinkedObjectsSummary buckets={[bucket()]} />)
    expect(await screen.findByText('Aucune opportunité active pour l’instant.')).toBeInTheDocument()
    expect(screen.getByText('Opportunités actives (0)')).toBeInTheDocument()
  })

  it('affiche le porteur quand il est résolu', async () => {
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[bucket({ rows: [{ id: 'p-1', label: 'Refonte SI', ownerName: 'Marie Curie', actions: [] }] })]}
      />,
    )
    expect(await screen.findByText(/Marie Curie/)).toBeInTheDocument()
  })

  // ⚠️ LE TEST QUI SAIT DIRE NON — un porteur non résolu ne s'affiche ni « 0 »
  // ni un tiret muet : la ligne ne PORTE tout simplement pas cette information.
  it('un porteur non résolu DISPARAÎT — jamais un identifiant, jamais un tiret nu', async () => {
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[bucket({ rows: [{ id: 'p-1', label: 'Refonte SI', ownerName: null, actions: [] }] })]}
      />,
    )
    expect(await screen.findByText('Refonte SI')).toBeInTheDocument()
    expect(screen.queryByText('–')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('le signal « positionné » ne s’affiche que lorsqu’il est mesuré', async () => {
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[
          bucket({
            rows: [
              { id: 'p-1', label: 'Avec profil', ownerName: null, positionedLabel: 'Profil positionné', actions: [] },
              { id: 'p-2', label: 'Sans info', ownerName: null, actions: [] },
            ],
          }),
        ]}
      />,
    )
    expect(await screen.findByText('Avec profil')).toBeInTheDocument()
    expect(screen.getByText('Profil positionné')).toBeInTheDocument()
    expect(screen.getAllByText('Profil positionné')).toHaveLength(1)
  })

  it('une action de navigation est un vrai lien, une action de geste un vrai bouton cliquable', async () => {
    const onClick = vi.fn()
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[
          bucket({
            rows: [
              {
                id: 'p-1',
                label: 'Refonte SI',
                ownerName: null,
                actions: [
                  { label: 'Ouvrir dans le Pipe', to: '/projects' },
                  { label: 'Qualifier ce projet plausible', onClick },
                ],
              },
            ],
          }),
        ]}
      />,
    )
    const link = await screen.findByRole('link', { name: 'Ouvrir dans le Pipe' })
    expect(link).toHaveAttribute('href', '/projects')

    const button = screen.getByRole('button', { name: 'Qualifier ce projet plausible' })
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // #2150.39 — « Besoin > Contacts client » pose un `search` sur son action de
  // navigation (filtre l'annuaire canonique sur le compte du besoin), sans
  // route dédiée : c'est le même mécanisme `to` + `search` que le reste de
  // l'annuaire (`company`, GA-26).
  it('une action de navigation porte son `search` dans le lien rendu', async () => {
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[
          bucket({
            rows: [
              {
                id: 'need-1',
                label: 'Migration ERP',
                ownerName: null,
                actions: [{ label: 'Contacts client', to: '/contacts', search: { company: 'Acme' } }],
              },
            ],
          }),
        ]}
      />,
    )
    const link = await screen.findByRole('link', { name: 'Contacts client' })
    expect(link).toHaveAttribute('href', '/contacts?company=Acme')
  })

  // #2708.2 — RÉFUTÉ en prod le 23/09 : « Projets plausibles (12) », le bucket
  // rendu par CE composant (pas TabProjects.tsx:298, qui n'est jamais monté
  // pour cette liste), montrait 0/12 lignes avec `line-clamp-2` et une ligne
  // à 100 px pour un libellé de 469 caractères. Même défaut, même correctif
  // que #2708.1/GA-385 : borner la HAUTEUR sans effacer le texte complet.
  it('un libellé sans borne de longueur ne dicte pas la hauteur de la ligne (#2708.2)', async () => {
    const long = 'Migration ERP multi-sites avec reprise de données historiques et bascule progressive. '
      .repeat(6)
      .trim()
    renderWithRouter(
      <LinkedObjectsSummary buckets={[bucket({ rows: [{ id: 'p-1', label: long, ownerName: null, actions: [] }] })]} />,
    )
    const label = await screen.findByTitle(long)
    expect(label).toHaveTextContent(long)
    expect(label.className).toMatch(/\bline-clamp-2\b/)
  })

  // #3683.1 — une action peut porter les paramètres de sa route : « Ouvrir »
  // atterrit sur l'objet, pas sur la liste.
  it('#3683.1 — une action avec params ouvre la route de l’objet', async () => {
    renderWithRouter(
      <LinkedObjectsSummary
        buckets={[
          bucket({
            rows: [
              {
                id: 'p-1',
                label: 'Refonte SI',
                ownerName: null,
                actions: [{ label: 'Ouvrir le projet', to: '/projects/$id', params: { id: 'p-1' } }],
              },
            ],
          }),
        ]}
      />,
    )
    const link = await screen.findByRole('link', { name: 'Ouvrir le projet' })
    expect(link).toHaveAttribute('href', '/projects/p-1')
  })
})
