import type { AccountIntelligenceRecommendation } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountRecommendationCard } from './AccountRecommendationCard'

function recommendation(overrides: Partial<AccountIntelligenceRecommendation> = {}): AccountIntelligenceRecommendation {
  return {
    id: 'entry-path-0',
    label: 'Direction du portail client',
    detail: 'Refonte en cours',
    nature: 'inference',
    provenance: { source: 'inference', observedAt: '2026-09-02T00:00:00.000Z' },
    freshness: 'fresh',
    confidence: { level: 'deduced', corroborationCount: null },
    limit: 'not_a_commitment',
    check: 'confirm_with_contact',
    action: 'open_contacts',
    ...overrides,
  }
}

describe('AccountRecommendationCard — les huit métadonnées', () => {
  it('#2116.17-23 — rend la nature, la source, la date, la fraîcheur, la confiance et la vérification — plus la limite (#3712.6)', async () => {
    // #3672 revient sur le libellé de #2116.18 (« déduit par le modèle »), délibérément ; ce qui tient :
    // la source reste dite comme une DÉDUCTION (« Hypothèse à valider »), jamais comme un fait.
    renderWithRouter(<AccountRecommendationCard recommendation={recommendation()} onTabChange={vi.fn()} />)
    // #3672 revient sur #2116.x, délibérément (Louis 10/10) : « inférence » devient « Déduit par Laura »,
    // et le badge de confiance « déduite » disparaît (doublon de la ligne Provenance « Hypothèse à valider »).
    expect(await screen.findByText('Déduit par Laura')).toBeInTheDocument() // #2116.17
    expect(screen.queryByText('inférence')).toBeNull()
    expect(screen.queryByText('déduite')).toBeNull() // #2116.21 (niveau « déduite » : pas de badge)
    expect(screen.getByText(/Hypothèse à valider/)).toBeInTheDocument() // #2116.18
    expect(screen.getByText(/le 0?2\/0?9\/2026|2026/)).toBeInTheDocument() // #2116.19
    expect(screen.getByText('information récente')).toBeInTheDocument() // #2116.20
    // #3712.6 (DEC-4036 Q9, Louis 19/10 : « c'est parasite ») revient sur #2116.22, délibérément : la fiche
    // compte ne NOMME plus les limites d'une recommandation (« Ne couvre pas : … »).
    expect(screen.queryByText(/Ne couvre pas/)).toBeNull()
    expect(screen.queryByText(/une porte n'est pas un rendez-vous obtenu/)).toBeNull()
    expect(screen.getByText(/confirmer auprès d'un interlocuteur/)).toBeInTheDocument() // #2116.23
  })

  it('#2116.19-20 — sait dire NON : sans date, la carte écrit « date inconnue », pas un vide', async () => {
    renderWithRouter(
      <AccountRecommendationCard
        recommendation={recommendation({
          provenance: { source: 'market_memory', observedAt: null },
          freshness: 'undated',
        })}
        onTabChange={vi.fn()}
      />,
    )
    expect(await screen.findAllByText(/date inconnue/)).not.toHaveLength(0)
  })

  it('#2116.21 — la confiance est un NIVEAU justifié par un compte, jamais un pourcentage', async () => {
    const { container } = renderWithRouter(
      <AccountRecommendationCard
        recommendation={recommendation({ confidence: { level: 'corroborated', corroborationCount: 3 } })}
        onTabChange={vi.fn()}
      />,
    )
    expect(await screen.findByText(/corroborée — 3 sources concordantes/)).toBeInTheDocument()
    // Aucune probabilité affichée : ni « % », ni une note sur 100.
    expect(container.textContent).not.toMatch(/%/)
  })

  it('#2116.24 — l’action PROPOSE : elle ouvre un onglet, elle n’envoie rien', async () => {
    const onTabChange = vi.fn()
    renderWithRouter(<AccountRecommendationCard recommendation={recommendation()} onTabChange={onTabChange} />)
    const button = await screen.findByRole('button', { name: 'Voir les contacts' })
    await userEvent.click(button)
    expect(onTabChange).toHaveBeenCalledWith('contacts')
  })

  it('#2116.24 — « préparer un message » ouvre les contacts : préparer commence par choisir à QUI', async () => {
    const onTabChange = vi.fn()
    renderWithRouter(
      <AccountRecommendationCard
        recommendation={recommendation({ action: 'prepare_message' })}
        onTabChange={onTabChange}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Préparer un message' }))
    expect(onTabChange).toHaveBeenCalledWith('contacts')
  })

  // #2117.50 — un élément PRÉPARÉ AUTOMATIQUEMENT PAR BELLUMAI (ici, la
  // recommandation d'ouverture déduite par le modèle) se distingue en
  // lavande. Le trio `--accent-soft-bg/-border/-text` existe déjà et sert
  // ailleurs (discover, onboarding, chat) — jamais dans le dossier de
  // compte : rien n'y marquait la carte comme une SUGGESTION plutôt qu'un
  // fait relevé.
  it('#2117.50 — la carte porte le trio lavande accent-soft, jamais une couleur brute', async () => {
    const { container } = renderWithRouter(
      <AccountRecommendationCard recommendation={recommendation()} onTabChange={vi.fn()} />,
    )
    await screen.findByText('Déduit par Laura')
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toMatch(/bg-\[var\(--accent-soft-bg\)\]/)
    expect(card.className).toMatch(/border-\[var\(--accent-soft-border\)\]/)
    expect(card.className).toMatch(/text-\[var\(--accent-soft-text\)\]/)
  })
})

// #3672.5 — « Voir les éléments » : origine, période couverte, preuves autorisées, depuis la recommandation.
describe('AccountRecommendationCard — Voir les éléments', () => {
  const historical = recommendation({
    nature: 'observation',
    provenance: { source: 'market_memory', observedAt: '2024-12-31T00:00:00.000Z' },
    freshness: 'stale',
  })

  it('est replié par défaut : la lecture principale reste fait + implication', async () => {
    renderWithRouter(<AccountRecommendationCard recommendation={historical} onTabChange={vi.fn()} />)
    const toggle = await screen.findByRole('button', { name: 'Voir les éléments' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Période documentée/)).not.toBeInTheDocument()
  })

  it('un historique de 2024 se dit comme une PÉRIODE documentée, pas comme la dernière activité', async () => {
    renderWithRouter(<AccountRecommendationCard recommendation={historical} onTabChange={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Voir les éléments' }))
    expect(screen.getByText(/Période documentée : jusqu'au .*2024/)).toBeInTheDocument()
    expect(screen.getByText(/n'est pas la dernière activité/)).toBeInTheDocument()
  })

  // #3672 (R4 07/10, réfuté en recette : « Historique observé · date inconnue ») — ni la
  // phrase « Période documentée », ni une ligne de repli (« date inconnue », « Aucune période
  // couverte… ») : non calculable ⇒ AUCUNE ligne (brief R4, qui revient sur le repli ajouté
  // plus tôt le même jour, jugé trop bavard pour ce qui n'est qu'un détail replié).
  it('sait dire NON : une hypothèse ne reçoit aucune ligne de période, ni inventée ni de repli', async () => {
    renderWithRouter(<AccountRecommendationCard recommendation={recommendation()} onTabChange={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Voir les éléments' }))
    expect(screen.queryByText(/Période documentée/)).not.toBeInTheDocument()
    expect(screen.queryByText(/période/i)).not.toBeInTheDocument()
  })

  it('un historique sans date ne fabrique pas de période, et ne dit pas non plus « date inconnue »', async () => {
    renderWithRouter(
      <AccountRecommendationCard
        recommendation={recommendation({
          provenance: { source: 'market_memory', observedAt: null },
          freshness: 'undated',
        })}
        onTabChange={vi.fn()}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Voir les éléments' }))
    expect(screen.queryByText(/Période documentée/)).not.toBeInTheDocument()
    // Le panneau « Voir les éléments » n'a QUE le bouton « Ouvrir les preuves » : aucune ligne
    // de période, « date inconnue » restant réservée à la provenance du fait lui-même, en bas
    // de carte (doctrine : une date absente s'y lit), jamais recopiée dans ce panneau replié.
    const openProofs = screen.getByRole('button', { name: 'Ouvrir les preuves du compte' })
    expect(openProofs.parentElement?.textContent).toBe('Ouvrir les preuves du compte')
  })

  it('ouvre les preuves AUTORISÉES du compte, sans les recopier ici', async () => {
    const onTabChange = vi.fn()
    renderWithRouter(<AccountRecommendationCard recommendation={historical} onTabChange={onTabChange} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Voir les éléments' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir les preuves du compte' }))
    expect(onTabChange).toHaveBeenCalledWith('proofs')
  })
})

// #3672.2 — « Information vérifiée » : seulement quand l'origine la porte (registre officiel), jamais une génération.
describe('AccountRecommendationCard — le mot « vérifiée »', () => {
  it('une identité de registre officiel se lit « Information vérifiée »', async () => {
    renderWithRouter(
      <AccountRecommendationCard
        recommendation={recommendation({
          nature: 'fact',
          provenance: { source: 'registry_identity', observedAt: '2026-09-02T00:00:00.000Z' },
        })}
        onTabChange={vi.fn()}
      />,
    )
    expect(await screen.findByText(/Information vérifiée/)).toBeInTheDocument()
  })

  it('une inférence du modèle ne se lit JAMAIS « vérifiée »', async () => {
    const { container } = renderWithRouter(
      <AccountRecommendationCard recommendation={recommendation()} onTabChange={vi.fn()} />,
    )
    await screen.findByText('Déduit par Laura')
    expect(container.textContent).not.toMatch(/vérifiée/)
  })
})

describe('RV4-E-FIX 4295.21 — un prior de la base de référence se badge « estimé »', () => {
  it.each(['dataforge', 'market_memory', 'inference'] as const)(
    'une recommandation tirée de %s porte le badge estimé (hypothèse)',
    async source => {
      const { container } = renderWithRouter(
        <AccountRecommendationCard
          recommendation={recommendation({ provenance: { source, observedAt: '2026-09-02T00:00:00.000Z' } })}
          onTabChange={vi.fn()}
        />,
      )
      await screen.findByText('Direction du portail client')
      expect(container.querySelector('[data-estimate="hypothesis"]')).not.toBeNull()
    },
  )

  it('sait dire NON : une recommandation observée (donnée courante) ne porte aucun badge estimé', async () => {
    const { container } = renderWithRouter(
      <AccountRecommendationCard
        recommendation={recommendation({
          nature: 'fact',
          provenance: { source: 'current_data', observedAt: '2026-09-02T00:00:00.000Z' },
        })}
        onTabChange={vi.fn()}
      />,
    )
    await screen.findByText('Direction du portail client')
    expect(container.querySelector('[data-estimate]')).toBeNull()
  })
})
