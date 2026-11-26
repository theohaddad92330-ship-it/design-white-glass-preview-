import { describe, expect, it } from 'vitest'
import { GUIDE_ABSENCE_REASONS } from '@bellum/contracts'
import { closedGuideGate, type GuideStepContext } from './guide-step-gate'

/** Un contexte où TOUT est ouvert — chaque test ne ferme qu'une porte. */
const openContext: GuideStepContext = {
  route: '/decouvrir',
  permissions: ['accounts.read', 'accounts.enrich'],
  viewportWidth: 1280,
  availableData: ['account.any'],
  enabledFlags: ['guide.decouvrir'],
}

describe('les portes d’une étape de guide', () => {
  it('laisse passer une étape qui n’exige rien (#2212.32-.35)', () => {
    expect(closedGuideGate({}, openContext)).toBeNull()
  })

  it('laisse passer une étape dont toutes les exigences sont satisfaites', () => {
    expect(
      closedGuideGate(
        {
          route: '/decouvrir',
          permission: 'accounts.enrich',
          minViewportWidth: 768,
          requiresData: 'account.any',
          featureFlag: 'guide.decouvrir',
        },
        openContext,
      ),
    ).toBeNull()
  })

  it('ferme sur la ROUTE quand on n’est pas sur le bon écran (#2212.32)', () => {
    expect(closedGuideGate({ route: '/comptes' }, openContext)).toBe('route')
  })

  it('accepte une route parente — /comptes couvre /comptes/42 (#2212.32)', () => {
    expect(closedGuideGate({ route: '/comptes' }, { ...openContext, route: '/comptes/42' })).toBeNull()
  })

  it('ne prend pas /comptes-archives pour un enfant de /comptes', () => {
    expect(closedGuideGate({ route: '/comptes' }, { ...openContext, route: '/comptes-archives' })).toBe('route')
  })

  it('ferme sur la PERMISSION plutôt que de montrer un geste interdit (#2212.33)', () => {
    expect(closedGuideGate({ permission: 'billing.write' }, openContext)).toBe('permission')
  })

  it('ferme sur la LARGEUR quand la surface visée n’existe pas ici (#2212.34)', () => {
    expect(closedGuideGate({ minViewportWidth: 768 }, { ...openContext, viewportWidth: 390 })).toBe('viewport')
  })

  it('ferme sur la DONNÉE : un guide ne parle pas dans le vide (#2212.35)', () => {
    expect(closedGuideGate({ requiresData: 'mission.any' }, openContext)).toBe('data')
  })

  it('ferme sur le DRAPEAU quand la fonctionnalité n’est pas activée (#2212.35)', () => {
    expect(closedGuideGate({ featureFlag: 'guide.facturation' }, openContext)).toBe('flag')
  })

  /**
   * L'ordre est une PROMESSE faite à la mesure : deux portes fermées rendent
   * toujours la même raison, sinon l'agrégat par raison ne veut rien dire.
   */
  it('rend une raison STABLE quand plusieurs portes sont fermées', () => {
    const reason = closedGuideGate(
      { route: '/comptes', permission: 'billing.write', minViewportWidth: 768 },
      { ...openContext, viewportWidth: 390 },
    )
    expect(reason).toBe('route')
    expect(
      closedGuideGate({ permission: 'billing.write', minViewportWidth: 768 }, { ...openContext, viewportWidth: 390 }),
    ).toBe('permission')
  })

  it('ne rend jamais une raison hors du catalogue fermé du contrat (#2212.37)', () => {
    const reason = closedGuideGate({ route: '/ailleurs' }, openContext)
    expect(reason).not.toBeNull()
    expect(GUIDE_ABSENCE_REASONS as readonly string[]).toContain(reason as string)
  })

  /**
   * #2212.38/.39 — la porte ne fait JAMAIS planter la page. Un contexte
   * incomplet (une permission jamais chargée, une largeur illisible) ferme la
   * porte, il ne lève pas.
   */
  it('ne lève jamais sur un contexte incomplet — elle ferme la porte', () => {
    const broken = { route: '', permissions: [], viewportWidth: Number.NaN, availableData: [], enabledFlags: [] }
    expect(() => closedGuideGate({ minViewportWidth: 768 }, broken)).not.toThrow()
    expect(closedGuideGate({ minViewportWidth: 768 }, broken)).toBe('viewport')
  })
})
