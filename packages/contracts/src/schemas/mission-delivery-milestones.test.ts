import { describe, expect, it } from 'vitest'
import {
  DECLARED_MISSION_DELIVERY_MILESTONE_KINDS,
  MISSION_DELIVERY_MILESTONE_CATALOG,
  MISSION_DELIVERY_MILESTONE_KINDS,
  MISSION_DELIVERY_MILESTONE_REINJECTION_LOOP,
  MISSION_REINJECTION_LOOPS,
  computeMissionDeliveryMilestones,
  computeMissionEndReverseMarketReadiness,
  declareMissionDeliveryMilestoneInputSchema,
  resolveMissionDeliveryMilestonePresets,
  suggestMissionReinjectionFromMilestone,
} from './mission-delivery-milestones.js'

describe('MISSION_DELIVERY_MILESTONE_CATALOG', () => {
  it('couvre les 17 jalons de la spec BEL-SC-240 (#3269), dans son ordre', () => {
    expect(MISSION_DELIVERY_MILESTONE_KINDS).toEqual([
      'brief_consultant',
      'brief_client',
      'documents_acces',
      'demarrage',
      'premier_check',
      'revue_debut',
      'suivi_periodique',
      'satisfaction',
      'cra',
      'risque',
      'renouvellement',
      'fin_de_mission',
      'rex_interne',
      'rex_client',
      'preuve_reutilisable',
      'expansion',
      'disponibilite_future',
    ])
  })

  it('un jalon "projected" cite toujours sa maison canonique — jamais un objet muet', () => {
    for (const entry of MISSION_DELIVERY_MILESTONE_CATALOG) {
      if (entry.mode === 'projected') expect(entry.groundedIn).toBeTruthy()
      else expect(entry.groundedIn).toBeNull()
    }
  })

  it('les jalons déclarés et projetés partitionnent le catalogue sans recouvrement', () => {
    const declared = MISSION_DELIVERY_MILESTONE_CATALOG.filter(e => e.mode === 'declared').map(e => e.key)
    const projected = MISSION_DELIVERY_MILESTONE_CATALOG.filter(e => e.mode === 'projected').map(e => e.key)
    expect(declared.length + projected.length).toBe(MISSION_DELIVERY_MILESTONE_KINDS.length)
    expect(declared.every(k => !projected.includes(k))).toBe(true)
  })
})

describe('resolveMissionDeliveryMilestonePresets', () => {
  it('rend un preset par défaut pour chaque jalon déclarable, non adapté par défaut', () => {
    const presets = resolveMissionDeliveryMilestonePresets({
      durationDays: 90,
      contractKind: 'regie',
      riskLevel: null,
    })
    expect(presets.map(p => p.key)).toEqual([...DECLARED_MISSION_DELIVERY_MILESTONE_KINDS])
    expect(presets.every(p => p.adapted === false)).toBe(true)
  })

  it('une mission courte comprime le premier check et la revue de début', () => {
    const presets = resolveMissionDeliveryMilestonePresets({
      durationDays: 10,
      contractKind: 'regie',
      riskLevel: null,
    })
    const premierCheck = presets.find(p => p.key === 'premier_check')!
    const revueDebut = presets.find(p => p.key === 'revue_debut')!
    expect(premierCheck.offsetDays).toBeLessThan(3)
    expect(premierCheck.adapted).toBe(true)
    expect(revueDebut.offsetDays).toBeLessThan(14)
    expect(revueDebut.adapted).toBe(true)
  })

  it('un forfait suit ses jalons de facturation, jamais une cadence calendaire (D35)', () => {
    const presets = resolveMissionDeliveryMilestonePresets({
      durationDays: 90,
      contractKind: 'forfait',
      riskLevel: null,
    })
    const suivi = presets.find(p => p.key === 'suivi_periodique')!
    expect(suivi.offsetDays).toBeNull()
    expect(suivi.reason).toMatch(/jalons de facturation/)
  })

  it('une préférence workspace prime toujours sur le preset et l’adaptation', () => {
    const presets = resolveMissionDeliveryMilestonePresets({
      durationDays: 10,
      contractKind: 'regie',
      riskLevel: 'eleve',
      workspaceOverrides: { premier_check: 5 },
    })
    const premierCheck = presets.find(p => p.key === 'premier_check')!
    expect(premierCheck.offsetDays).toBe(5)
    expect(premierCheck.reason).toBe('préférence workspace')
  })
})

describe('declareMissionDeliveryMilestoneInputSchema', () => {
  it('refuse une clé qui ne fait pas partie des jalons déclarables', () => {
    const result = declareMissionDeliveryMilestoneInputSchema.safeParse({ key: 'satisfaction', note: 'bien avancé' })
    expect(result.success).toBe(false)
  })

  it('refuse un geste sans note (rien ne se déclare en silence)', () => {
    const result = declareMissionDeliveryMilestoneInputSchema.safeParse({ key: 'brief_consultant', note: '' })
    expect(result.success).toBe(false)
  })

  it('accepte un geste déclaré valide', () => {
    const result = declareMissionDeliveryMilestoneInputSchema.safeParse({
      key: 'brief_consultant',
      note: 'Brief transmis par appel le 28/09.',
    })
    expect(result.success).toBe(true)
  })
})

