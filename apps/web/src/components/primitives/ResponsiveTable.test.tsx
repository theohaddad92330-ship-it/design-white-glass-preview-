import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const isMobile = vi.fn(() => false)
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => isMobile() }))

const { ResponsiveTable } = await import('./ResponsiveTable')

type Row = { id: string; name: string; score: string; owner: string }
const rows: Row[] = [{ id: '1', name: 'ACME', score: '68/80', owner: 'Théo' }]
const columns = [
  { key: 'name', header: 'Compte', render: (r: Row) => r.name, mobile: 'title' as const },
  { key: 'owner', header: 'Porteur', render: (r: Row) => r.owner, mobile: 'meta' as const },
  { key: 'score', header: 'Score', render: (r: Row) => r.score },
]

describe('ResponsiveTable', () => {
  it('rend un vrai tableau sur un écran large', () => {
    isMobile.mockReturnValue(false)
    render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} />)
    expect(document.querySelector('table')).not.toBeNull()
  })

  it('rend des cartes sur un téléphone, sans tableau', () => {
    // Un tableau de dix colonnes qui défile latéralement oblige à l'aller-retour
    // pour chaque ligne : on lit le nom, on glisse voir le score, on a perdu le
    // nom. La comparaison — la seule raison d'être d'un tableau — devient
    // impossible.
    isMobile.mockReturnValue(true)
    render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} />)
    expect(document.querySelector('table')).toBeNull()
    expect(screen.getByText('ACME')).toBeInTheDocument()
  })

  it('porte l’étiquette de chaque valeur sur la carte', () => {
    // En mode tableau, l'entête donne le sens. Sans étiquette sur la carte,
    // « 68/80 » ne veut plus rien dire.
    isMobile.mockReturnValue(true)
    render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} />)
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('68/80')).toBeInTheDocument()
  })

  it('affiche de trop plutôt que de faire disparaître', () => {
    // Le défaut est `field`, pas `hidden` : une donnée absente d'un écran ne se
    // remarque jamais.
    isMobile.mockReturnValue(true)
    render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} />)
    expect(screen.getByText('68/80')).toBeInTheDocument()
  })

  it('rend l’état vide plutôt qu’un tableau muet', () => {
    isMobile.mockReturnValue(true)
    render(<ResponsiveTable rows={[]} columns={columns} rowKey={r => r.id} empty={<p>Aucun compte suivi.</p>} />)
    expect(screen.getByText('Aucun compte suivi.')).toBeInTheDocument()
  })
})

/**
 * LA CLASSE D'UNE COLONNE VA AUSSI À SON ENTÊTE — mesuré le 04/09/2026.
 *
 * Un `<th>` participe au calcul de largeur d'un tableau au même titre qu'un
 * `<td>` : borner la seule cellule laisse l'entête réclamer ce qu'il veut, et
 * la colonne s'étale quand même. Trois colonnes du dépôt déclaraient une
 * largeur (`w-px`, `w-8` deux fois) que leur entête ignorait depuis toujours ;
 * le défaut s'est vu sur `/missions/suivi`, où la colonne « Mission » prenait
 * 394 px sur 1 206 malgré sa borne et chassait la colonne d'action du champ.
 */
describe('ResponsiveTable — la largeur d’une colonne est tenue par les DEUX (04/09/2026)', () => {
  it('applique la classe de colonne à l’entête comme à la cellule', () => {
    // ⚠️ Le faux `useIsMobile` est PARTAGÉ par tout le fichier et garde la
    // dernière valeur posée : sans ce rappel, ce test hériterait du `true` du
    // test précédent et chercherait un `<th>` dans une liste de cartes.
    isMobile.mockReturnValue(false)
    render(
      <ResponsiveTable
        rows={[{ id: 'a', nom: 'Alpha' }]}
        rowKey={row => row.id}
        scrollLabel="Tableau"
        columns={[
          { key: 'nom', header: 'Nom', className: 'max-w-[15rem]', render: row => row.nom },
          { key: 'autre', header: 'Autre', render: () => '—' },
        ]}
      />,
    )
    const entete = screen.getByText('Nom').closest('th')
    expect(entete).toHaveClass('max-w-[15rem]')
    expect(screen.getByText('Alpha').closest('td')).toHaveClass('max-w-[15rem]')
    // Une colonne SANS classe n'en hérite pas : la garde doit distinguer.
    expect(screen.getByText('Autre').closest('th')).not.toHaveClass('max-w-[15rem]')
  })

  it('R3b — fixedLayout : table-fixed + texte qui passe à la ligne, jamais de largeur auto', () => {
    isMobile.mockReturnValue(false)
    const { rerender } = render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} />)
    expect(document.querySelector('table')).not.toHaveClass('table-fixed')
    rerender(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} fixedLayout />)
    expect(document.querySelector('table')).toHaveClass('table-fixed')
    expect(screen.getByText('ACME').closest('td')).toHaveClass('break-words')
    // #4191 (E3) — l'en-tête ne se coupe jamais au milieu d'un mot : `break-words` reste aux CELLULES.
    expect(screen.getByText('Compte').closest('th')).not.toHaveClass('break-words')
  })

  it('#2979 — dense : le padding vertical des cellules passe de py-2 à py-1, la valeur par défaut ne bouge pas', () => {
    isMobile.mockReturnValue(false)
    const { rerender } = render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} />)
    expect(screen.getByText('ACME').closest('td')).toHaveClass('py-2')
    rerender(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} dense />)
    const cell = screen.getByText('ACME').closest('td')
    expect(cell).toHaveClass('py-1')
    expect(cell).not.toHaveClass('py-2')
  })

  it('#2979 — dense ne touche pas le mobile : même borne à 768 px, mêmes cartes (p-3, min-h-11)', () => {
    isMobile.mockReturnValue(true)
    render(<ResponsiveTable rows={rows} columns={columns} rowKey={r => r.id} dense />)
    expect(document.querySelector('table')).toBeNull()
    const card = screen.getByText('ACME').closest('[class*="min-h-11"]')
    expect(card).toHaveClass('p-3')
    expect(card?.className).not.toMatch(/py-1\b/)
  })
})
