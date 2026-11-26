import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { NeedDiscoveryRails } from './NeedDiscoveryRails'

/**
 * #2067.18-.30 — LES DEUX RAILS, RENDUS.
 *
 * Ce que ce fichier garde : la CONCLUSION nomme ce qui manque (#2067.30), et
 * jamais « 0 » ou un jugement sur l'affaire — seulement les clés absentes,
 * traduites.
 */
const NOW = new Date('2026-09-16T00:00:00.000Z')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur systèmes',
    status: 'to_qualify',
    skills: [],
    staffable: 'unknown',
    context: null,
    languages: undefined,
    clearances: undefined,
    budget_cents: null,
    start_on: null,
    duration_months: null,
    deadline_at: null,
    ...over,
  } as unknown as OpenNeedRow
}

describe('NeedDiscoveryRails', () => {
  it('#2067.30 — nomme les sept clés du rail client quand rien n’est mesuré, jamais « 0 »', () => {
    render(<NeedDiscoveryRails need={need({ status: 'won' })} now={NOW} />)
    const conclusion = screen.getByText(/Rail client — manque/)
    expect(conclusion.textContent).not.toMatch(/(?:^|[^0-9])0(?:[^0-9]|$)/)
    expect(conclusion.textContent).toContain('Problème')
    expect(conclusion.textContent).toContain('Décision')
  })

  it('#2067.21 / #2067.22 — décision et voie d’achat manquent MÊME quand tout le reste du rail client est mesuré', () => {
    render(
      <NeedDiscoveryRails
        need={need({
          context: 'Migration ERP en retard',
          languages: [],
          clearances: [],
          budget_cents: 100_000_00,
          start_on: '2026-10-01',
          skills: [{ term: 'SAP', level: null, required: true }],
          staffable: 'yes',
        })}
        now={NOW}
      />,
    )
    const conclusion = screen.getByText(/Rail client — manque/)
    expect(conclusion.textContent).toContain('Décision')
    expect(conclusion.textContent).toContain('Voie d’achat')
    expect(conclusion.textContent).not.toContain('Budget')
    expect(conclusion.textContent).not.toContain('Timing')
  })

  it('#2067.25-.29 — DÉCISION Louis 17/09 : aucun consultant positionné se dit EN CLAIR, jamais un « manque » générique', () => {
    render(<NeedDiscoveryRails need={need({ status: 'won' })} now={NOW} />)
    expect(screen.getByText('Aucun consultant positionné sur ce besoin.')).toBeInTheDocument()
    expect(screen.queryByText(/Rail consultant — manque/)).not.toBeInTheDocument()
  })

  it('#2067.25-.29 — un consultant POSITIONNÉ nomme le rail et laisse ses faits non mesurés visibles', async () => {
    renderWithRouter(
      <NeedDiscoveryRails
        need={need({
          positioned_consultant: {
            submissionId: 's-1',
            consultantId: 'c-1',
            consultantName: 'Inès Kaczmarek',
            submittedAt: '2026-09-09T00:00:00.000Z',
            fitScore: null,
            availability: 'sous_1_mois',
            proposedRateCents: 72_000,
            mobilityKnown: true,
            otherActiveSubmissions: 0,
          },
          positioned_consultants_count: 1,
        })}
        now={NOW}
      />,
    )
    // #2152.49 a ajouté un second endroit qui nomme la personne (le lien
    // Reverse Market) : le texte du TITRE se cible par sa forme exacte,
    // désormais ambiguë sur un simple `/Inès Kaczmarek/`.
    expect(await screen.findByText('Rail consultant — Inès Kaczmarek')).toBeInTheDocument()
    const conclusion = screen.getByText(/Rail consultant — manque/)
    expect(conclusion.textContent).toContain('Accord réel et restrictions')
    expect(conclusion.textContent).not.toContain('TJM')
    expect(conclusion.textContent).not.toContain('Mobilité')
  })

  // #2152.49 — « Reverse Market accessible depuis un besoin » : l'écran de
  // prospection inversée (`/consultants/$id/reverse-market`) existe déjà pour
  // un consultant précis, mais rien sur la fiche d'un BESOIN n'y menait. Le
  // consultant POSITIONNÉ est le seul candidat non ambigu ici (voir le
  // docblock de `need-discovery-rails.ts`) — même lien que
  // `RenewalDecisionPanel.tsx` et `VivierTableRow.tsx`, pas un second écran.
  it('#2152.49 — le consultant positionné porte un lien vers Reverse Market', async () => {
    renderWithRouter(
      <NeedDiscoveryRails
        need={need({
          positioned_consultant: {
            submissionId: 's-1',
            consultantId: 'c-1',
            consultantName: 'Inès Kaczmarek',
            submittedAt: '2026-09-09T00:00:00.000Z',
            fitScore: null,
            availability: 'sous_1_mois',
            proposedRateCents: 72_000,
            mobilityKnown: true,
            otherActiveSubmissions: 0,
          },
          positioned_consultants_count: 1,
        })}
        now={NOW}
      />,
    )
    const link = await screen.findByRole('link', { name: /Trouver des missions/ })
    expect(link).toHaveAttribute('href', '/consultants/c-1/reverse-market')
  })

  it('#2152.49 — aucun lien Reverse Market quand personne n’est positionné', async () => {
    renderWithRouter(<NeedDiscoveryRails need={need({ status: 'won' })} now={NOW} />)
    // Contrôle positif : l'écran EST rendu (sinon l'absence du lien serait
    // vraie pour la mauvaise raison — la route pas encore résolue).
    expect(await screen.findByText('Aucun consultant positionné sur ce besoin.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Trouver des missions/ })).not.toBeInTheDocument()
  })

  it('#2067.25-.29 — plusieurs positionnés : le plus récent est nommé, « et N autres » ne les cache pas', async () => {
    renderWithRouter(
      <NeedDiscoveryRails
        need={need({
          positioned_consultant: {
            submissionId: 's-1',
            consultantId: 'c-1',
            consultantName: 'Inès Kaczmarek',
            submittedAt: '2026-09-09T00:00:00.000Z',
            fitScore: null,
            availability: null,
            proposedRateCents: null,
            mobilityKnown: false,
            otherActiveSubmissions: 0,
          },
          positioned_consultants_count: 3,
        })}
        now={NOW}
      />,
    )
    expect(await screen.findByText(/et 2 autres positionnés/)).toBeInTheDocument()
  })

  it('n’affiche jamais un critère protégé de personne (âge, genre, origine, nationalité) sur le rail consultant', () => {
    render(<NeedDiscoveryRails need={need({})} now={NOW} />)
    const forbidden = /(?:\bâge\b|\bgenre\b|origine|nationalité)/iu
    expect(document.body.textContent ?? '').not.toMatch(forbidden)
  })

  describe('#2175.30 / #2175.32 — quatre états nommés, et « prêt à démarrer »', () => {
    const positioned = {
      submissionId: 's-1',
      consultantId: 'c-1',
      consultantName: 'Inès Kaczmarek',
      submittedAt: '2026-09-09T00:00:00.000Z',
      fitScore: 80,
      availability: 'immediate',
      proposedRateCents: 72_000,
      mobilityKnown: true,
      otherActiveSubmissions: 0,
      agreementConfirmed: true,
    }
    const complete = {
      context: 'Le client perd des dossiers',
      languages: [],
      clearances: [],
      budget_cents: 10_000_00,
      decision_known: true,
      buying_process_known: true,
      start_on: '2026-10-01',
      skills: [],
      positioned_consultants_count: 1,
    }

    it('chaque fait porte son état EN TOUTES LETTRES (jamais la couleur seule)', async () => {
      renderWithRouter(<NeedDiscoveryRails need={need({ context: 'x' })} now={NOW} />)
      expect((await screen.findAllByText('Confirmé')).length).toBeGreaterThan(0)
      expect(screen.getAllByText('À vérifier').length).toBeGreaterThan(0)
    })

    it('un positionné déclaré indisponible rend le fait BLOQUANT', async () => {
      renderWithRouter(
        <NeedDiscoveryRails
          need={need({ ...complete, positioned_consultant: { ...positioned, availability: 'indisponible' } })}
          now={NOW}
        />,
      )
      expect(await screen.findByText('Bloquant')).toBeInTheDocument()
      expect(screen.getByText(/Pas encore prêt à démarrer/).textContent).toContain('1 bloquant')
    })

    it('les deux rails sécurisés ⇒ « Prêt à démarrer »', async () => {
      renderWithRouter(<NeedDiscoveryRails need={need({ ...complete, positioned_consultant: positioned })} now={NOW} />)
      expect(await screen.findByText(/Prêt à démarrer : les deux rails sont sécurisés/)).toBeInTheDocument()
    })

    it('le verdict négatif ne dit jamais « 0 » d’un compte vide', async () => {
      renderWithRouter(<NeedDiscoveryRails need={need({ status: 'won' })} now={NOW} />)
      const verdict = await screen.findByText(/Pas encore prêt à démarrer/)
      expect(verdict.textContent).not.toMatch(/(?:^|[^0-9])0(?:[^0-9]|$)/)
    })
  })
})
