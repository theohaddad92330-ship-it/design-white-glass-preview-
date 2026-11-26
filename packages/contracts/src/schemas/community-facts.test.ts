import { describe, expect, it } from 'vitest'
import { ACCESS_FACT_KINDS } from './access.js'
import {
  ACCESS_QUESTION_ANSWERS,
  ACCESS_QUESTION_MOMENTS,
  COMMUNITY_AGGREGABLE_KINDS,
  COMMUNITY_FORBIDDEN_KINDS,
  COMMUNITY_THRESHOLD,
  aggregateAccessFacts,
  isCommunityAggregable,
  lockFromAnswer,
  type CommunityFactInput,
} from './community-facts.js'

const ME = 'ws-me'
const fact = (workspaceId: string, value: string, observedAt = '2026-08-01'): CommunityFactInput => ({
  workspaceId,
  value,
  observedAt,
})

const agg = (facts: CommunityFactInput[], opts: { contributes?: boolean } = {}) =>
  aggregateAccessFacts({ facts, askingWorkspaceId: ME, contributes: opts.contributes ?? true })

describe('aggregateAccessFacts — le seuil', () => {
  it('is three distinct workspaces, and the constant says so', () => {
    expect(COMMUNITY_THRESHOLD).toBe(3)
  })

  it('keeps a single declaration local to the space that made it', () => {
    const out = agg([fact(ME, 'verrouille')])
    expect(out).toMatchObject({ value: 'verrouille', isCommunity: false, sourcesCount: 1, conflict: false })
  })

  it('keeps two concordant declarations local — two is not a community', () => {
    const out = agg([fact(ME, 'verrouille'), fact('ws-b', 'verrouille')])
    expect(out.isCommunity).toBe(false)
    expect(out.value).toBe('verrouille')
  })

  it('turns three concordant declarations into a community fact', () => {
    const out = agg([fact(ME, 'verrouille'), fact('ws-b', 'verrouille'), fact('ws-c', 'verrouille')])
    expect(out).toMatchObject({ value: 'verrouille', isCommunity: true, sourcesCount: 3, conflict: false })
  })

  it('counts WORKSPACES, not declarations — one space repeating itself is still one voice', () => {
    const out = agg([
      fact(ME, 'verrouille', '2026-01-01'),
      fact(ME, 'verrouille', '2026-04-01'),
      fact(ME, 'verrouille', '2026-08-01'),
    ])
    expect(out.sourcesCount).toBe(1)
    expect(out.isCommunity).toBe(false)
  })

  it('gives a space its OWN declaration even below the threshold', () => {
    const out = agg([fact(ME, 'ouvert'), fact('ws-b', 'verrouille')])
    expect(out.value).toBe('ouvert')
  })
})

describe('aggregateAccessFacts — la divergence', () => {
  it('stays local and flags the conflict on two-against-one', () => {
    const out = agg([fact('ws-a', 'verrouille'), fact('ws-b', 'verrouille'), fact('ws-c', 'ouvert')])
    expect(out.isCommunity).toBe(false)
    expect(out.conflict).toBe(true)
  })

  it('falls back to unknown when a community fact is later contradicted', () => {
    // « Divergence après agrégation : la valeur repasse en inconnu, les deux
    // sont conservées. » Une information contredite n'est pas une information.
    const out = agg([
      fact('ws-a', 'verrouille'),
      fact('ws-b', 'verrouille'),
      fact('ws-c', 'verrouille'),
      fact('ws-d', 'ouvert'),
    ])
    expect(out.value).toBeNull()
    expect(out.isCommunity).toBe(false)
    expect(out.conflict).toBe(true)
    expect(out.values).toEqual([
      { value: 'verrouille', sourcesCount: 3 },
      { value: 'ouvert', sourcesCount: 1 },
    ])
  })

  it('shows the asking space its own value even in a conflict', () => {
    const out = agg([
      fact(ME, 'ouvert'),
      fact('ws-b', 'verrouille'),
      fact('ws-c', 'verrouille'),
      fact('ws-d', 'verrouille'),
    ])
    expect(out.conflict).toBe(true)
    expect(out.value).toBe('ouvert')
  })
})

describe('aggregateAccessFacts — la réciprocité', () => {
  it('does not serve a community fact to a space that shares nothing', () => {
    const out = agg([fact('ws-a', 'verrouille'), fact('ws-b', 'verrouille'), fact('ws-c', 'verrouille')], {
      contributes: false,
    })
    expect(out.value).toBeNull()
    expect(out.isCommunity).toBe(false)
    // …mais on DIT que l'information existe : c'est le levier, et le taire
    // serait juste une fonctionnalité manquante de plus.
    expect(out.communityAvailable).toBe(true)
  })

  it('still serves a non-contributing space its OWN declaration', () => {
    const out = agg(
      [fact(ME, 'ouvert'), fact('ws-b', 'verrouille'), fact('ws-c', 'verrouille'), fact('ws-d', 'verrouille')],
      {
        contributes: false,
      },
    )
    expect(out.value).toBe('ouvert')
  })

  it('says nothing is available when there is nothing to withhold', () => {
    expect(agg([], { contributes: false }).communityAvailable).toBe(false)
    expect(agg([fact('ws-a', 'ouvert')], { contributes: false }).communityAvailable).toBe(false)
  })
})

describe('aggregateAccessFacts — l’anonymat', () => {
  it('never returns a workspace identifier', () => {
    const out = agg([fact(ME, 'verrouille'), fact('ws-b', 'verrouille'), fact('ws-c', 'verrouille')])
    expect(JSON.stringify(out)).not.toContain('ws-b')
    expect(JSON.stringify(out)).not.toContain(ME)
  })
})

