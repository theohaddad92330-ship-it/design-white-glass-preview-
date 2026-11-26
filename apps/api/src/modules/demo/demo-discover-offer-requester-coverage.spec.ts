import { DEMO_DISCOVER_OFFER_REQUESTER_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4182 (EX-12) — « et en démonstration, une offre montre-t-elle qui demande le profil ? »
 *
 * Craft rule n°9 : `requester` voyage sur la réponse scriptée de `/discover`, sans table ni clé `raw_analysis`.
 * Ce fichier lit la VRAIE réponse scriptée (comme `demo-discover-signal-extraction-coverage.spec.ts`), sans
 * `discoverResponseSchema.parse` qui retirerait un champ non déclaré au contrat.
 */
type RawSignal = Record<string, unknown>
type RawCandidate = { name: string; signals: RawSignal[] }

describe('#4182 — le dossier demandeur d’une offre, en démonstration', () => {
  const view = demoDiscoverResponse({}) as { candidates: RawCandidate[] }
  const aubrac = view.candidates.find(c => c.name === 'Aubrac Aerostructures (démo)')
  const requesters = (aubrac?.signals ?? []).flatMap(s =>
    s['requester'] ? [s['requester'] as Record<string, unknown>] : [],
  )

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_OFFER_REQUESTER_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_OFFER_REQUESTER_COVERAGE.reason).toContain('#4182')
  })

  it('montre les DEUX états sur un compte de la vue par défaut : étayé et à identifier', () => {
    expect(requesters.map(r => r['status']).sort()).toEqual(['a_identifier', 'etaye'])
  })

  it('l’état étayé nomme une FONCTION (jamais une personne), distincte de l’auteur de l’annonce', () => {
    const supported = requesters.find(r => r['status'] === 'etaye')
    expect(supported?.['possibleManager']).toMatchObject({ function: 'directeur technique', entity: 'Blagnac' })
    expect((supported?.['author'] as { kind: string }).kind).toBe('rh')
  })

  it('l’état à identifier porte sa méthode et aucun manager', () => {
    const toIdentify = requesters.find(r => r['status'] === 'a_identifier')
    expect(toIdentify?.['possibleManager']).toBeNull()
    expect((toIdentify?.['method'] as string[]).length).toBeGreaterThanOrEqual(3)
  })

  it('une annonce RH n’est jamais une mission freelance ouverte', () => {
    for (const r of requesters) expect(r['openFreelanceMission']).toBe(false)
  })
})
