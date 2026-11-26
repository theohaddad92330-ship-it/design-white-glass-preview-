/**
 * ⚠️ #2613 — CE FICHIER A BASCULÉ. Décision de Louis du 20/09/2026 :
 * « on affiche pas ce qu'on a pas, on va pas mettre non mesuré et tout ça,
 * ça envoie juste un signal négatif à l'user qui est pas utile. »
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.**
 *
 * Les assertions « NOMME ce qui manque » ci-dessous ont été RETOURNÉES : dans
 * une liste, une absence ne produit plus AUCUNE ligne. Ce qui TIENT encore, et
 * qu'on ne rouvre pas : une valeur absente ne devient jamais « 0 » (elle
 * disparaît, elle ne se chiffre pas), un axe non évaluable reste hors du
 * dénominateur, et sous un SCORE l'énoncé des axes non évaluables reste nommé.
 *
 * Si tu lis ceci en croyant à une régression : ce n'en est pas une, c'est le
 * renversement. Ne le « répare » pas. Garde : `apps/web/src/architecture/
 * une-absence-ne-fait-pas-une-ligne.test.ts`.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiscoverPerson } from '@bellum/contracts'
import { CandidatePeople } from './CandidatePeople'

/**
 * #2544.2 — LE BLOC « PERSONNES » D'UNE CARTE DE DÉCOUVRIR.
 *
 * Il affiche des gens que le registre public NOMME. Trois choses qu'il ne fait
 * pas, et chacune a son test capable de dire NON :
 *
 * 1. il n'affiche JAMAIS un champ inconnu comme une valeur — pas de tiret, pas
 *    de chaîne vide, pas de « 0 ». Ce qui manque est NOMMÉ (GA-18 / GA-19) ;
 * 2. il ne remplace JAMAIS le lieu de travail d'une personne par la ville du
 *    candidat. La ville du candidat décrit un ÉTABLISSEMENT ; « où travaille
 *    cette personne » est une autre question, et le registre n'y répond pas ;
 * 3. il ne nomme JAMAIS un fournisseur. La provenance est une FAMILLE.
 */

function person(over: Partial<DiscoverPerson> = {}): DiscoverPerson {
  return {
    name: { value: 'Claude Marchand', origin: 'registry', observedAt: '2026-08-25T16:33:12' },
    ...over,
  }
}

describe('#2544.2 — les personnes nommées, avec leur provenance', () => {
  it('affiche le nom et le mandat attestés', () => {
    render(
      <CandidatePeople
        people={[
          person({ role: { value: 'Président de SAS', origin: 'registry', observedAt: '2026-08-25T16:33:12' } }),
        ]}
        candidateCity="GARCHIZY"
      />,
    )
    expect(screen.getByText('Claude Marchand')).toBeInTheDocument()
    expect(screen.getByText(/Président de SAS/)).toBeInTheDocument()
  })

  // #2613 — ce qui manque ne s'écrit plus : la ligne « Non su : … » a disparu.
  it('SE TAIT sur ce qui manque — ni ligne d’absence, ni vide, ni zéro', () => {
    const { container } = render(<CandidatePeople people={[person()]} candidateCity="GARCHIZY" />)
    expect(screen.queryByText(/Non su/)).not.toBeInTheDocument()
    expect(screen.queryByText(/le mandat/)).not.toBeInTheDocument()
    expect(screen.queryByText(/le lieu de travail/)).not.toBeInTheDocument()
    // …et le silence n'est pas un tiret ni un zéro : GA-19 tient toujours.
    expect(container.textContent).not.toMatch(/—|N\/A|\b0\b/)
    // …mais ce qu'on SAIT reste dit : le nom est là.
    expect(screen.getByText('Claude Marchand')).toBeInTheDocument()
  })

  it('n’emprunte JAMAIS la ville du candidat pour dire où quelqu’un travaille', () => {
    const { container } = render(<CandidatePeople people={[person()]} candidateCity="GARCHIZY" />)
    expect(container.textContent).not.toContain('GARCHIZY')
  })

  it('affiche le lieu de travail quand une source l’a CONSTATÉ', () => {
    render(
      <CandidatePeople
        people={[
          person({
            workplace: {
              city: 'Garchizy',
              siret: '66204340500106',
              origin: 'human',
              observedAt: '2026-09-18T08:00:00.000Z',
            },
          }),
        ]}
        candidateCity="GARCHIZY"
      />,
    )
    expect(screen.getByText(/Garchizy/)).toBeInTheDocument()
    expect(screen.queryByText(/le lieu de travail/)).not.toBeInTheDocument()
  })

  it('nomme la provenance par FAMILLE, jamais un fournisseur', () => {
    const { container } = render(<CandidatePeople people={[person()]} candidateCity={null} />)
    // #4068.4 — la famille se dit sans registre ni fournisseur.
    expect(screen.getByText(/donnée publiée/i)).toBeInTheDocument()
    for (const brand of ['pappers', 'apollo', 'insee', 'recherche-entreprises', 'brave', 'firecrawl']) {
      expect(container.textContent?.toLowerCase()).not.toContain(brand)
    }
  })

  it('n’affiche RIEN quand personne n’est nommé — jamais « 0 personne »', () => {
    const { container: empty } = render(<CandidatePeople people={[]} candidateCity={null} />)
    expect(empty.textContent).toBe('')
    const { container: absent } = render(<CandidatePeople people={undefined} candidateCity={null} />)
    expect(absent.textContent).toBe('')
  })
})

// #3983.11 — une filiale sans dirigeant propre montre celui du groupe, avec son mandat, tel que l'IA l'écrit.
describe('dirigeant du groupe (#3983.11)', () => {
  it('rend « Dirigeant du groupe · <mandat> » à côté du nom', () => {
    render(
      <CandidatePeople
        people={[
          person({
            role: {
              value: 'Dirigeant du groupe · Directeur général',
              origin: 'registry',
              observedAt: '2026-08-25T16:33:12',
            },
          }),
        ]}
        candidateCity={null}
      />,
    )
    expect(screen.getByText(/Dirigeant du groupe · Directeur général/)).toBeTruthy()
  })
})
