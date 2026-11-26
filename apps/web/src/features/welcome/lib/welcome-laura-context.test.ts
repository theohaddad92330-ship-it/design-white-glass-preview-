import { describe, expect, it } from 'vitest'
import { welcomeLauraContext } from './welcome-laura-context'

const t = ((key: string) => key) as never

/**
 * #2091.34 — « la conversation Laura s'ouvre avec audit actif/périmètre/
 * stratégie/objet/première question. » `apps/ia/app/routers/chat.py` et
 * `chat_orchestrator.py` ne recevaient que `from=welcome` (l'ORIGINE du
 * clic), aucune des cinq pièces de contexte — vérifié : `goToLauraHandoff`
 * naviguait sans `context` sur `origin/main`.
 *
 * Ce fichier réutilise le canal GÉNÉRIQUE déjà branché pour les dossiers de
 * compte (`LauraPageContext` / `entryPageContext`, #2123.56) plutôt que d'en
 * ouvrir un second : « périmètre » et « stratégie » en deviennent des facets
 * `kind: 'screen'`, un genre qui existe déjà et n'a besoin d'aucune extension
 * d'énumération (GA-08). « objet » reste `null` : ce welcome ne porte encore
 * aucun compte précis. « première question » est déjà couverte par l'amorce
 * `justOnboarded` de Laura (#1921.10) — hors de ce fichier.
 */
describe('welcomeLauraContext — le périmètre et la stratégie de l’audit, transportés vers Laura', () => {
  it('déclare la stratégie de recrutement quand l’ESN y a répondu', () => {
    const ctx = welcomeLauraContext(t, {
      isLoading: false,
      recruitsForClients: 'yes',
      targetSectors: [],
    })
    expect(ctx.facets).toContainEqual({ label: 'lauraContext.strategyLabel', value: 'lauraContext.strategy.yes' })
  })

  it('ne déclare AUCUNE facette de stratégie tant que l’ESN n’a pas répondu — non mesuré n’est jamais deviné', () => {
    const ctx = welcomeLauraContext(t, { isLoading: false, recruitsForClients: null, targetSectors: [] })
    expect(ctx.facets.some(f => f.label === 'lauraContext.strategyLabel')).toBe(false)
  })

  it('déclare le périmètre ciblé quand des secteurs sont renseignés', () => {
    const ctx = welcomeLauraContext(t, {
      isLoading: false,
      recruitsForClients: null,
      targetSectors: ['Fintech', 'Santé'],
    })
    expect(ctx.facets).toContainEqual({ label: 'lauraContext.scopeLabel', value: 'Fintech, Santé' })
  })

  it('ne porte AUCUN objet — ce welcome ne cadre encore aucun compte précis', () => {
    const ctx = welcomeLauraContext(t, { isLoading: false, recruitsForClients: null, targetSectors: [] })
    expect(ctx.entityId).toBeNull()
    expect(ctx.kind).toBe('screen')
  })

  it('dit « chargement » tant que l’audit n’est pas prêt, jamais un contexte deviné', () => {
    const ctx = welcomeLauraContext(t, { isLoading: true, recruitsForClients: 'yes', targetSectors: ['Fintech'] })
    expect(ctx.state).toBe('loading')
  })

  // #2091.34 — « audit actif » : déclaré seulement quand un audit existe.
  it('#2091.34 — déclare l’audit actif quand un profil de contexte existe', () => {
    const ctx = welcomeLauraContext(t, {
      isLoading: false,
      recruitsForClients: null,
      targetSectors: [],
      hasActiveAudit: true,
    })
    expect(ctx.facets).toContainEqual({ label: 'lauraContext.auditLabel', value: 'lauraContext.auditActive' })
  })

  it('#2091.34 — aucun audit : aucune facette (jamais « audit inactif » inventé)', () => {
    const ctx = welcomeLauraContext(t, { isLoading: false, recruitsForClients: null, targetSectors: [] })
    expect(ctx.facets.some(f => f.label === 'lauraContext.auditLabel')).toBe(false)
  })
})
