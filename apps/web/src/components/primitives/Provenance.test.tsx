import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Provenance } from './Provenance'

/**
 * R15-13 du 15/09/2026 — mesuré EN PRODUCTION (`5ca597d5a`, fiche contact
 * THALES › Informations clés › Email professionnel) :
 *
 *   « lu dans un outil connecté · le 2026-09-11T07:22:37:46.992Z »
 *
 * Deux défauts dans une seule ligne. L'ISO s'affichait TEL QUEL — la primitive
 * interpolait `observedAt` brut dans « le {{date}} » alors qu'un formateur
 * localisé existait déjà à côté (`formatContactDate`) —, et la chaîne était
 * MAL FORMÉE (`37:46.992` : deux `:` là où il en faut un).
 *
 * Le second défaut est ce qui rend le premier grave : tant que la primitive
 * recopie ce qu'on lui donne, elle publie n'importe quelle chaîne comme si
 * c'était une date. Une valeur qu'aucun calendrier ne sait lire n'est PAS une
 * date : elle se nomme inconnue (« non mesuré n'est jamais 0 »), elle ne
 * s'imprime pas.
 */
describe('Provenance — la date se LIT (R15-10)', () => {
  it('rend une date localisée, jamais l’ISO brut', () => {
    render(<Provenance source="connector" observedAt="2026-09-11T07:22:46.992Z" />)

    expect(screen.queryByText(/2026-09-11T07:22/)).not.toBeInTheDocument()
    // Le format du reste du dossier : « 11 sept. 2026 » (fr-FR, mois court).
    expect(screen.getByText(/11 sept\.? 2026/)).toBeInTheDocument()
  })

  it('sait dire NON : une chaîne qu’aucun calendrier ne lit ne s’imprime pas', () => {
    render(<Provenance source="connector" observedAt="2026-09-11T07:22:37:46.992Z" />)

    expect(screen.queryByText(/37:46\.992/)).not.toBeInTheDocument()
    // Elle est NOMMÉE inconnue — et SANS `nameMissingDate`, parce qu'une date
    // ILLISIBLE n'est pas une date absente : quelque chose est là, et se taire
    // cacherait la donnée cassée au lieu de la montrer.
    expect(screen.getByText(/date inconnue/i)).toBeInTheDocument()
  })

  it('sait dire NON : sans date et sans `nameMissingDate`, rien ne s’invente', () => {
    render(<Provenance source="connector" observedAt={null} />)

    expect(screen.getByText(/lu dans un outil connecté/)).toBeInTheDocument()
    expect(screen.queryByText(/ · le /)).not.toBeInTheDocument()
  })
})