describe('computeMissionDeliveryMilestones', () => {
  it('un jalon déclaré non confirmé est "not_started", jamais recalculé', () => {
    const result = computeMissionDeliveryMilestones({ declared: [], projected: [] })
    const briefConsultant = result.find(r => r.key === 'brief_consultant')!
    expect(briefConsultant.state).toBe('not_started')
    expect(briefConsultant.mode).toBe('declared')
  })

  it('un jalon déclaré confirmé porte son auteur et sa date, jamais recalculé', () => {
    const result = computeMissionDeliveryMilestones({
      declared: [{ key: 'brief_client', confirmedAt: '2026-09-28T10:00:00.000Z', confirmedBy: 'user-1', note: 'ok' }],
      projected: [],
    })
    const briefClient = result.find(r => r.key === 'brief_client')!
    expect(briefClient.state).toBe('done')
    expect(briefClient.confirmedBy).toBe('user-1')
  })

  it('un jalon projeté sans signal disponible est "not_evaluable" — jamais "0" ni deviné', () => {
    const result = computeMissionDeliveryMilestones({ declared: [], projected: [] })
    const expansion = result.find(r => r.key === 'expansion')!
    expect(expansion.state).toBe('not_evaluable')
  })

  it('un jalon projeté avec signal reprend son état tel quel, sans le recalculer', () => {
    const result = computeMissionDeliveryMilestones({
      declared: [],
      projected: [{ key: 'satisfaction', state: 'in_progress', note: 'pouls client posé, pouls consultant manquant' }],
    })
    const satisfaction = result.find(r => r.key === 'satisfaction')!
    expect(satisfaction.state).toBe('in_progress')
    expect(satisfaction.note).toMatch(/pouls consultant manquant/)
  })

  it('rend les 17 jalons dans tous les cas, même sans aucune donnée', () => {
    const result = computeMissionDeliveryMilestones({ declared: [], projected: [] })
    expect(result).toHaveLength(17)
  })
})

describe('computeMissionEndReverseMarketReadiness — NO-GO (#3269)', () => {
  it('une mission active est "not_applicable"', () => {
    const readiness = computeMissionEndReverseMarketReadiness({
      missionStatus: 'active',
      hasOpenReplacementOnAccount: false,
    })
    expect(readiness.state).toBe('not_applicable')
    expect(readiness.availabilityDeclared).toBe(false)
  })

  it('une mission terminée sans remplacement est "a_verifier", jamais une disponibilité déclarée', () => {
    const readiness = computeMissionEndReverseMarketReadiness({
      missionStatus: 'ended',
      hasOpenReplacementOnAccount: false,
    })
    expect(readiness.state).toBe('a_verifier')
    expect(readiness.availabilityDeclared).toBe(false)
  })

  it('un remplacement déjà en cours ne déclare pas non plus de disponibilité automatique', () => {
    const readiness = computeMissionEndReverseMarketReadiness({
      missionStatus: 'completed',
      hasOpenReplacementOnAccount: true,
    })
    expect(readiness.state).toBe('verifie')
    expect(readiness.availabilityDeclared).toBe(false)
  })
})

describe('MISSION_REINJECTION_LOOPS', () => {
  it('porte les six boucles de la spec, chacune avec sa maison canonique et sa preuve', () => {
    expect(MISSION_REINJECTION_LOOPS).toHaveLength(6)
    for (const loop of MISSION_REINJECTION_LOOPS) {
      expect(loop.groundedIn.length).toBeGreaterThan(0)
      expect(loop.guardrails.length).toBeGreaterThan(0)
    }
  })

  it('ne prétend jamais qu’une boucle est livrée sans appelant réel', () => {
    const partenaireAcces = MISSION_REINJECTION_LOOPS.find(l => l.key === 'partenaire_acces')!
    expect(partenaireAcces.status).toBe('hors_lot')
  })
})

// #3269.3/#3269.4 (suite #3291) — la suggestion de qualification depuis un jalon déclaré.
describe('suggestMissionReinjectionFromMilestone', () => {
  it('couvre les six jalons déclarés, chacun vers une boucle DÉJÀ LÀ (jamais partenaire_acces, hors lot)', () => {
    for (const key of DECLARED_MISSION_DELIVERY_MILESTONE_KINDS) {
      const loopKey = MISSION_DELIVERY_MILESTONE_REINJECTION_LOOP[key]
      const loop = MISSION_REINJECTION_LOOPS.find(l => l.key === loopKey)!
      expect(loop.status).toBe('deja_la')
    }
  })

  it('qualifie un jalon de cadrage (brief, documents) en boucle CRM → ACTION', () => {
    const suggestion = suggestMissionReinjectionFromMilestone({
      key: 'brief_client',
      note: 'Le client veut un point hebdo, pas mensuel.',
    })
    expect(suggestion.loopKey).toBe('crm_action')
    expect(suggestion.targetCanonicalObject).toBe('Action')
    expect(suggestion.note).toBe('Le client veut un point hebdo, pas mensuel.')
  })

  it('qualifie un jalon de suivi (check, revue, suivi périodique) en boucle CONSULTANT → TERRAIN', () => {
    const suggestion = suggestMissionReinjectionFromMilestone({
      key: 'revue_debut',
      note: 'Le consultant remonte un projet de refonte SI côté client.',
    })
    expect(suggestion.loopKey).toBe('consultant_terrain')
    expect(suggestion.targetCanonicalObject).toBe('Signal')
  })

  it('ne recopie jamais la note — elle la PORTE, jamais reformulée (doctrine)', () => {
    const note = 'Verbatim exact du commercial.'
    expect(suggestMissionReinjectionFromMilestone({ key: 'premier_check', note }).note).toBe(note)
  })
})
