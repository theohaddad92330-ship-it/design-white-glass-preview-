import { surfaceContextContractSchema } from '@bellum/contracts'
import { buildSurfaceContextContract } from './surface-context-contract'

/**
 * #2454.9 — le contrat de contexte d'une surface se construit depuis l'ÉTAT
 * RÉEL, et la même entrée rend le même contrat quelle que soit la surface qui
 * le demande (seules les couches qu'elle LIT changent).
 */
describe('buildSurfaceContextContract (#2454)', () => {
  const base = { profileName: 'Acme Conseil', profileVersion: 12, crmConnected: false }

  it('Découvrir, « Mon activité » : profil vendeur UTILISÉ, nommé et versionné', () => {
    const contract = buildSurfaceContextContract({ ...base, surface: 'discover', mode: 'my_activity' })
    expect(surfaceContextContractSchema.parse(contract)).toEqual(contract)
    expect(contract.layers.find(l => l.id === 'esn_profile')).toEqual({
      id: 'esn_profile',
      state: 'used',
      name: 'Acme Conseil',
      version: 12,
    })
    expect(contract.modes_available).toEqual(['my_activity', 'one_off_mission', 'neutral'])
    // `withPortfolioState` marque les candidats déjà suivis : le portefeuille est lu.
    expect(contract.layers.find(l => l.id === 'portfolio')).toEqual({ id: 'portfolio', state: 'used' })
  })

  it("Analyser ne marque aucun portefeuille : la couche n'apparaît pas", () => {
    const contract = buildSurfaceContextContract({ ...base, surface: 'analyze', mode: 'my_activity' })
    expect(contract.layers.find(l => l.id === 'portfolio')).toBeUndefined()
  })

  it('Découvrir, « Neutre » : le profil est IGNORÉ et le contrat le dit — jamais retiré en silence', () => {
    const contract = buildSurfaceContextContract({ ...base, surface: 'discover', mode: 'neutral' })
    expect(contract.mode).toBe('neutral')
    expect(contract.layers.find(l => l.id === 'esn_profile')?.state).toBe('ignored_by_mode')
  })

  it('Découvrir ne lit JAMAIS le CRM, même branché : « non lu ici », sans lien de connexion', () => {
    const contract = buildSurfaceContextContract({
      ...base,
      crmConnected: true,
      surface: 'discover',
      mode: 'my_activity',
    })
    expect(contract.layers.find(l => l.id === 'crm')).toEqual({ id: 'crm', state: 'not_read_here' })
  })

  it('Analyser croise le CRM branché ; non branché, il PROPOSE de le brancher (jamais activé seul)', () => {
    const connected = buildSurfaceContextContract({
      ...base,
      crmConnected: true,
      surface: 'analyze',
      mode: 'my_activity',
    })
    expect(connected.layers.find(l => l.id === 'crm')).toEqual({ id: 'crm', state: 'used' })
    const absent = buildSurfaceContextContract({ ...base, surface: 'analyze', mode: 'my_activity' })
    expect(absent.layers.find(l => l.id === 'crm')).toEqual({
      id: 'crm',
      state: 'not_connected',
      action: 'connect_crm',
    })
  })

  // #2451.1 / #2453.7 — Analyser LIT désormais le mode côté serveur
  // (`AnalysisService.start`) : les trois modes y sont proposés, et chacun dit
  // ce qu'il écarte — jamais un mode affiché que le pipeline n'applique pas.
  it('Analyser tient les trois modes de Laura, dans l’ordre du contrat', () => {
    const contract = buildSurfaceContextContract({ ...base, surface: 'analyze', mode: 'neutral' })
    expect(contract.mode).toBe('neutral')
    expect(contract.modes_available).toEqual(['my_activity', 'one_off_mission', 'neutral'])
  })

  it('Mission ponctuelle : le profil est IGNORÉ, le CRM du compte choisi reste lu', () => {
    const contract = buildSurfaceContextContract({
      ...base,
      crmConnected: true,
      surface: 'analyze',
      mode: 'one_off_mission',
    })
    expect(contract.layers.find(l => l.id === 'esn_profile')?.state).toBe('ignored_by_mode')
    expect(contract.layers.find(l => l.id === 'crm')).toEqual({ id: 'crm', state: 'used' })
  })

  it('Analyser en « Neutre » : le CRM branché est ÉCARTÉ par le mode, et le contrat le dit', () => {
    const contract = buildSurfaceContextContract({ ...base, crmConnected: true, surface: 'analyze', mode: 'neutral' })
    expect(contract.layers.find(l => l.id === 'esn_profile')?.state).toBe('ignored_by_mode')
    expect(contract.layers.find(l => l.id === 'crm')).toEqual({ id: 'crm', state: 'ignored_by_mode' })
  })

  it('profil sans nom ni version : aucun nom deviné, aucune version « 0 »', () => {
    const contract = buildSurfaceContextContract({
      profileName: null,
      profileVersion: 0,
      crmConnected: false,
      surface: 'discover',
      mode: 'my_activity',
    })
    expect(contract.layers.find(l => l.id === 'esn_profile')).toEqual({ id: 'esn_profile', state: 'used' })
  })

  // #2922 — le lot multi-comptes (`/discover/lots`) lance chaque entreprise par
  // le MÊME chemin qu'Analyser (`AnalysisService.start`) : même capacité, même
  // trois modes, même CRM croisé en couche zéro (`analysis.service.ts`).
  it('Le lot multi-comptes tient la MÊME capacité qu’Analyser — même pipeline de lancement', () => {
    const batch = buildSurfaceContextContract({ ...base, surface: 'analysis_batch', mode: 'my_activity' })
    const analyze = buildSurfaceContextContract({ ...base, surface: 'analyze', mode: 'my_activity' })
    expect(batch.modes_available).toEqual(analyze.modes_available)
    expect(batch.layers.find(l => l.id === 'portfolio')).toBeUndefined()
    expect(surfaceContextContractSchema.parse(batch)).toEqual(batch)
  })

  // #2889 — recette écran FAIL du 26/09 : le « Contexte » nommait le profil
  // sans jamais dire son périmètre (secteurs prioritaires, taille cible),
  // alors qu'il était renseigné. Même source que `perimeterLine` côté web.
  it('périmètre renseigné : secteurs prioritaires et taille rendus sur la couche esn_profile', () => {
    const contract = buildSurfaceContextContract({
      ...base,
      surface: 'analyze',
      mode: 'my_activity',
      profilePerimeter: { size: 'eti', sectorsPriority: ['Banque', 'Assurance'] },
    })
    expect(contract.layers.find(l => l.id === 'esn_profile')).toEqual({
      id: 'esn_profile',
      state: 'used',
      name: 'Acme Conseil',
      version: 12,
      size: 'eti',
      sectorsPriority: ['Banque', 'Assurance'],
    })
    expect(surfaceContextContractSchema.parse(contract)).toEqual(contract)
  })

  it('périmètre sans secteur déclaré : la taille est rendue, aucune liste vide', () => {
    const contract = buildSurfaceContextContract({
      ...base,
      surface: 'analyze',
      mode: 'my_activity',
      profilePerimeter: { size: 'pme', sectorsPriority: [] },
    })
    const layer = contract.layers.find(l => l.id === 'esn_profile')
    expect(layer?.size).toBe('pme')
    expect(layer).not.toHaveProperty('sectorsPriority')
  })

  it('aucun périmètre connu : ni taille ni secteurs — jamais devinés', () => {
    const contract = buildSurfaceContextContract({ ...base, surface: 'analyze', mode: 'my_activity' })
    const layer = contract.layers.find(l => l.id === 'esn_profile')
    expect(layer).not.toHaveProperty('size')
    expect(layer).not.toHaveProperty('sectorsPriority')
  })

  it('aucun profil du tout : la couche est absente, jamais « utilisée »', () => {
    const contract = buildSurfaceContextContract({
      profileName: null,
      profileVersion: null,
      crmConnected: false,
      surface: 'discover',
      mode: 'my_activity',
      profilePresent: false,
    })
    expect(contract.layers.find(l => l.id === 'esn_profile')).toBeUndefined()
  })
})
