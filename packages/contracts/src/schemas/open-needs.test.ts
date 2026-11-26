import { describe, expect, it } from 'vitest'
import {
  daysInStatus,
  needConversionRate,
  openNeedRowSchema,
  openNeedsCountersSchema,
  openNeedsQuerySchema,
} from './open-needs.js'

const NOW = new Date('2026-08-27T10:00:00.000Z')

/** Une ligne minimale et VALIDE — c'est elle qui dit ce que le serveur doit
 *  sélectionner. Un champ oublié ici redevient une colonne écrite que personne
 *  ne lit, ce qui est exactement le défaut qu'on corrige. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Architecte plateforme',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Plateforme',
    project_stage: 'qualified',
    // #2558.1 — le compte ne peut plus manquer sur une ligne du board : il est
    // porté en propre par `project_needs.account_id` et c'est par lui qu'on
    // rejoint un besoin, avec ou sans projet.
    account_id: '33333333-3333-4333-8333-333333333333',
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  }
}

describe('openNeedRowSchema — la date d’entrée dans l’étape voyage', () => {
  it('accepte la date, et l’exige — sinon la colonne redevient invisible', () => {
    const parsed = openNeedRowSchema.parse(row({ status_changed_at: '2026-08-15T09:00:00.000Z' }))
    expect(parsed.status_changed_at).toBe('2026-08-15T09:00:00.000Z')
    // Le champ n'est pas `.optional()` : un serveur qui l'oublierait au SELECT
    // est refusé ici plutôt que de rendre « non mesuré » sur toute la liste,
    // ce qui ressemble trait pour trait à une base vide.
    const { status_changed_at: _absent, ...withoutIt } = row()
    expect(openNeedRowSchema.safeParse(withoutIt).success).toBe(false)
  })

  it('accepte `null` : un besoin qui n’a jamais changé d’état n’en a pas', () => {
    expect(openNeedRowSchema.parse(row({ status_changed_at: null })).status_changed_at).toBeNull()
  })
})

describe('daysInStatus — « non mesuré » n’est jamais « 0 j »', () => {
  it('rend `null` quand la date est absente', () => {
    // C'est l'invariant central du dépôt appliqué ici : « 0 j en étape » se lit
    // « ce besoin vient de bouger », alors que la vérité est « personne ne l'a
    // jamais fait bouger ». Les deux appellent des gestes opposés.
    expect(daysInStatus(null, NOW)).toBeNull()
  })

  it('rend `null` sur une date illisible, jamais `NaN` ni `0`', () => {
    expect(daysInStatus('pas une date', NOW)).toBeNull()
  })

  it('compte les jours ENTIERS écoulés', () => {
    expect(daysInStatus('2026-08-15T10:00:00.000Z', NOW)).toBe(12)
  })

  it('rend `0` le jour même — et ce zéro-là est VRAI', () => {
    // La question de GA-19 : si la valeur est absente, « 0 » est-il vrai ? Ici
    // elle n'est pas absente, elle vaut zéro, et le besoin a bien passé zéro
    // jour complet dans son étape.
    expect(daysInStatus('2026-08-27T08:00:00.000Z', NOW)).toBe(0)
  })

  it('ne rend jamais un nombre négatif sur une date au futur', () => {
    // `decp_augmente` porte des dates à 2048 ; une horloge de serveur en avance
    // suffit aussi. « −3 j en étape » ferait douter de tout le tableau.
    expect(daysInStatus('2026-09-10T10:00:00.000Z', NOW)).toBe(0)
  })
})

/**
 * LE TAUX DE CONVERSION DES BESOINS (31/08/2026).
 *
 * Le rail du kanban affichait « non mesuré » par construction : l'écran ne
 * charge que des besoins OUVERTS. Le serveur compte désormais les ISSUES, et
 * cette fonction les divise — sans jamais arrondir, et sans jamais rendre « 0 »
 * pour une absence.
 */
describe('needConversionRate', () => {
  it('divise les gagnés par tout ce qui a été TRANCHÉ', () => {
    expect(needConversionRate({ won: 3, lost: 1, cancelled: 0 })).toBe(0.75)
  })

  it('un ANNULÉ pèse dans le dénominateur, comme un perdu', () => {
    // `cancelled` reste distinct de `lost` au CONTRAT (le taux de perte les
    // sépare) ; ici, tous deux sont des issues, donc tous deux comptent.
    expect(needConversionRate({ won: 1, lost: 1, cancelled: 2 })).toBe(0.25)
  })

  it('rend `null` — jamais 0 — quand rien n’a été tranché', () => {
    // Un espace créé la semaine dernière n'a pas « 0 % de conversion » : il n'a
    // pas de conversion à mesurer. « 0 % » dirait « on ne gagne jamais ».
    expect(needConversionRate({ won: 0, lost: 0, cancelled: 0 })).toBeNull()
  })

  it('rend `null` quand le serveur n’a rien dit', () => {
    expect(needConversionRate(undefined)).toBeNull()
    expect(needConversionRate(null)).toBeNull()
  })

  it('un VRAI zéro reste zéro — écrire « non mesuré » à sa place mentirait autant', () => {
    expect(needConversionRate({ won: 0, lost: 5, cancelled: 2 })).toBe(0)
  })

  it('n’ARRONDIT pas — l’arrondi est une décision d’affichage', () => {
    // Le défaut de `/pilotage` le 30/08 : 0,48 % arrondi dans la dérivation
    // ressortait « 0 % », avec l'autorité d'une mesure.
    const rate = needConversionRate({ won: 12, lost: 2488, cancelled: 0 })
    expect(rate).toBeGreaterThan(0)
    expect(rate).toBeLessThan(0.01)
  })

  it('un compte illisible ne fabrique pas un taux', () => {
    expect(needConversionRate({ won: Number.NaN, lost: 3, cancelled: 0 })).toBeNull()
  })
})

