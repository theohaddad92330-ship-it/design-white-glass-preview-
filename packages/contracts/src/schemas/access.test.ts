import { describe, expect, it } from 'vitest'
import {
  ACCESS_FACT_HALF_LIFE_MONTHS,
  ACCESS_LOCK_STATES,
  ACCESS_MODES,
  accessFreshness,
  addressabilityRatio,
  bestAccessFact,
  createAccessFactSchema,
  declaredAccessStatus,
  DISCOVER_FAMILIES,
  discoverFamily,
  jobChangeOpening,
  lockFactFromAwards,
  partnerAccessContradictions,
  rankAccessModes,
} from './access.js'

const NOW = new Date('2026-08-22T00:00:00Z')

describe('accessFreshness', () => {
  it('keeps a recent fact fresh', () => {
    expect(accessFreshness({ kind: 'lock', observed_at: '2026-06-01' }, NOW)).toBe('fresh')
  })

  it('turns a fact older than its half-life stale rather than deleting it', () => {
    // « Une donnée périmée ne disparaît pas. Elle redevient inconnue, et l'écran
    // affiche "information de mars 2026, à revérifier". » (§10.3)
    expect(accessFreshness({ kind: 'lock', observed_at: '2025-01-15' }, NOW)).toBe('stale')
  })

  it('gives the cost a shorter half-life than the lock', () => {
    // Un référencement dure un à trois ans ; une commission se renégocie.
    expect(ACCESS_FACT_HALF_LIFE_MONTHS.cost).toBeLessThan(ACCESS_FACT_HALF_LIFE_MONTHS.lock)
    expect(accessFreshness({ kind: 'cost', observed_at: '2025-11-01' }, NOW)).toBe('stale')
    expect(accessFreshness({ kind: 'lock', observed_at: '2025-11-01' }, NOW)).toBe('fresh')
  })

  it('never calls an undated fact fresh', () => {
    // L'absence de date n'est pas une preuve de fraîcheur, et la traiter comme
    // telle est ce qui fait appeler un client sur une information de 2024.
    expect(accessFreshness({ kind: 'lock', observed_at: null }, NOW)).toBe('undated')
    expect(accessFreshness({ kind: 'lock', observed_at: 'pas une date' }, NOW)).toBe('undated')
  })
})

describe('bestAccessFact', () => {
  it('lets a human correction win over a fresher pipeline deduction', () => {
    // C'est la promesse du bouton « Ce n'est pas exact » : sans cette règle, la
    // réanalyse du lendemain reprendrait la main et l'utilisateur referait sa
    // correction toutes les semaines.
    const best = bestAccessFact([
      { provenance: 'pipeline' as const, observed_at: '2026-08-20' },
      { provenance: 'human' as const, observed_at: '2026-01-10' },
    ])
    expect(best?.provenance).toBe('human')
  })

  it('prefers the most recent when provenance is equal', () => {
    const best = bestAccessFact([
      { provenance: 'pipeline' as const, observed_at: '2026-01-10' },
      { provenance: 'pipeline' as const, observed_at: '2026-08-20' },
    ])
    expect(best?.observed_at).toBe('2026-08-20')
  })

  it('prefers a dated fact over an undated one at equal provenance', () => {
    const best = bestAccessFact([
      { provenance: 'pipeline' as const, observed_at: null },
      { provenance: 'pipeline' as const, observed_at: '2026-03-12' },
    ])
    expect(best?.observed_at).toBe('2026-03-12')
  })

  it('returns null on an empty list rather than inventing a fact', () => {
    expect(bestAccessFact([])).toBeNull()
  })
})

