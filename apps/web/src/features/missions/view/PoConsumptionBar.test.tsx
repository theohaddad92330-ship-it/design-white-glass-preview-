import type { MissionCommercialTerms } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PoConsumptionBar } from './PoConsumptionBar'

/**
 * LA BARRE DE CONSOMMATION D'UN BON DE COMMANDE, ET SON ALERTE D'ANTICIPATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Un volume NON renseigné n'est pas « à 0 % » — c'est NON MESURÉ.
 *  2. Une consommation NON mesurable n'est pas « rien consommé ».
 *  3. « Demander l'avenant » n'apparaît QU'à partir du seuil, jamais en dessous.
 *  4. La demande PRÉPARE un texte à copier — elle n'envoie RIEN elle-même.
 *  5. Un dépassement reste un dépassement, distinct de l'anticipation.
 */

function terms(over: Partial<MissionCommercialTerms> = {}): MissionCommercialTerms {
  return {
    missionId: 'm1',
    channel: 'direct',
    loadedDailyCostCents: null,
    requiresPo: true,
    poNumber: 'PO-2026-0001',
    poOtherMissions: [],
    billingCadence: 'monthly',
    partnerCommissionDailyCents: null,
    noticeDays: 30,
    notes: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

afterEach(() => {
  cleanup()
})

describe('PoConsumptionBar — un bon de commande sans volume connu n’est pas « à 0 % »', () => {
  it('dit « volume non renseigné » plutôt qu’une barre à 0 %', () => {
    render(<PoConsumptionBar terms={terms({ poVolumeDays: null })} />)
    expect(screen.getByText(/Volume non renseigné/)).toBeInTheDocument()
    expect(screen.queryByText(/0 %/)).not.toBeInTheDocument()
  })

  it('sans conditions commerciales du tout, dit aussi « volume non renseigné »', () => {
    render(<PoConsumptionBar terms={null} />)
    expect(screen.getByText(/Volume non renseigné/)).toBeInTheDocument()
  })

  it('un volume connu mais une consommation non mesurable n’est pas « rien consommé »', () => {
    render(<PoConsumptionBar terms={terms({ poVolumeDays: 45, poConsumedDays: null, poConsumption: null })} />)
    expect(screen.getByText(/Consommation non mesurée/)).toBeInTheDocument()
  })
})

describe('PoConsumptionBar — sous le seuil, rien à annoncer', () => {
  it('à 60 %, la barre s’affiche sans aucune alerte ni demande d’avenant', () => {
    render(
      <PoConsumptionBar
        terms={terms({ poVolumeDays: 30, poConsumedDays: 18, poConsumption: { percent: 60, remainingDays: 12 } })}
      />,
    )
    expect(screen.getByText('60 % consommé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Demander l’avenant/ })).not.toBeInTheDocument()
  })
})

describe('PoConsumptionBar — l’alerte d’anticipation, à partir du seuil', () => {
  it('propose « Demander l’avenant » dès l’approche du seuil, jamais avant', () => {
    render(
      <PoConsumptionBar
        terms={terms({ poVolumeDays: 100, poConsumedDays: 92, poConsumption: { percent: 92, remainingDays: 8 } })}
      />,
    )
    expect(screen.getByText(/consommé à 90 % ou plus/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander l’avenant' })).toBeInTheDocument()
  })

  it('prépare un texte à copier, et ne l’envoie nulle part', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(
      <PoConsumptionBar
        terms={terms({
          poVolumeDays: 50,
          poConsumedDays: 46,
          poConsumption: { percent: 92, remainingDays: 4 },
          poNumber: 'PO-2026-0512',
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Demander l’avenant' }))
    expect(screen.getByText(/PO-2026-0512/)).toBeInTheDocument()
    // Le geste PRÉPARE : une copie locale, aucun appel réseau ni aucune
    // mutation — le composant ne connaît même pas d'endpoint d'envoi.
    await userEvent.click(screen.getByRole('button', { name: 'Copier le texte' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('PO-2026-0512'))
    expect(await screen.findByRole('button', { name: 'Texte copié' })).toBeInTheDocument()
  })

  it('dit que la référence du bon de commande manque, sans l’inventer', async () => {
    render(
      <PoConsumptionBar
        terms={terms({
          poVolumeDays: 50,
          poConsumedDays: 46,
          poConsumption: { percent: 92, remainingDays: 4 },
          poNumber: null,
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Demander l’avenant' }))
    expect(screen.getByText(/référence du bon de commande n’est pas renseignée/)).toBeInTheDocument()
  })
})

describe('PoConsumptionBar — #2422.7, les autres missions du même bon de commande', () => {
  it('ne montre AUCUNE ligne quand la liste est vide — pas un « aucune autre mission »', () => {
    render(
      <PoConsumptionBar
        terms={terms({ poVolumeDays: 30, poConsumedDays: 18, poConsumption: { percent: 60, remainingDays: 12 } })}
      />,
    )
    expect(screen.queryByText(/couvre aussi/)).not.toBeInTheDocument()
  })

  it('nomme les autres missions qui partagent le même bon de commande', () => {
    render(
      <PoConsumptionBar
        terms={terms({
          poVolumeDays: 30,
          poConsumedDays: 18,
          poConsumption: { percent: 60, remainingDays: 12 },
          poOtherMissions: [{ missionId: 'm2', missionLabel: 'Lot 2 — audit réseau', accountName: 'Acme' }],
        })}
      />,
    )
    expect(screen.getByText(/Ce bon de commande couvre aussi/)).toBeInTheDocument()
    expect(screen.getByText('Lot 2 — audit réseau — Acme')).toBeInTheDocument()
  })
})

describe('PoConsumptionBar — un dépassement reste un dépassement', () => {
  it('annonce le dépassement ET propose l’avenant — les deux gestes coexistent', () => {
    render(
      <PoConsumptionBar
        terms={terms({ poVolumeDays: 50, poConsumedDays: 60, poConsumption: { percent: 120, remainingDays: -10 } })}
      />,
    )
    expect(screen.getByText('Bon de commande dépassé de 10 jours.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander l’avenant' })).toBeInTheDocument()
    // Un dépassement n'est pas l'anticipation : la phrase « il reste N jours »
    // ne doit pas cohabiter avec « dépassé ».
    expect(screen.queryByText(/consommé à 90 % ou plus — il reste/)).not.toBeInTheDocument()
  })
})
