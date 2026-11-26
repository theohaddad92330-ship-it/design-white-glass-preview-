import { describe, expect, it } from 'vitest'
import type { SurfaceContextContract } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { i18n } from '@/i18n'
import { surfaceDisclosure } from './surface-disclosure'

const t = i18n.getFixedT('fr', 'chat') as TFunction<'chat'>

const discover = (overrides: Partial<SurfaceContextContract> = {}): SurfaceContextContract => ({
  surface: 'discover',
  mode: 'my_activity',
  modes_available: ['my_activity', 'neutral'],
  layers: [
    { id: 'esn_profile', state: 'used', name: 'Acme Conseil', version: 12 },
    { id: 'portfolio', state: 'used' },
    { id: 'crm', state: 'not_read_here' },
  ],
  ...overrides,
})

/**
 * #2454.6 — le contrat serveur devient l'objet que `ContextDisclosure` sait
 * rendre (GA-26 : un seul composant). Aucune couche n'est inventée : ce qui
 * n'est pas dans le contrat n'est pas à l'écran.
 */
describe('surfaceDisclosure (#2454)', () => {
  it('« Mon activité » : profil nommé ET versionné, portefeuille lu, CRM dit « non lu ici »', () => {
    const { context, copy } = surfaceDisclosure(discover(), t)
    expect(context.active.profile).toEqual({ present: true, name: 'Acme Conseil · v12' })
    expect(context.sources.map(s => s.label)).toEqual([t('contextContract.portfolio')])
    expect(context.not_consulted).toEqual([t('contextContract.crmNotReadHere')])
    expect(context.not_consulted_actions).toEqual([])
    expect(copy.summary).toBe(t('disclosure.surfaces.discover.summary', { parts: copy.summaryParts.join(', ') }))
    expect(copy.summaryParts).toContain(t('disclosure.summaryProfile'))
  })

  // #2889 — recette écran FAIL du 26/09 : le « Contexte » de /search nommait
  // le profil sans jamais dire son périmètre (secteurs prioritaires, taille
  // cible), alors qu'il était renseigné (`idealAccountProfile`).
  it('périmètre renseigné : secteurs prioritaires et taille en puce séparée du nom', () => {
    const { context } = surfaceDisclosure(
      discover({
        layers: [
          {
            id: 'esn_profile',
            state: 'used',
            name: 'Acme Conseil',
            version: 12,
            size: 'eti',
            sectorsPriority: ['Banque', 'Assurance'],
          },
          { id: 'portfolio', state: 'used' },
          { id: 'crm', state: 'not_read_here' },
        ],
      }),
      t,
    )
    expect(context.active.profile).toEqual({
      present: true,
      name: 'Acme Conseil · v12',
      perimeter: 'Périmètre : ETI · Banque, Assurance.',
    })
  })

  it('périmètre sans secteur déclaré : la taille seule, aucune liste vide', () => {
    const { context } = surfaceDisclosure(
      discover({
        layers: [{ id: 'esn_profile', state: 'used', name: 'Acme Conseil', size: 'pme', sectorsPriority: [] }],
      }),
      t,
    )
    expect(context.active.profile.perimeter).toBe('Périmètre : PME.')
  })

  it('profil IGNORÉ par le mode : le périmètre ne s’affiche pas non plus', () => {
    const { context } = surfaceDisclosure(
      discover({
        mode: 'neutral',
        layers: [
          {
            id: 'esn_profile',
            state: 'ignored_by_mode',
            name: 'Acme Conseil',
            size: 'eti',
            sectorsPriority: ['Banque'],
          },
        ],
      }),
      t,
    )
    expect(context.active.profile).toEqual({ present: false, name: null })
  })

  it('« Neutre » : le profil n’est PAS présenté comme utilisé — il est nommé comme ignoré', () => {
    const { context, copy } = surfaceDisclosure(
      discover({
        mode: 'neutral',
        layers: [
          { id: 'esn_profile', state: 'ignored_by_mode', name: 'Acme Conseil', version: 12 },
          { id: 'portfolio', state: 'used' },
          { id: 'crm', state: 'not_read_here' },
        ],
      }),
      t,
    )
    expect(context.active.profile.present).toBe(false)
    expect(context.not_consulted).toContain('Profil habituel ignoré — mode Neutre')
    expect(copy.summaryParts).not.toContain(t('disclosure.summaryProfile'))
  })

  // #2451.1 — le mode qui écarte une couche est NOMMÉ : « Mission ponctuelle »
  // ne se présente pas comme « Neutre », et un CRM écarté ne se dit pas « non branché ».
  it('Mission ponctuelle et CRM écarté par le mode : chaque absence nomme SON mode', () => {
    const { context } = surfaceDisclosure(
      {
        surface: 'analyze',
        mode: 'one_off_mission',
        modes_available: ['my_activity', 'one_off_mission', 'neutral'],
        layers: [{ id: 'esn_profile', state: 'ignored_by_mode', name: 'Acme Conseil' }],
      },
      t,
    )
    expect(context.not_consulted).toEqual(['Profil habituel ignoré — mode Mission ponctuelle'])

    const neutral = surfaceDisclosure(
      {
        surface: 'analyze',
        mode: 'neutral',
        modes_available: ['my_activity', 'one_off_mission', 'neutral'],
        layers: [{ id: 'crm', state: 'ignored_by_mode' }],
      },
      t,
    )
    expect(neutral.context.not_consulted).toEqual(['CRM branché écarté — mode Neutre'])
    expect(neutral.context.sources).toEqual([])
    expect(neutral.context.not_consulted_actions).toEqual([])
  })

  it('Analyser sans CRM : la couche est PROPOSÉE (lien « connecter »), jamais activée', () => {
    const { context } = surfaceDisclosure(
      {
        surface: 'analyze',
        mode: 'my_activity',
        modes_available: ['my_activity'],
        layers: [
          { id: 'esn_profile', state: 'used' },
          { id: 'crm', state: 'not_connected', action: 'connect_crm' },
        ],
      },
      t,
    )
    expect(context.active.profile).toEqual({ present: true, name: null })
    expect(context.not_consulted_actions).toEqual([
      { label: t('contextContract.crmNotConnected'), action: 'connect_crm' },
    ])
  })

  it('Analyser avec CRM branché : le CRM est une couche LUE, jamais nommée par son éditeur', () => {
    const { context } = surfaceDisclosure(
      {
        surface: 'analyze',
        mode: 'my_activity',
        modes_available: ['my_activity'],
        layers: [{ id: 'crm', state: 'used' }],
      },
      t,
    )
    expect(context.sources).toEqual([{ kind: 'crm', label: t('contextContract.crmUsed') }])
    expect(context.active.profile.present).toBe(false)
  })
})
