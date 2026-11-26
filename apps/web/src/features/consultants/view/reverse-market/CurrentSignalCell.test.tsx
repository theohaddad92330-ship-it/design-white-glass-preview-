import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrentSignalCell } from './CurrentSignalCell'

/**
 * #2288.1 / #2288.2 — « Signal actuel » doit dire un SIGNAL : daté, avec la
 * NATURE de ce qu'il porte, ou nommer explicitement son absence — jamais la
 * même phrase générique de méthodologie sur chaque ligne, quoi qu'il se passe.
 *
 * ⚠️ Et la NATURE de la date se LIT : un signal daté au mois ne doit pas se
 * lire comme un signal daté au jour. C'est tout l'objet de #2288.2 — une date
 * exacte sur une observation d'ailleurs désignerait quel espace a observé.
 */
describe('CurrentSignalCell — un signal daté selon sa nature, ou son absence NOMMÉE', () => {
  it('une observation de MON espace rend le JOUR', () => {
    render(<CurrentSignalCell signal={{ nature: 'own', observedOn: '2026-09-10T08:00:00.000Z' }} />)

    expect(screen.getByText(/10 sept\.? 2026/)).toBeInTheDocument()
    // Le produit tutoie (#2408, lexique) : la copie dit « ton espace ». Le test
    // suit la copie, il ne la contraint pas — mais il continue de vérifier que la
    // cellule NOMME l'espace d'observation, ce qui est la substance de #2288.1.
    expect(screen.getByText(/ton espace/i)).toBeInTheDocument()
  })

  it('une observation d’AILLEURS rend le MOIS, et DIT que c’est le mois', () => {
    render(<CurrentSignalCell signal={{ nature: 'shared', observedMonth: '2026-08' }} />)

    expect(screen.getByText(/août 2026/i)).toBeInTheDocument()
    // La granularité est ÉCRITE : sans ça, « août 2026 » se lit comme une date
    // qu'on a arrondie par paresse, pas comme une date qu'on a floutée exprès.
    expect(screen.getByText(/au mois près/i)).toBeInTheDocument()
    // Et surtout : aucun jour ne s'affiche.
    expect(screen.queryByText(/\b\d{1,2} août/)).not.toBeInTheDocument()
  })

  it('un mois illisible ne s’imprime pas — on nomme l’absence plutôt que de recopier', () => {
    render(<CurrentSignalCell signal={{ nature: 'shared', observedMonth: 'pas-un-mois' }} />)

    expect(screen.getByText(/Aucun signal actuel/)).toBeInTheDocument()
  })

  it('sans signal, dit « Aucun signal actuel » — jamais un chiffre, jamais la phrase générique', () => {
    render(<CurrentSignalCell signal={null} />)

    expect(screen.getByText(/Aucun signal actuel/)).toBeInTheDocument()
  })
})