/**
 * #2173.8 / #2173.9 — deux compteurs de tête manquants : « Avec entretien »
 * (au moins un positionnement au stade `interview`) et « À clôturer » (au
 * moins un positionnement `accepted` sur un besoin pas encore refermé).
 *
 * REQUIS comme les quatre voisins (`withoutShortlist`, `deadlinePassed`…) et
 * non optionnels comme `outcomes` : ils sont calculés dans le MÊME
 * `Promise.all` côté serveur, et un champ oublié doit casser la compilation,
 * pas se réduire silencieusement à « non mesuré ».
 */
describe('openNeedsCountersSchema — deux compteurs de plus', () => {
  const base = { total: 0, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 }

  it('exige withInterview et readyToClose', () => {
    expect(openNeedsCountersSchema.safeParse(base).success).toBe(false)
    expect(openNeedsCountersSchema.parse({ ...base, withInterview: 2, readyToClose: 1 })).toMatchObject({
      withInterview: 2,
      readyToClose: 1,
    })
  })
})

/**
 * #2173.15 / #2173.17 — deux critères de plus sur la requête : la vue rapide
 * « Entretiens » et la vue rapide « Perdus / clôturés ». Les DEUX contournent
 * le défaut « ouverts seulement » de la même façon que `status` le fait déjà —
 * un besoin perdu n'est par définition PAS ouvert.
 */
describe('openNeedsQuerySchema — with_interview / ready_to_close / closed_lost_or_cancelled', () => {
  it('accepte les trois nouveaux booléens', () => {
    const parsed = openNeedsQuerySchema.parse({
      with_interview: true,
      ready_to_close: true,
      closed_lost_or_cancelled: true,
    })
    expect(parsed.with_interview).toBe(true)
    expect(parsed.ready_to_close).toBe(true)
    expect(parsed.closed_lost_or_cancelled).toBe(true)
  })
})

/**
 * #2067.25-.29 — DÉCISION Louis 17/09 : le rail consultant est porté par le
 * consultant POSITIONNÉ (soumis) sur le besoin. `null` = aucun positionné
 * (une vraie réponse), `undefined` = deploy-skew.
 */
describe('openNeedRowSchema — le consultant POSITIONNÉ (#2067.25-.29)', () => {
  const positioned = {
    submissionId: '33333333-3333-4333-8333-333333333333',
    consultantId: '44444444-4444-4444-8444-444444444444',
    consultantName: 'Inès Kaczmarek',
    submittedAt: '2026-09-09T00:00:00.000Z',
    fitScore: null,
    availability: 'sous_1_mois',
    proposedRateCents: 72_000,
    mobilityKnown: true,
    otherActiveSubmissions: 0,
  }

  it('accepte un consultant positionné complet', () => {
    const parsed = openNeedRowSchema.parse(row({ positioned_consultant: positioned, positioned_consultants_count: 1 }))
    expect(parsed.positioned_consultant?.consultantName).toBe('Inès Kaczmarek')
    expect(parsed.positioned_consultants_count).toBe(1)
  })

  it('accepte `null` — aucun consultant positionné n’est une VRAIE réponse, pas un défaut', () => {
    const parsed = openNeedRowSchema.parse(row({ positioned_consultant: null, positioned_consultants_count: 0 }))
    expect(parsed.positioned_consultant).toBeNull()
    expect(parsed.positioned_consultants_count).toBe(0)
  })

  it('les deux champs restent optionnels — un serveur qui ne les sélectionne pas encore ne casse pas la fiche', () => {
    expect(openNeedRowSchema.safeParse(row()).success).toBe(true)
  })

  it('un fitScore absent (`null`) n’est jamais deviné — le score poussable n’est pas toujours calculé', () => {
    const parsed = openNeedRowSchema.parse(row({ positioned_consultant: { ...positioned, fitScore: null } }))
    expect(parsed.positioned_consultant?.fitScore).toBeNull()
  })
})

describe('openNeedRowSchema — le télétravail (#2173.29)', () => {
  it('accepte les quatre valeurs réutilisées de `REMOTE_PREFERENCES` (GA-26)', () => {
    for (const value of ['sur_site', 'hybride', 'full_remote', 'indifferent']) {
      const parsed = openNeedRowSchema.parse(row({ remote: value }))
      expect(parsed.remote).toBe(value)
    }
  })

  it('accepte `null` — « non renseigné » est une VRAIE réponse, jamais `sur_site` par défaut', () => {
    const parsed = openNeedRowSchema.parse(row({ remote: null }))
    expect(parsed.remote).toBeNull()
  })

  it('reste optionnel — un serveur qui ne le sélectionne pas encore ne casse pas la fiche', () => {
    expect(openNeedRowSchema.safeParse(row()).success).toBe(true)
  })

  it('refuse une valeur hors énumération', () => {
    expect(openNeedRowSchema.safeParse(row({ remote: 'partout' })).success).toBe(false)
  })
})
