import { render, screen } from '@testing-library/react'
import { PersonNameMark } from './PersonNameMark'

// #4626 — « BEN HRIZ AYA » rendu comme une entreprise, sans un mot : la carte repliée DIT que le nom est celui d'une personne.
describe('repère « nom de personne » (#4626)', () => {
  const toVerify = (code: string, otherCodes: string[] = []) => ({
    verdict: 'to_verify' as const,
    code,
    reason: '',
    otherCodes,
  })

  it('nomme une ligne dont le nom ressemble à celui d’une personne, sur la carte repliée', () => {
    render(<PersonNameMark candidate={{ name: 'BEN HRIZ AYA', qualification: toVerify('person_like_name') }} />)
    expect(screen.getByTestId('candidate-person-name')).toHaveTextContent('Nom de personne')
  })

  it('le nomme aussi quand ce n’est pas le premier doute relevé', () => {
    render(
      <PersonNameMark
        candidate={{ name: 'BEN MECHLIA AYMEN', qualification: toVerify('no_employees', ['person_like_name']) }}
      />,
    )
    expect(screen.getByTestId('candidate-person-name')).toBeInTheDocument()
  })

  it('sait dire NON — une raison sociale, un autre doute, un recommandé : aucun repère', () => {
    const a = render(<PersonNameMark candidate={{ name: 'IA DATA', qualification: toVerify('no_employees') }} />)
    expect(a.container).toBeEmptyDOMElement()
    const b = render(
      <PersonNameMark
        candidate={{
          name: 'EDG DATA & IA',
          qualification: { verdict: 'recommended', code: null, reason: '', otherCodes: [] },
        }}
      />,
    )
    expect(b.container).toBeEmptyDOMElement()
    const c = render(<PersonNameMark candidate={{ name: 'IA DATA' }} />)
    expect(c.container).toBeEmptyDOMElement()
  })
})
