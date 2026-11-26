import type { MatchCandidate, MatchNeed } from '@bellum/contracts'
import { EXCLUSION_SEVERITY } from '@bellum/contracts'
import { evaluateCandidate } from './engine'

/**
 * LES DEUX AXES QUI BLOQUENT — ET LA PREUVE QU'ILS BLOQUENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `EXCLUSION_SEVERITY.clearance_missing` vaut `blocking` depuis le chantier de
 * rapprochement, et `language_mismatch` aussi. Aucun test ne vérifiait qu'ils
 * bloquent POUR DE BON : les deux se déclenchent sur `need.clearances` et
 * `need.languages`, et ces deux tableaux arrivaient TOUJOURS VIDES parce que
 * personne n'écrivait ces colonnes — ni la fiche du besoin (aucun contrôle), ni
 * `addNeed` (le champ était accepté par le contrat et jeté par le service), ni
 * `toNeedWire` (la colonne était en base et n'entrait pas dans la réponse).
 *
 * Un garde-fou déclaré bloquant qui ne bloque jamais est PIRE qu'un garde-fou
 * absent : il se lit comme une protection. C'est le motif « un garde-fou qui ne
 * s'applique jamais », déjà payé sur la bande de séniorité.
 *
 * ⚠️ Le test ne vérifie donc pas la table `EXCLUSION_SEVERITY` — ça, c'est
 * relire une constante. Il fait TOURNER le moteur et regarde où le profil
 * atterrit : `excluded`, avec son motif nommé. Et il vérifie l'inverse, sans
 * quoi il passerait au vert sur un moteur qui exclurait tout le monde.
 */

const NOW = new Date('2026-09-01T09:00:00Z')

function need(overrides: Partial<MatchNeed> = {}): MatchNeed {
  return {
    needId: '11111111-1111-4111-8111-111111111111',
    role: 'Ingénieur systèmes',
    accountName: 'Client défense',
    accountSector: 'défense',
    projectSectors: [],
    skills: [{ term: 'linux', label: 'Linux', required: true, level: null }],
    minYears: 3,
    seniorityBand: 'senior',
    environment: [],
    languages: [],
    clearances: [],
    location: 'Paris',
    remote: 'hybrid',
    startOn: '2026-09-15',
    targetRateCents: 60000,
    contractKind: 'regie',
    ...overrides,
  }
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    consultantId: '22222222-2222-4222-8222-222222222222',
    skills: [{ term: 'linux', label: 'Linux', level: 'expert', source: 'mission', proof: 'mission Thales, 24 mois' }],
    yearsExperience: 8,
    seniorityBand: 'senior',
    sectors: ['défense'],
    environment: [],
    languages: [],
    clearances: [],
    zones: ['Paris'],
    remote: 'hybrid',
    contractKind: 'cdi',
    dailyRateCents: 60000,
    freeFrom: '2026-09-01',
    derivedAvailability: 'available',
    declaredAvailability: 'immediate',
    availabilityCheckedAt: '2026-08-25T09:00:00Z',
    consentState: 'valid',
    clientHistoryFlag: null,
    clientHistoryReason: null,
    clientHistoryRecoverable: false,
    clientHistoryAt: null,
    onMissionAtClient: false,
    activeSubmissionsElsewhere: 0,
    preferenceWarnings: [],
    ...overrides,
  }
}

