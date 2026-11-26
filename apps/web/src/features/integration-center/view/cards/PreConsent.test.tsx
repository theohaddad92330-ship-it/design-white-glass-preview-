import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreConsent } from './PreConsent'

/**
 * #2078.16 — « Continuer sans » : le pré-consentement dit clairement qu'on
 * peut refuser CE connecteur sans rien perdre du reste du produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'ÉTAIT PAS UN SIMPLE « ANNULER »
 * ─────────────────────────────────────────────────────────────────────────────
 * « Annuler » dit qu'on referme l'écran ; « Continuer sans HubSpot » dit en
 * plus qu'aucun connecteur du catalogue n'est obligatoire (#2078.13, la même
 * doctrine côté carte) — le mot rassure là où le geste, lui, ne change pas.
 */
describe('#2078.16 — le pré-consentement nomme le connecteur qu’on peut refuser', () => {
  it('porte le NOM du connecteur dans son bouton de repli, pas un « Annuler » muet', () => {
    render(<PreConsent tools={[]} name="HubSpot" onCancel={() => {}} onConfirm={() => {}} connecting={false} />)
    expect(screen.getByRole('button', { name: /HubSpot/ })).toBeInTheDocument()
  })

  it('le clic reste le même geste qu’avant — refermer le pré-consentement', () => {
    const onCancel = vi.fn()
    render(<PreConsent tools={[]} name="Notion" onCancel={onCancel} onConfirm={() => {}} connecting={false} />)
    screen.getByRole('button', { name: /Notion/ }).click()
    expect(onCancel).toHaveBeenCalled()
  })
})

/**
 * #2388.2 — la liste des capacités dit ce qui SERA fait ; encore fallait-il
 * dire explicitement que rien D'AUTRE ne l'est. `preConsentNever` ne couvrait
 * que deux ACTIONS (supprimer, envoyer sans clic) — jamais la question de la
 * LECTURE hors du périmètre affiché.
 */
describe('#2388.2 — le pré-consentement explique ce qui ne sera PAS lu ni modifié', () => {
  it('affiche la portée limitée aux capacités listées, au-delà de la promesse « jamais »', () => {
    render(<PreConsent tools={[]} name="HubSpot" onCancel={() => {}} onConfirm={() => {}} connecting={false} />)
    expect(screen.getByText(/Rien d’autre n’est lu ni modifié/)).toBeInTheDocument()
  })
})
