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
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverPartnerRow } from '@/features/discover/lib/discover-result-rows'
import { PartnerResultRow } from './PartnerResultRow'

function row(overrides: Partial<DiscoverPartnerRow> = {}): DiscoverPartnerRow {
  return {
    siren: '111111111',
    name: 'Acme ESN',
    accountId: null,
    portfolioState: 'new',
    nafCode: '62.01Z',
    nafClass: 'esn',
    sector: 'Édition de logiciels',
    city: 'Toulouse',
    department: '31',
    headcountRange: '50-249',
    observed: [],
    unknown: [],
    complementarity: null,
    rank2: 'unknown',
    ...overrides,
  }
}

/**
 * #2165.55, RENVERSÉ par #2613 le 20/09/2026. Le 19/09 on exigeait que
 * l'absence de complémentarité soit DITE ; Louis a tranché l'inverse pour les
 * listes le lendemain. Ce qui reste exigé, et qui était le vrai sujet du
 * 19/09 : aucun bloc VIDE, et aucun score à 0. `PartnerResultRow` est l'écran
 * RÉEL de `/discover?type=partners` (`ProjectionResults.tsx` →
 * `PartnersResults` → cette ligne, jamais `CandidateCard`).
 */
describe('PartnerResultRow — complémentarité (#2165.55, restreint par #2613)', () => {
  it('inconnue : RIEN n’est écrit — ni ligne « Non su », ni bloc vide, ni score à 0', async () => {
    const { container } = renderWithRouter(
      <PartnerResultRow row={row({ complementarity: null, unknown: ['complementarity'] })} onQualify={() => {}} />,
    )
    await screen.findByText('Acme ESN')
    expect(screen.queryByTestId('partner-complementarity')).toBeNull()
    expect(screen.queryByText(/Non su/)).not.toBeInTheDocument()
    // Ce que le 19/09 défendait vraiment, et qui TIENT : pas de zéro fabriqué.
    expect(container.textContent).not.toMatch(/\b0\s*\/|\b0\s*%/)
  })

  it('connue : la carte montre le bloc, jamais dans « Non su »', async () => {
    renderWithRouter(
      <PartnerResultRow
        row={row({
          complementarity: {
            score: null,
            axes: [
              { axis: 'sectors', score: 100 },
              { axis: 'size', score: null },
              { axis: 'expertise', score: null },
              { axis: 'accounts', score: null },
            ],
            unmeasuredAxes: ['size', 'expertise', 'accounts'],
          },
          unknown: [],
        })}
        onQualify={() => {}}
      />,
    )
    const block = await screen.findByTestId('partner-complementarity')
    expect(block.textContent).toContain('100')
    const unknownLine = screen.queryByText(/Non su/)
    expect(unknownLine?.textContent ?? '').not.toContain('complémentarité')
  })
})

/**
 * #2165.56 / #2151.34, RENVERSÉ par #2613 le 20/09/2026.
 *
 * Le 19/09 on exigeait les TROIS états toujours rendus — « l'absence de signal
 * EST l'un des trois états, jamais une absence d'affichage ». Louis a tranché
 * l'inverse le lendemain pour les listes : « on affiche pas ce qu'on a pas ».
 * Les deux états qui disent quelque chose restent ; « Rang 2 : non su » ne
 * s'écrit plus.
 */
describe('PartnerResultRow — statut de rang 2 (#2165.56 / #2151.34)', () => {
  it('déclaré', async () => {
    renderWithRouter(<PartnerResultRow row={row({ rank2: 'declared' })} onQualify={() => {}} />)
    await screen.findByText('Acme ESN')
    expect(screen.getByText(/déclaré/i)).toBeInTheDocument()
  })

  it('observé', async () => {
    renderWithRouter(<PartnerResultRow row={row({ rank2: 'observed' })} onQualify={() => {}} />)
    await screen.findByText('Acme ESN')
    expect(screen.getByText(/observé/i)).toBeInTheDocument()
  })

  // #2613 — un rang 2 inconnu ne produit plus de ligne.
  it('inconnu — RIEN n’est écrit', async () => {
    renderWithRouter(<PartnerResultRow row={row({ rank2: 'unknown' })} onQualify={() => {}} />)
    await screen.findByText('Acme ESN')
    expect(screen.queryByText(/non su/i)).not.toBeInTheDocument()
    // …et surtout pas un « 0 » ni un tiret à la place.
    expect(screen.queryByText(/^[—-]$/)).not.toBeInTheDocument()
  })
})