describe('l’axe 12 — une habilitation manquante BLOQUE, et on le prouve', () => {
  it('la garde LIT quelque chose : sans exigence, ce profil-là est recommandé', () => {
    // Le contrôle négatif. Sans lui, un moteur qui exclurait tout le monde
    // ferait passer les deux tests suivants au vert.
    const result = evaluateCandidate(need(), candidate(), { now: NOW })
    expect(result.bucket).toBe('recommended')
    expect(result.exclusions).toEqual([])
  })

  it('le MÊME profil, sous une exigence d’habilitation qu’il n’a pas, SORT des recommandés', () => {
    const result = evaluateCandidate(need({ clearances: ['Confidentiel Défense'] }), candidate(), { now: NOW })

    const exclusion = result.exclusions.find(item => item.reason === 'clearance_missing')
    expect(exclusion).toBeDefined()
    // La sévérité est celle du contrat, et elle est BLOQUANTE — mais c'est la
    // CONSÉQUENCE qui est vérifiée ici, pas la déclaration : relire une
    // constante ne prouve rien.
    expect(exclusion?.severity).toBe(EXCLUSION_SEVERITY.clearance_missing)
    expect(exclusion?.severity).toBe('blocking')
    // ⚠️ Voilà ce que « bloquer » veut dire dans ce moteur, et c'est exactement
    // ce qui ne se produisait jamais : un empêchement bloquant interdit
    // « recommandé », quelle que soit la note. Le profil descend en « limites »
    // tant que sa correspondance tient — avec son écart NOMMÉ — parce que le
    // recruteur peut savoir ce que l'algorithme ignore (une habilitation en
    // cours d'instruction). Il n'est PAS caché ; il n'est plus proposé.
    expect(result.bucket).not.toBe('recommended')
    expect(result.bucket).toBe('borderline')
    // Le motif NOMME ce qui manque : « habilitation manquante » sans dire
    // laquelle ne se corrige pas.
    expect(exclusion?.detail).toContain('Confidentiel Défense')
  })

  it('et quand la correspondance ne tient pas non plus, le profil est ÉCARTÉ', () => {
    const result = evaluateCandidate(
      need({ clearances: ['Confidentiel Défense'] }),
      candidate({
        skills: [{ term: 'cobol', label: 'COBOL', level: 'expert', source: 'declared', proof: null }],
        seniorityBand: 'junior',
        yearsExperience: 1,
        sectors: ['retail'],
        zones: ['Lille'],
      }),
      { now: NOW },
    )
    expect(result.bucket).toBe('excluded')
    expect(result.exclusions.map(item => item.reason)).toContain('clearance_missing')
  })

  it('le profil QUI la détient repasse recommandé — le blocage porte sur le manque, pas sur l’exigence', () => {
    const result = evaluateCandidate(
      need({ clearances: ['Confidentiel Défense'] }),
      candidate({ clearances: ['Confidentiel Défense'] }),
      {
        now: NOW,
      },
    )
    expect(result.exclusions.find(item => item.reason === 'clearance_missing')).toBeUndefined()
    expect(result.bucket).toBe('recommended')
  })

  it('le motif ne se DEVINE pas dans une phrase : un refus client qui contient le mot ne fabrique pas de manque', () => {
    // ⚠️ Le défaut que ce test ferme : `buildExclusions` cherchait l'habilitation
    // exigée DANS LA PHRASE de l'axe « contraintes client » (`detail.includes`).
    // Cette phrase contient aussi le motif du refus antérieur — un client qui
    // aurait refusé quelqu'un « pour cause d'habilitation Secret » aurait donc
    // fabriqué un `clearance_missing` sur un profil QUI LA DÉTIENT.
    const result = evaluateCandidate(
      need({ clearances: ['Secret'] }),
      candidate({
        clearances: ['Secret'],
        clientHistoryFlag: 'rejected',
        clientHistoryReason: 'habilitation Secret jugée trop courte',
        clientHistoryAt: '2026-03-04T00:00:00.000Z',
      }),
      { now: NOW },
    )
    expect(result.exclusions.find(item => item.reason === 'clearance_missing')).toBeUndefined()
  })
})

describe('l’axe 6 — une langue exigée et non tenue BLOQUE aussi', () => {
  it('un niveau deux crans en dessous de ce qui est demandé sort le profil des recommandés', () => {
    const result = evaluateCandidate(
      need({ languages: [{ code: 'en', level: 'c1' }] }),
      candidate({ languages: [{ code: 'en', level: 'a2' }] }),
      { now: NOW },
    )
    const exclusion = result.exclusions.find(item => item.reason === 'language_mismatch')
    expect(exclusion?.severity).toBe('blocking')
    expect(result.bucket).not.toBe('recommended')
  })

  it('un écart d’UN cran se dit sans bloquer — sinon on écarterait des profils que le client aurait pris', () => {
    const result = evaluateCandidate(
      need({ languages: [{ code: 'en', level: 'c1' }] }),
      candidate({ languages: [{ code: 'en', level: 'b2' }] }),
      { now: NOW },
    )
    expect(result.exclusions.find(item => item.reason === 'language_mismatch')).toBeUndefined()
    expect(result.bucket).toBe('recommended')
  })

  it('un profil dont AUCUNE langue n’est renseignée n’est pas écarté — « je ne sais pas » n’est jamais « non »', () => {
    const result = evaluateCandidate(need({ languages: [{ code: 'en', level: 'c1' }] }), candidate({ languages: [] }), {
      now: NOW,
    })
    expect(result.exclusions.find(item => item.reason === 'language_mismatch')).toBeUndefined()
    const axis = result.axes.find(item => item.axis === 'language')
    // Non évaluable = HORS du dénominateur, jamais une note de zéro.
    expect(axis?.score).toBeNull()
  })
})

describe('le drapeau « déjà refusé chez ce client » porte sa DATE', () => {
  it('la date du refus voyage du candidat jusqu’au drapeau', () => {
    const result = evaluateCandidate(
      need(),
      candidate({
        clientHistoryFlag: 'rejected',
        clientHistoryReason: 'price',
        clientHistoryRecoverable: true,
        clientHistoryAt: '2026-03-04T00:00:00.000Z',
      }),
      { now: NOW },
    )
    const flag = result.flags.find(item => item.kind === 'previously_rejected_by_client')
    expect(flag).toBeDefined()
    // Sans la date, « déjà refusé » ne se distingue pas d'un refus d'il y a
    // trois ans — et c'est justement la différence qui décide de reproposer.
    expect(flag?.at).toBe('2026-03-04T00:00:00.000Z')
  })

  it('un positionnement encore ouvert n’invente pas de date', () => {
    const result = evaluateCandidate(
      need(),
      candidate({ clientHistoryFlag: 'rejected', clientHistoryReason: null, clientHistoryAt: null }),
      { now: NOW },
    )
    const flag = result.flags.find(item => item.kind === 'previously_rejected_by_client')
    expect(flag?.at ?? null).toBeNull()
  })
})
