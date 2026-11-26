import { aggregateAccessFacts, COMMUNITY_THRESHOLD } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SERVICE = readFileSync(join(__dirname, 'account-access.service.ts'), 'utf8')

/**
 * La donnée communautaire côté service (tome 2 §5 et §25, ticket BEL-DATA-005).
 *
 * Les quatre principes sont non négociables, et trois d'entre eux se vérifient
 * ici, sur la SOURCE : ce sont des propriétés d'une requête SQL, et une requête
 * ne se teste pas en la ré-écrivant dans un mock qui dirait la même chose.
 */
describe('la lecture communautaire ne trahit personne', () => {
  it('only pools declarations from spaces that share — reciprocity', () => {
    // « Un espace qui ne contribue pas ne consomme pas », et il ne fournit pas
    // non plus : sa déclaration ne peut pas nourrir un pool dont il s'exclut.
    const query = SERVICE.slice(SERVICE.indexOf('communityLock'))
    expect(query).toContain('community_data_sharing')
  })

  it('matches accounts across spaces on the SIREN, never on the name', () => {
    // Deux espaces qui écrivent « SNCF » et « SNCF Réseau » ne parlent pas du
    // même compte. Le SIREN est la seule identité qui traverse un espace.
    const query = SERVICE.slice(SERVICE.indexOf('communityLock'))
    expect(query).toContain('a.siren = ')
    expect(query).not.toContain('company_name =')
  })

  it('pools only HUMAN declarations — a pipeline deduction is not a testimony', () => {
    const query = SERVICE.slice(SERVICE.indexOf('communityLock'))
    expect(query).toContain("provenance = 'human'")
  })

  it('never returns a contributor identity to the caller', () => {
    // GD-06. L'agrégat porte un COMPTE d'espaces, jamais leurs identifiants.
    const out = aggregateAccessFacts({
      facts: [
        { workspaceId: 'ws-a', value: 'verrouille', observedAt: null },
        { workspaceId: 'ws-b', value: 'verrouille', observedAt: null },
        { workspaceId: 'ws-c', value: 'verrouille', observedAt: null },
      ],
      askingWorkspaceId: 'ws-me',
      contributes: true,
    })
    expect(out.isCommunity).toBe(true)
    expect(JSON.stringify(out)).not.toMatch(/ws-[abc]/)
  })

  it('keeps the threshold in ONE place — the contract, not the service', () => {
    // GD-07. Un seuil recopié dans un service diverge du jour où quelqu'un le
    // change, et personne ne s'en aperçoit avant qu'un client voie la donnée
    // d'un autre trop tôt.
    expect(COMMUNITY_THRESHOLD).toBe(3)
    expect(SERVICE).not.toMatch(/>=\s*3\b/)
  })
})

describe('la question ne se pose qu’une fois', () => {
  it('records the question as ASKED the moment it is served', () => {
    // « Ignorée ⇒ jamais reposée » : la seule façon de tenir cette promesse est
    // d'écrire la trace en SERVANT la question, pas en recevant la réponse — on
    // ne saura jamais qu'une question a été ignorée.
    const block = SERVICE.slice(SERVICE.indexOf('pendingQuestion'))
    expect(block).toContain('INSERT INTO access_fact_questions')
    expect(block).toContain('ON CONFLICT')
  })

  it('asks about a refusal first — that is when the reason is still fresh', () => {
    const block = SERVICE.slice(SERVICE.indexOf('pendingQuestion'))
    const refusal = block.indexOf('after_refusal')
    const mission = block.indexOf('mission_end')
    expect(refusal).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(mission)
  })
})