describe('rankAccessModes', () => {
  const base = { lock: 'inconnu' as const, hasEntities: false, hasIncumbent: false, hasRelation: false }

  it('returns the seven modes, never fewer', () => {
    expect(
      rankAccessModes(base)
        .map(m => m.mode)
        .sort(),
    ).toEqual([...ACCESS_MODES].sort())
  })

  it('blocks the direct panel route only when the account is locked', () => {
    expect(rankAccessModes({ ...base, lock: 'verrouille' }).find(m => m.mode === 'direct_reference')?.feasibility).toBe(
      'blocked',
    )
    expect(rankAccessModes({ ...base, lock: 'inconnu' }).find(m => m.mode === 'direct_reference')?.feasibility).toBe(
      'possible',
    )
  })

  it('keeps the off-panel route open even on a locked account', () => {
    // « Les prescripteurs contournent le référencement quand il ne les satisfait
    // pas » — c'est la porte, pas une anomalie.
    expect(
      rankAccessModes({ ...base, lock: 'verrouille' }).find(m => m.mode === 'direct_hors_panel')?.feasibility,
    ).not.toBe('blocked')
  })

  it('never marks a mode impossible for lack of data', () => {
    // L'ignorance n'est pas un obstacle. Un compte sur lequel on ne sait rien
    // ne doit fermer aucune porte.
    expect(rankAccessModes(base).every(m => m.feasibility !== 'blocked')).toBe(true)
  })

  it('surfaces the subsidiary route when entities are known', () => {
    const ranked = rankAccessModes({ ...base, hasEntities: true })
    expect(ranked[0]?.mode).toBe('filiale_bu')
  })

  it('surfaces the rank-2 route when an incumbent is detected', () => {
    expect(
      rankAccessModes({ ...base, hasIncumbent: true }).find(m => m.mode === 'rang2_soustraitance')?.feasibility,
    ).toBe('available')
  })
})

describe('les énumérations', () => {
  it('carries the four lock states, unknown included', () => {
    // `inconnu` n'est pas un remplissage : « on ne sait pas » et « c'est
    // ouvert » mènent à deux gestes opposés.
    expect(ACCESS_LOCK_STATES).toContain('inconnu')
    expect(ACCESS_LOCK_STATES).toHaveLength(4)
  })

  it('carries the seven entry modes, five of them indirect', () => {
    expect(ACCESS_MODES).toHaveLength(7)
  })
})

describe('lockFactFromAwards', () => {
  it('reads an award as “someone is in place”, never as “locked”', () => {
    // DECP ne publie pas la durée du marché : affirmer que le panel est fermé
    // serait une invention, affirmer qu'il est ouvert une promesse.
    const fact = lockFactFromAwards([{ winner: 'Sopra Steria', title: 'TMA SI', notifiedDate: '2026-03-12' }])
    expect(fact?.value).toBe('semi_ouvert')
    expect(fact?.source).toContain('DECP')
    expect(fact?.observedAt).toBe('2026-03-12')
    expect(fact?.detail).toContain('Sopra Steria')
  })

  it('says out loud that the end date is unknown', () => {
    // Taire la limite laisserait croire que le compte est fermé pour toujours.
    expect(lockFactFromAwards([{ winner: 'Atos' }])?.detail).toContain('échéance')
  })

  it('keeps the most recent award when several exist', () => {
    const fact = lockFactFromAwards([
      { winner: 'Ancien', notifiedDate: '2024-01-01' },
      { winner: 'Récent', notifiedDate: '2026-05-05' },
    ])
    expect(fact?.detail).toContain('Récent')
  })

  it('deduces nothing at all from an absence of awards', () => {
    // Une entreprise privée n'apparaît dans AUCUN registre de marchés publics :
    // y lire une absence de référencement serait conclure d'un silence.
    expect(lockFactFromAwards([])).toBeNull()
    expect(lockFactFromAwards(null)).toBeNull()
    expect(lockFactFromAwards(undefined)).toBeNull()
  })
})

