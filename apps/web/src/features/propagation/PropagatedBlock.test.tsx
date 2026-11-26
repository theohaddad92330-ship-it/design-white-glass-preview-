import { missionsOfAccount, missionsOfConsultant } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * §4.4 — un bloc propagé EST un lien vers sa source, et n'est JAMAIS un champ.
 *
 * Le `Link` du routeur est remplacé par une ancre qui recopie ses props dans des
 * attributs : c'est la seule façon de vérifier OÙ le lien mène, et « où il mène »
 * est toute la règle. Un lien qui ouvre la liste entière des missions ment sur sa
 * source, ce qui est pire que pas de lien du tout.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={to} data-to={to} data-search={JSON.stringify(search ?? {})} {...rest}>
      {children}
    </a>
  ),
}))

const { PropagatedBlock, propagatedSearch } = await import('./PropagatedBlock')

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const CONSULTANT = '22222222-2222-4222-8222-222222222222'

afterEach(cleanup)

describe('le lien mène à la SOURCE, et à elle seule', () => {
  it('porte le compte du contrat, pas la liste entière des missions', () => {
    render(<PropagatedBlock source={missionsOfAccount(ACCOUNT)}>12 400 €</PropagatedBlock>)
    const link = screen.getByRole('link')
    expect(link.getAttribute('data-to')).toBe('/missions')
    // Le filtre est celui du CONTRAT — jamais recomposé ici. Le jour où le
    // contrat change de clé, c'est ce test qui tombe, pas l'écran d'un client.
    expect(JSON.parse(link.getAttribute('data-search') ?? '{}')).toEqual({ accountId: ACCOUNT })
  })

  it('porte le consultant pour les blocs de consultant', () => {
    render(<PropagatedBlock source={missionsOfConsultant(CONSULTANT)}>Placé 4 fois</PropagatedBlock>)
    expect(JSON.parse(screen.getByRole('link').getAttribute('data-search') ?? '{}')).toEqual({
      consultantId: CONSULTANT,
    })
  })

  it('les deux constructeurs du contrat visent bien /missions — sinon le lien mentirait', () => {
    // La garde qui compte : si un jour `missionsOfAccount` pointait ailleurs,
    // `propagatedSearch` rendrait `null` et le chiffre s'afficherait NU. Mieux
    // vaut un chiffre nu qu'un lien qui promet une preuve et ouvre autre chose —
    // mais il faut le SAVOIR, et c'est ici qu'on l'apprend.
    expect(propagatedSearch(missionsOfAccount(ACCOUNT).href)).toEqual({ accountId: ACCOUNT })
    expect(propagatedSearch(missionsOfConsultant(CONSULTANT).href)).toEqual({ consultantId: CONSULTANT })
  })

  it('ne rend AUCUN lien si le contrat pointe ailleurs — la valeur reste lisible', () => {
    expect(propagatedSearch('/pilotage?accountId=x')).toBeNull()
    render(
      <PropagatedBlock source={{ kind: 'missions', href: '/pilotage?accountId=x', label: 'ailleurs' }}>
        12 400 €
      </PropagatedBlock>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('12 400 €')).toBeTruthy()
  })
})

describe('un bloc propagé ne s’édite pas', () => {
  it('ne rend ni champ, ni zone de saisie, ni bouton', () => {
    const { container } = render(<PropagatedBlock source={missionsOfAccount(ACCOUNT)}>12 400 €</PropagatedBlock>)
    // La règle est tenue par l'ABSENCE de code, comme côté serveur : il n'y a
    // aucun chemin d'écriture à désactiver, il n'y en a jamais eu.
    expect(container.querySelectorAll('input, textarea, select, button')).toHaveLength(0)
    expect(container.querySelector('[contenteditable]')).toBeNull()
  })
})

describe('ce qui se clique se tabule, et se nomme dans la langue du lecteur', () => {
  it('est une ancre — donc au clavier, sans qu’on ait rien à ajouter', () => {
    render(<PropagatedBlock source={missionsOfAccount(ACCOUNT)}>12 400 €</PropagatedBlock>)
    expect(screen.getByRole('link').tagName).toBe('A')
  })

  it('ne recopie PAS le libellé français du contrat dans l’interface', () => {
    // `source.label` vaut « Les missions de ce compte » : écrit en dur dans le
    // contrat, parce que c'est là que la règle se documente. Le sortir tel quel
    // mettrait du français dans une interface anglaise.
    render(<PropagatedBlock source={missionsOfAccount(ACCOUNT)}>12 400 €</PropagatedBlock>)
    const name = screen.getByRole('link').getAttribute('aria-label') ?? ''
    expect(name.length).toBeGreaterThan(10)
    expect(name).not.toBe(missionsOfAccount(ACCOUNT).label)
  })
})
