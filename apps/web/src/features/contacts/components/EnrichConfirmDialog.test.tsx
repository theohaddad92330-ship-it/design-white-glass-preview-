import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useEnrichmentDurationEstimate } from '@/features/contacts/hooks/useEnrichmentDurationEstimate'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { EnrichConfirmDialog } from './EnrichConfirmDialog'

vi.mock('@/features/contacts/hooks/useEnrichmentDurationEstimate', () => ({
  useEnrichmentDurationEstimate: vi.fn(),
}))
// #2297 (30/09/2026) — espace réel par défaut (`useIsDemo` → `false`), comme
// la charge crédits non résolue le rend déjà (`useIsDemo.ts`, GA-26).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: vi.fn(() => false) }))

function mockEstimate(estimate: { medianMs: number; sampleSize: number } | null) {
  vi.mocked(useEnrichmentDurationEstimate).mockReturnValue({
    data: { estimate },
  } as unknown as ReturnType<typeof useEnrichmentDurationEstimate>)
}

/**
 * #2120.57 / #2297.23 — le dialogue « Enrichir ce contact ? » annonce une
 * durée MESURÉE quand le serveur en a une, et garde la ligne honnête d'avant
 * sinon (non mesuré ≠ 0, GA-18/19).
 */
describe('EnrichConfirmDialog — la durée annoncée (#2120.57, #2297.23)', () => {
  it('sans médiane (moins de 5 mesures), garde « Durée : non mesurée »', () => {
    mockEstimate(null)

    render(<EnrichConfirmDialog open count={1} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText('Durée : non mesurée')).toBeInTheDocument()
  })

  it('avec médiane, UN contact : annonce la médiane et le nombre d’échantillons', () => {
    mockEstimate({ medianMs: 32_000, sampleSize: 18 })

    render(<EnrichConfirmDialog open count={1} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText('Durée estimée : environ 32 s (médiane de 18 enrichissements récents)')).toBeInTheDocument()
  })

  it('avec médiane, un LOT (count > 1) : annonce un taux PAR CONTACT, jamais un total inventé', () => {
    mockEstimate({ medianMs: 35_000, sampleSize: 50 })

    render(<EnrichConfirmDialog open count={8} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText('Durée estimée : environ 35 s par contact, 8 contacts')).toBeInTheDocument()
    // Aucun total au-delà de cette multiplication : pas de « 280 s » écrit en dur.
    expect(screen.queryByText(/280/)).not.toBeInTheDocument()
  })

  // #2120.57 — la médiane mesure `enrichContact` (chemin enrichissement) ;
  // le chemin RECHERCHE (`free`) appelle `enrich-contacts` (Phase 2), jamais
  // `enrichContact`. Lui annoncer la médiane décrirait une mesure qui ne
  // parle pas de lui : non mesuré ≠ 0 (GA-18/19), donc « non mesurée »
  // même quand une médiane existe pour l'AUTRE chemin.
  it('sans compte (chemin RECHERCHE, `free`), n’annonce jamais la médiane de `enrichContact`', () => {
    mockEstimate({ medianMs: 20_000, sampleSize: 6 })

    render(<EnrichConfirmDialog open free onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    // #3819 — « on n'affiche pas ce qu'on n'a pas » : la ligne disparaît.
    expect(screen.queryByText(/Durée/)).not.toBeInTheDocument()
    expect(screen.queryByText(/environ 20 s/)).not.toBeInTheDocument()
  })

  it('#3819 — la recherche nomme l’entreprise visée', () => {
    mockEstimate(null)

    render(<EnrichConfirmDialog open free subject="Arquus" onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText('Lancer une recherche de contacts pour Arquus ?')).toBeInTheDocument()
  })

  it("n'appelle pas l'estimation tant que le dialogue est fermé", () => {
    mockEstimate(null)

    render(<EnrichConfirmDialog open={false} count={1} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(useEnrichmentDurationEstimate).toHaveBeenCalledWith(false)
  })
})

/**
 * #2120.57 — mesuré en production le 20/09 : une médiane sous 500 ms
 * affichait « Durée estimée : environ 0 s ». Ce test REND l'écran (pas
 * seulement la fonction pure `enrichmentDurationAnnouncement`) et refuse
 * qu'un « 0 » chiffré y atteigne, quelle que soit la médiane en entrée.
 */
describe('EnrichConfirmDialog — jamais de « 0 » chiffré pour une durée réelle (#2120.57)', () => {
  it.each([0, 1, 100, 320, 499])("médiane de %i ms : « moins d'une seconde », jamais « 0 s »", medianMs => {
    mockEstimate({ medianMs, sampleSize: 7 })

    render(<EnrichConfirmDialog open count={1} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText(/moins d'une seconde/i)).toBeInTheDocument()
    expect(screen.queryByText(/\b0\s*s\b/)).not.toBeInTheDocument()
  })

  it('même garantie pour un LOT (count > 1)', () => {
    mockEstimate({ medianMs: 200, sampleSize: 6 })

    render(<EnrichConfirmDialog open count={8} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText(/moins d'une seconde/i)).toBeInTheDocument()
    expect(screen.queryByText(/\b0\s*s\b/)).not.toBeInTheDocument()
  })
})

/**
 * #2297.25 / #2297.26 — le reste de la sélection ne disparaissait plus qu'en
 * silence entre la sélection et l'annonce (`planBulkEnrichment.excluded`).
 */
describe('EnrichConfirmDialog — annonce les exclusions du lot (#2297.25/#2297.26)', () => {
  it('sans exclusion, aucune ligne', () => {
    mockEstimate(null)
    render(<EnrichConfirmDialog open count={2} onConfirm={vi.fn()} onOpenChange={vi.fn()} excluded={[]} />)
    expect(screen.queryByText(/exclu/i)).not.toBeInTheDocument()
  })

  it('nomme chaque raison, avec son compte', () => {
    mockEstimate(null)
    render(
      <EnrichConfirmDialog
        open
        count={2}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        excluded={[
          { reason: 'identity_unresolved', count: 1 },
          { reason: 'already_has_contact_info', count: 3 },
        ]}
      />,
    )
    expect(screen.getByText('1 contact exclu — identité non résolue')).toBeInTheDocument()
    expect(screen.getByText("3 contacts exclus — déjà pourvus d'une coordonnée")).toBeInTheDocument()
  })

  it('#2297 — le titre compte la SÉLECTION entière : 1 facturable + 1 exclu = « 2 contacts », jamais « ce contact »', () => {
    mockEstimate(null)

    render(
      <EnrichConfirmDialog
        open
        count={1}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        excluded={[{ reason: 'on_cooldown', count: 1 }]}
      />,
    )

    expect(screen.getByText('Enrichir 2 contacts ?')).toBeInTheDocument()
    expect(screen.queryByText('Enrichir ce contact ?')).not.toBeInTheDocument()
  })

  it('#2297 — un seul contact sans exclusion garde le singulier', () => {
    mockEstimate(null)

    render(<EnrichConfirmDialog open count={1} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText('Enrichir ce contact ?')).toBeInTheDocument()
  })

  it('nomme le cooldown — « contacts déjà enrichis récemment » (#2297.26)', () => {
    mockEstimate(null)
    render(
      <EnrichConfirmDialog
        open
        count={2}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        excluded={[{ reason: 'on_cooldown', count: 2 }]}
      />,
    )
    expect(screen.getByText('2 contacts exclus — déjà enrichis récemment')).toBeInTheDocument()
  })
})

/**
 * #2297 (30/09/2026, recette « VU ») — en espace de démonstration, le serveur
 * ne débite JAMAIS (`ContactsService.enrichContactInDemo`, `credits_debited: 0`
 * en dur) : le dialogue annonçait pourtant « 1 crédit d'enrichissement sera
 * consommé » sous le bandeau permanent « MODE DÉMO · aucun crédit consommé »
 * — une contradiction visible côte à côte sur le même écran.
 */
describe('EnrichConfirmDialog — aucun coût affiché (#4463, ex-#2297)', () => {
  it.each([true, false])('ne dit jamais « crédit », démo ou espace réel (démo : %s)', demo => {
    mockEstimate(null)
    vi.mocked(useIsDemo).mockReturnValueOnce(demo)
    render(<EnrichConfirmDialog open count={3} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)

    expect(screen.getByText(/via nos sources d'enrichissement/)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
  })
})

/**
 * #2988.1 — le sélecteur de coordonnée n'apparaît que pour l'appelant qui le
 * contrôle. Les deux autres appelants du dialogue (fiche contact, ligne de
 * tableau) ne passent pas `onCoordinateScopeChange` : leur écran doit rester
 * inchangé, sans quoi ce chantier casserait un geste déjà livré.
 */
describe('EnrichConfirmDialog — sélecteur de coordonnée (#2988.1)', () => {
  it('absent quand l’appelant ne le contrôle pas (comportement des autres appelants inchangé)', () => {
    mockEstimate(null)
    render(<EnrichConfirmDialog open count={2} onConfirm={vi.fn()} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Email seulement' })).not.toBeInTheDocument()
  })

  it('présent quand fourni, « Email + téléphone » sélectionné par défaut', () => {
    mockEstimate(null)
    render(
      <EnrichConfirmDialog
        open
        count={2}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        onCoordinateScopeChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Email + téléphone' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Email seulement' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('un clic sur « Téléphone seulement » notifie l’appelant, et masque le champ email attendu', async () => {
    mockEstimate(null)
    const onCoordinateScopeChange = vi.fn()
    render(
      <EnrichConfirmDialog
        open
        count={2}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        coordinateScope="both"
        onCoordinateScopeChange={onCoordinateScopeChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Téléphone seulement' }))

    expect(onCoordinateScopeChange).toHaveBeenCalledWith('phone')
  })

  it('coordinateScope="phone" : le champ « Email » attendu disparaît, « Téléphone » reste', () => {
    mockEstimate(null)
    render(
      <EnrichConfirmDialog
        open
        count={2}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        coordinateScope="phone"
        onCoordinateScopeChange={vi.fn()}
      />,
    )

    expect(screen.queryByText('Email')).not.toBeInTheDocument()
    expect(screen.getByText('Téléphone')).toBeInTheDocument()
  })
})