describe('lockFactFromAwards — l’échéance publiée (tome 2 §14)', () => {
  // ⚠️ Le tome 1 refusait l'échéance sur un fait FAUX : « DECP ne publie pas
  // dureeMois ». Vérifié en direct le 22/08 sur les deux jeux réellement
  // appelés (`decp-2022-marches-valides`, `decp_augmente`) : le champ existe et
  // 100 marchés IT récents sur 100 le portent. Un marché attribué avec sa durée
  // dit « la porte est tenue jusqu'au … », et surtout « elle se rouvre à … » —
  // c'est la seule source qui transforme un « non » en rendez-vous daté.

  it('locks the account while the contract is running, with its end date', () => {
    const fact = lockFactFromAwards(
      [{ winner: 'Sopra Steria', title: 'TMA SI', notifiedDate: '2026-03-12', endsOn: '2029-03-12' }],
      NOW,
    )
    expect(fact?.value).toBe('verrouille')
    expect(fact?.detail).toContain('2029')
    expect(fact?.reopensOn).toBe('2028-09-12')
  })

  it('does not lock an account whose contract has already expired', () => {
    // Le renouvellement a pu être attribué sans publication récente : dire
    // « verrouillé » serait affirmer une porte fermée qu'on n'a pas vue, et
    // dire « ouvert » promettrait l'inverse.
    const fact = lockFactFromAwards([{ winner: 'Atos', notifiedDate: '2021-01-04', endsOn: '2024-01-04' }], NOW)
    expect(fact?.value).toBe('semi_ouvert')
    expect(fact?.detail).toContain('échu')
    expect(fact?.reopensOn).toBeNull()
  })

  it('keeps the old behaviour when the duration is not published', () => {
    const fact = lockFactFromAwards([{ winner: 'Atos', notifiedDate: '2026-03-12' }], NOW)
    expect(fact?.value).toBe('semi_ouvert')
    expect(fact?.detail).toContain('échéance')
    expect(fact?.reopensOn).toBeNull()
  })

  it('refuses an unreadable end date rather than inventing one', () => {
    const fact = lockFactFromAwards([{ winner: 'Atos', notifiedDate: '2026-03-12', endsOn: 'bientôt' }], NOW)
    expect(fact?.value).toBe('semi_ouvert')
    expect(fact?.reopensOn).toBeNull()
  })

  it('reads the snake_case end date stored in raw_analysis', () => {
    const fact = lockFactFromAwards([{ winner: 'Sopra', notified_date: '2026-03-12', ends_on: '2029-03-12' }], NOW)
    expect(fact?.value).toBe('verrouille')
  })

  it('prefers the award that runs the longest, not merely the most recent', () => {
    // Deux marchés en cours : celui qui tient la porte le plus longtemps est
    // celui qui décide de la date de réouverture.
    const fact = lockFactFromAwards(
      [
        { winner: 'Court', notifiedDate: '2026-05-05', endsOn: '2026-11-05' },
        { winner: 'Long', notifiedDate: '2026-01-05', endsOn: '2030-01-05' },
      ],
      NOW,
    )
    expect(fact?.detail).toContain('Long')
    expect(fact?.reopensOn).toBe('2029-07-05')
  })

  it('never announces a reopening in the past', () => {
    // Un marché qui finit dans deux mois : la consultation est déjà lancée ou
    // sur le point de l'être. Annoncer « à revoir en mars dernier » serait une
    // date morte.
    const fact = lockFactFromAwards([{ winner: 'Sopra', notifiedDate: '2026-08-01', endsOn: '2026-10-01' }], NOW)
    expect(fact?.value).toBe('verrouille')
    expect(fact?.reopensOn).toBeNull()
    expect(fact?.detail).toContain('renouvellement')
  })
})

describe('lockFactFromAwards — les deux formes du même objet', () => {
  it('reads the snake_case shape that raw_analysis actually stores', () => {
    // L'IA émet `notifiedDate` ; la persistance passe tout le blob au serpent.
    // Ne lire qu'une des deux marcherait au collecteur et rendrait null en base.
    const fact = lockFactFromAwards([{ winner: 'Sopra', notified_date: '2026-03-12' }])
    expect(fact?.observedAt).toBe('2026-03-12')
  })
})

describe('discoverFamily', () => {
  const addr = (factors: { axis: string; points: number }[], max = 11) => ({
    score: factors.reduce((n, f) => n + f.points, 0),
    max,
    factors,
  })

  it('puts size disproportion first — no path lifts it', () => {
    // Un compte de 190 000 personnes reste hors de portée d'une ESN de deux,
    // même avec une porte grande ouverte.
    expect(
      discoverFamily({
        addressability: addr([
          { axis: 'lock', points: 6 },
          { axis: 'proportion', points: 0 },
        ]),
        signalCount: 3,
      }),
    ).toBe('out_of_reach')
  })

  it('routes through an intermediary when a supplier is in place', () => {
    expect(
      discoverFamily({
        addressability: addr([
          { axis: 'lock', points: 4 },
          { axis: 'proportion', points: 5 },
        ]),
        signalCount: 2,
      }),
    ).toBe('via_intermediary')
  })

  it('says “go” only when something is actually moving', () => {
    // Sans signal, « tu peux entrer » est vrai et inutile : rien ne dit
    // d'appeler aujourd'hui plutôt que dans six mois.
    const open = addr([
      { axis: 'lock', points: 6 },
      { axis: 'proportion', points: 5 },
    ])
    expect(discoverFamily({ addressability: open, signalCount: 1 })).toBe('reachable')
    expect(discoverFamily({ addressability: open, signalCount: 0 })).toBe('investigate')
  })

  it('never says “go” on a door nobody looked at', () => {
    // Recette live du 22/08 : 14 comptes sur 24 s'affichaient « Tu peux y
    // aller » alors que le SEUL axe mesuré était la proportion — c'est-à-dire
    // « ce compte est à ta taille », pas « la porte est ouverte ». L'aide de la
    // famille promet pourtant « rien ne semble bloquer l'entrée », et le tome
    // interdit explicitement de conclure « ouvert » d'un silence : une
    // entreprise privée n'apparaît dans AUCUN registre de marchés publics.
    const sizeOnly = addr([{ axis: 'proportion', points: 5 }])
    expect(discoverFamily({ addressability: sizeOnly, signalCount: 3 })).toBe('investigate')
  })

  it('falls back to “investigate” when nothing was measurable', () => {
    // « Je ne sais pas si tu peux entrer » est une réponse ; « hors de portée »
    // en serait une autre, et fausse.
    expect(discoverFamily({ addressability: null, signalCount: 4 })).toBe('investigate')
    expect(discoverFamily({ addressability: addr([], 0), signalCount: 4 })).toBe('investigate')
  })

  it('keeps the fourth family a real family, never a hidden bucket', () => {
    expect(DISCOVER_FAMILIES).toContain('out_of_reach')
    expect(DISCOVER_FAMILIES).toHaveLength(4)
  })
})

