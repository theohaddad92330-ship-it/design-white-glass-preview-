import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { InheritedProfileBanner, INHERITED_BANNER_FLAG_KEY } from './InheritedProfileBanner'

beforeEach(() => {
  sessionStorage.clear()
})

/**
 * #2018.6 — « Voici ce que ton équipe a déjà configuré. »
 */
describe('InheritedProfileBanner', () => {
  it('affiche le message quand des clés sont héritées de la fiche entreprise', () => {
    render(<InheritedProfileBanner inheritedKeys={['esn_name', 'consultant_size']} />)
    expect(screen.getByText('Voici ce que ton équipe a déjà configuré.')).toBeInTheDocument()
  })

  it('ne s’affiche PAS quand rien n’est hérité — un nouveau workspace', () => {
    render(<InheritedProfileBanner inheritedKeys={[]} />)
    expect(screen.queryByText('Voici ce que ton équipe a déjà configuré.')).toBeNull()
  })

  it('se referme EN PLACE au clic, sans naviguer ailleurs', () => {
    render(<InheritedProfileBanner inheritedKeys={['esn_name']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compris' }))
    expect(screen.queryByText('Voici ce que ton équipe a déjà configuré.')).toBeNull()
  })

  it('ne se réaffiche pas deux fois dans le même onglet (sessionStorage)', () => {
    sessionStorage.setItem(INHERITED_BANNER_FLAG_KEY, '1')
    render(<InheritedProfileBanner inheritedKeys={['esn_name']} />)
    expect(screen.queryByText('Voici ce que ton équipe a déjà configuré.')).toBeNull()
  })
})
