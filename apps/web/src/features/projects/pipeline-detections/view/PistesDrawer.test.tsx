import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const plan = vi.hoisted(() => ({ allowed: true }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ allowed: plan.allowed }),
}))
vi.mock('../../view/PistesCount', () => ({ PistesCount: () => <div>compteur des pistes</div> }))
vi.mock('../../view/PistesBoard', () => ({ PistesBoard: () => <div>tableau des pistes</div> }))
const { PistesDrawer } = await import('./PistesDrawer')

/**
 * #4545 (Louis 25/10/2026) — LE PANNEAU DES PISTES DU PIPE, destination des cinq chemins qui menaient à
 * Signaux › Pistes. Il s'ouvre PAR L'URL (`/projects?pistes=1`), donc même quand le Pipe est vide.
 */
describe('PistesDrawer — le panneau des pistes du Pipe', () => {
  beforeEach(async () => {
    plan.allowed = true
    await i18n.changeLanguage('fr')
  })

  it('ouvert : porte le compteur ET le tableau — le MÊME PistesBoard que portait Signaux', async () => {
    renderWithRouter(<PistesDrawer open onOpenChange={() => {}} />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('compteur des pistes')).toBeInTheDocument()
    expect(screen.getByText('tableau des pistes')).toBeInTheDocument()
  })

  // #4292.5 — la liste a UN nom : « File de pistes » (elle s'appelait « Pistes de Laura » ici, « Pistes à qualifier » ailleurs).
  it('ouvert : le panneau se NOMME « File de pistes »', async () => {
    renderWithRouter(<PistesDrawer open onOpenChange={() => {}} />)
    expect(await screen.findByRole('dialog', { name: 'File de pistes' })).toBeInTheDocument()
    expect(screen.queryByText(/^Pistes de /)).toBeNull()
  })

  it('fermé : rien n’est monté', async () => {
    renderWithRouter(<PistesDrawer open={false} onOpenChange={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByText('tableau des pistes')).toBeNull()
  })

  it('fermer rend la main à la page (le paramètre d’URL est retiré par elle)', async () => {
    const onOpenChange = vi.fn()
    renderWithRouter(<PistesDrawer open onOpenChange={onOpenChange} />)
    fireEvent.click(await screen.findByRole('button', { name: /Fermer les pistes/ }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('le renvoi « Les signaux restent dans Signaux » mène à /signals, sans ancre #pistes (elle n’existe plus)', async () => {
    renderWithRouter(<PistesDrawer open onOpenChange={() => {}} />)
    const link = await screen.findByRole('link', { name: /Les signaux restent dans Signaux/ })
    expect(link.getAttribute('href')).toBe('/signals')
  })

  // Droits : le panneau ne donne aucun accès que le Pipe ne donnait pas. Le rôle (palier) qui ne voyait pas les
  // pistes ne les voit pas davantage par un lien profond — le verrou, lui, vit sur la page.
  it('REFUS : sans la fonction « needs », le lien profond n’ouvre RIEN', async () => {
    plan.allowed = false
    renderWithRouter(<PistesDrawer open onOpenChange={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('tableau des pistes')).toBeNull()
  })
})