describe('addressabilityRatio', () => {
  it('is null when nothing was measurable rather than zero', () => {
    expect(addressabilityRatio({ score: null, max: 0 })).toBeNull()
    expect(addressabilityRatio(null)).toBeNull()
  })

  it('compares on the measurable maximum, not on twenty', () => {
    // 9 sur 11 mesurables vaut mieux que 9 sur 20 : comparer sur le plafond
    // théorique punirait un candidat pour ce qu'on n'a pas pu regarder.
    expect(addressabilityRatio({ score: 9, max: 11 })).toBeCloseTo(0.818, 2)
  })
})

describe('jobChangeOpening', () => {
  it('turns a known contact’s move into a door, at the detected stage', () => {
    const opening = jobChangeOpening({
      contactName: 'Claire Dubois',
      previousAccountName: 'Société Générale',
      newEmployer: 'Bedrock Streaming',
      knownSince: 'mars 2025',
    })
    expect(opening?.accessMode).toBe('introduction_relation')
    // Une porte n'est pas une affaire : la règle de non-régression du §4 veut
    // qu'aucune détection ne fasse avancer un projet dans le pipe.
    expect(opening?.stage).toBe('detected')
    expect(opening?.detail).toContain('Bedrock Streaming')
    expect(opening?.detail).toContain('Société Générale')
    expect(opening?.detail).toContain('mars 2025')
  })

  it('says out loud that no need is known there', () => {
    // Le produit propose une PORTE. Laisser croire à un besoin ferait préparer
    // un message qui parle de ce que le client n'a pas demandé.
    expect(
      jobChangeOpening({
        contactName: 'Claire Dubois',
        previousAccountName: 'SG',
        newEmployer: 'Bedrock',
        knownSince: null,
      })?.detail,
    ).toContain('porte, pas une affaire')
  })

  it('proposes nothing without a person or without an employer', () => {
    // « Quelqu'un que vous connaissez est quelque part » ne se travaille pas.
    expect(
      jobChangeOpening({ contactName: '  ', previousAccountName: 'SG', newEmployer: 'X', knownSince: null }),
    ).toBeNull()
    expect(
      jobChangeOpening({ contactName: 'Claire', previousAccountName: 'SG', newEmployer: ' ', knownSince: null }),
    ).toBeNull()
  })
})

// Incident 24/09 : DECP publie parfois la date comme le TEXTE « None ». Il
// partait tel quel en `observed_at` (timestamptz) et annulait la transaction
// de l'analyse. Une date illisible est une ABSENCE, jamais le texte brut.
describe('lockFactFromAwards — une date illisible (incident 24/09)', () => {
  const now = new Date('2026-09-24T00:00:00Z')

  it.each(['None', '', 'n/a', 'null', '   '])('« %s » donne observedAt null, jamais le texte', raw => {
    const fact = lockFactFromAwards([{ winner: 'Sopra Steria', notifiedDate: raw }], now)
    expect(fact?.value).toBe('semi_ouvert')
    expect(fact?.observedAt).toBeNull()
  })

  it('la même règle tient pour un marché en cours', () => {
    const fact = lockFactFromAwards([{ winner: 'Atos', notified_date: 'None', ends_on: '2028-01-01' }], now)
    expect(fact?.value).toBe('verrouille')
    expect(fact?.observedAt).toBeNull()
  })

  it('une date lisible reste inchangée', () => {
    const fact = lockFactFromAwards([{ winner: 'Atos', notifiedDate: '2026-03-02' }], now)
    expect(fact?.observedAt).toBe('2026-03-02')
  })
})