describe('aggregateAccessFacts — les entrées douteuses', () => {
  it('ignores a fact with no value or no workspace', () => {
    const out = agg([
      { workspaceId: '', value: 'verrouille', observedAt: null },
      { workspaceId: 'ws-b', value: '  ', observedAt: null },
      fact('ws-c', 'verrouille'),
    ])
    expect(out.sourcesCount).toBe(1)
  })

  it('reads an empty list as “nothing known”, never as a value', () => {
    expect(agg([])).toMatchObject({ value: null, isCommunity: false, sourcesCount: 0, conflict: false })
  })

  it('trims and compares values case-insensitively — “Ouvert” and “ouvert” are one voice', () => {
    const out = agg([fact('ws-a', 'Ouvert'), fact('ws-b', ' ouvert '), fact('ws-c', 'OUVERT')])
    expect(out.isCommunity).toBe(true)
    expect(out.value).toBe('ouvert')
  })

  it('orders the values by how many spaces say them', () => {
    const out = agg([fact('ws-a', 'ouvert'), fact('ws-b', 'verrouille'), fact('ws-c', 'verrouille')])
    expect(out.values.map(v => v.value)).toEqual(['verrouille', 'ouvert'])
  })
})

describe('les cinq moments et leurs réponses', () => {
  it('offers an answer set for every moment, and never an empty one', () => {
    for (const moment of ACCESS_QUESTION_MOMENTS) {
      expect(ACCESS_QUESTION_ANSWERS[moment].length).toBeGreaterThanOrEqual(2)
    }
  })

  it('turns only the two answers that speak about a panel into a lock state', () => {
    expect(lockFromAnswer('panel_ferme')).toBe('verrouille')
    expect(lockFromAnswer('panel_ouvert')).toBe('ouvert')
    expect(lockFromAnswer('refus_referencement')).toBe('verrouille')
  })

  it('learns nothing from “not discussed” or from a refusal on the merits', () => {
    // Les traduire en « ouvert » inventerait une porte que personne n'a vue.
    expect(lockFromAnswer('skip')).toBeNull()
    expect(lockFromAnswer('refus_fond')).toBeNull()
  })

  it('asks about a refusal BEFORE anything else — that is when the reason is fresh', () => {
    expect(ACCESS_QUESTION_MOMENTS[0]).toBe('after_refusal')
  })

  it('pose la qualification du Sprint 3 en DERNIER, et jamais au milieu', () => {
    // GA-08 : une valeur neuve va en fin. Ici l'ordre est aussi la priorité —
    // les trois premiers moments sont PONCTUELS et ne reviennent pas, celui du
    // Sprint 3 dure tant que le compte reste dans la colonne. Le poser avant
    // brûlerait le seul tour de parole disponible.
    expect(ACCESS_QUESTION_MOMENTS.at(-1)).toBe('sprint3_qualification')
    expect(ACCESS_QUESTION_MOMENTS.slice(0, 3)).toEqual(['after_refusal', 'mission_end', 'first_contact'])
  })

  it('propose au Sprint 3 les réponses du VERROU, pas celles d’un refus', () => {
    // C'est la troisième des huit questions de la grille qui alimente
    // `access_fact`, et elle porte sur le référencement.
    expect(ACCESS_QUESTION_ANSWERS.sprint3_qualification).toEqual(['panel_ferme', 'panel_ouvert', 'skip'])
  })
})

/**
 * L'interdit juridique — tome 8, D70 et §54.
 *
 * Ce n'est pas une règle produit : c'est du droit de la concurrence. Agréger
 * entre ESN concurrentes ce que chacune paie de commission pour entrer chez un
 * client est un échange d'informations tarifaires. Le tome le marque « à
 * vérifier AVANT de l'ouvrir » aux deux endroits où il en parle.
 *
 * L'interdit était respecté au 25/08/2026, mais par un `WHERE f.kind = 'lock'`
 * écrit à la main dans un seul service. La suite naturelle du mécanisme est
 * d'étendre l'agrégation aux modes d'accès — et rien n'aurait arrêté la main
 * qui écrit `IN ('lock','mode','cost')` avant `cost`.
 */
describe("ce qui ne s'agrège jamais entre espaces", () => {
  it('le COÛT D’ACCÈS est refusé, et la raison est écrite', () => {
    expect(isCommunityAggregable('cost')).toBe(false)
    expect(COMMUNITY_FORBIDDEN_KINDS.cost).toMatch(/concurrent/i)
  })

  it('les trois autres natures sont autorisées', () => {
    for (const kind of ['lock', 'mode', 'path']) expect(isCommunityAggregable(kind)).toBe(true)
  })

  it('couvre TOUTES les natures de fait, sans trou ni recouvrement', () => {
    // Une nature ajoutée demain doit être rangée d'un côté ou de l'autre. Sans
    // ce test, elle serait implicitement interdite — ce qui est le bon défaut,
    // mais silencieux : personne ne saurait qu'une décision reste à prendre.
    const classified = [...COMMUNITY_AGGREGABLE_KINDS, ...Object.keys(COMMUNITY_FORBIDDEN_KINDS)].sort()
    expect(classified).toEqual([...ACCESS_FACT_KINDS].sort())
    const overlap = COMMUNITY_AGGREGABLE_KINDS.filter(k => k in COMMUNITY_FORBIDDEN_KINDS)
    expect(overlap).toEqual([])
  })

  it('une nature inconnue est refusée par défaut', () => {
    expect(isCommunityAggregable('tjm')).toBe(false)
    expect(isCommunityAggregable('')).toBe(false)
  })
})