describe('partnerAccessContradictions — la matrice minimale (#2130.102)', () => {
  const E1 = '11111111-1111-4111-8111-111111111111'
  const E2 = '22222222-2222-4222-8222-222222222222'
  const lock = (entity_id: string | null, value = 'verrouille', freshness = 'fresh') => ({
    id: 'f1',
    kind: 'lock' as const,
    value,
    entity_id,
    freshness,
  })
  const partner = (entity_id: string | null, relationship: 'partner' | 'competitor' | 'unknown') => ({
    id: 'p1',
    name: 'Atos',
    entity_id,
    relationship,
  })

  it('dit NON au seul cas : la même entité « competitor » côté Partenaires ET verrouillée côté Accès', () => {
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [lock(E1)])).toEqual([
      { entity_id: E1, partner_id: 'p1', partner_name: 'Atos', fact_id: 'f1' },
    ])
  })

  it('admet toute autre combinaison', () => {
    expect(partnerAccessContradictions([partner(E1, 'partner')], [lock(E1)])).toEqual([])
    expect(partnerAccessContradictions([partner(E1, 'unknown')], [lock(E1)])).toEqual([])
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [lock(E1, 'ouvert')])).toEqual([])
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [lock(E1, 'semi_ouvert')])).toEqual([])
  })

  it('ne rapproche jamais sur une clé devinée : entités différentes ou absentes, fait périmé', () => {
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [lock(E2)])).toEqual([])
    expect(partnerAccessContradictions([partner(null, 'competitor')], [lock(null)])).toEqual([])
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [lock(E1, 'verrouille', 'stale')])).toEqual([])
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [lock(E1, 'verrouille', 'undated')])).toEqual([])
  })

  it('ignore les faits qui ne sont pas un verrou', () => {
    const mode = { ...lock(E1), kind: 'mode' as const }
    expect(partnerAccessContradictions([partner(E1, 'competitor')], [mode])).toEqual([])
  })
})

describe('declaredAccessStatus (#4802)', () => {
  const fact = (value: string, observed_at: string | null, provenance: 'human' | 'pipeline' = 'human') => ({
    kind: 'access_status' as const,
    value,
    provenance,
    source: 'déclaré par moi',
    observed_at,
  })

  it('aucune déclaration → null (l’écran dit « Accès inconnu »)', () => {
    expect(declaredAccessStatus([])).toBeNull()
  })

  it('le plus récent gagne, et une déclaration ancienne n’est jamais périmée', () => {
    const old = fact('referenced', '2019-01-01T00:00:00Z')
    const recent = fact('to_build', '2026-10-01T00:00:00Z')
    expect(declaredAccessStatus([old, recent])?.state).toBe('to_build')
    expect(declaredAccessStatus([recent, old])?.state).toBe('to_build')
    expect(declaredAccessStatus([old])?.state).toBe('referenced')
  })

  it('« inconnu » posé est un état posé', () => {
    expect(
      declaredAccessStatus([fact('referenced', '2026-01-01T00:00:00Z'), fact('inconnu', '2026-02-01T00:00:00Z')])
        ?.state,
    ).toBe('inconnu')
  })

  it('ignore ce qui n’est pas humain, pas de la bonne nature, ou une valeur hors liste', () => {
    expect(declaredAccessStatus([fact('referenced', '2026-01-01T00:00:00Z', 'pipeline')])).toBeNull()
    expect(declaredAccessStatus([fact('probablement', '2026-01-01T00:00:00Z')])).toBeNull()
    expect(declaredAccessStatus([{ ...fact('referenced', '2026-01-01T00:00:00Z'), kind: 'lock' as never }])).toBeNull()
  })

  it('le contrat refuse une valeur hors liste pour cette nature, et accepte les trois états', () => {
    expect(createAccessFactSchema.safeParse({ kind: 'access_status', value: 'ouvert' }).success).toBe(false)
    for (const value of ['inconnu', 'referenced', 'to_build'])
      expect(createAccessFactSchema.safeParse({ kind: 'access_status', value }).success).toBe(true)
    expect(createAccessFactSchema.safeParse({ kind: 'lock', value: 'ouvert' }).success).toBe(true)
  })
})
