/**
 * Un contact CONNU n'est jamais « non enrichi » (#4679, décision Louis 28/10/2026).
 *
 * Mesuré sur le compte VICAT : le seul contact que le commercial connaissait (CISO, mail + portable, provenance
 * « Import de masse ») sortait de l'organigramme classé « Non enrichis », sans niveau, pendant qu'un CISO DÉDUIT
 * occupait le L1. Le seau « non enrichis » décidait sur le seul statut d'identité du graphe ; or un contact importé
 * n'a pas de nœud dans le graphe.
 *
 * CE QUE CETTE GARDE LIT : le vrai calcul (`unenrichedOrgContacts`, `knownOrgContacts`) sur CHAQUE valeur de
 * `KNOWN_CONTACT_SOURCES` (le prédicat des contrats, jamais une liste recopiée ici), puis le code source du seau
 * pour prouver qu'il consulte bien le prédicat. Elle SAIT DIRE NON : un contact découvert (`apollo`) reste « non
 * enrichi », et un seau qui ne consulterait pas le prédicat la ferait rougir.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KNOWN_CONTACT_SOURCES, orgGraphSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { unenrichedOrgContacts } from '@/features/accounts/view/account-detail/tabs/organigramme/focalOrgData'
import { knownOrgContacts } from '@/features/accounts/view/account-detail/tabs/organigramme/knownOrgContacts'

const ORG_DIR = join(__dirname, '../features/accounts/view/account-detail/tabs/organigramme')

const GRAPH = orgGraphSchema.parse({
  graphVersion: 3,
  entities: [{ id: 'e1', name: 'VICAT', type: 'groupe', parentId: null, confidence: 90, sources: [] }],
  people: [],
  hierarchyEdges: [],
  buyingCommittee: [],
  recommendedPath: [],
})

const contact = (source: string, title: string | null) => ({
  id: `c-${source}`,
  full_name: `Personne ${source}`,
  title,
  source,
})

describe('un contact connu n’est jamais dans le seau « non enrichis » de l’organigramme', () => {
  it('la garde LIT quelque chose : le prédicat des contrats porte au moins import et crm', () => {
    expect([...KNOWN_CONTACT_SOURCES]).toEqual(expect.arrayContaining(['import', 'crm']))
  })

  it.each([...KNOWN_CONTACT_SOURCES])('source « %s » : hors du seau, avec ou sans titre', source => {
    for (const title of ['CISO', null]) {
      const bucket = unenrichedOrgContacts(GRAPH, [contact(source, title)])
      expect(bucket).toEqual([])
    }
  })

  it.each([...KNOWN_CONTACT_SOURCES])(
    'source « %s » : il a sa place (arbre ou « Connus de l’équipe »), il ne disparaît pas',
    source => {
      const { placed, pinned } = knownOrgContacts(
        GRAPH,
        [contact(source, 'CISO'), contact(source, null)].map((c, i) => ({
          ...c,
          id: `${c.id}-${i}`,
          full_name: `${c.full_name} ${i}`,
        })),
        new Set(['vicat']),
      )
      expect(placed.length + pinned.length).toBe(2)
    },
  )

  it('SAIT DIRE NON — un contact découvert par l’analyse reste « non enrichi »', () => {
    expect(unenrichedOrgContacts(GRAPH, [contact('apollo', 'CISO')]).map(c => c.fullName)).toEqual(['Personne apollo'])
  })

  it('SAIT DIRE NON — une saisie à la main n’est pas une relation importée', () => {
    expect(unenrichedOrgContacts(GRAPH, [contact('manual', 'CISO')])).toHaveLength(1)
  })

  it('le seau consulte LE prédicat des contrats, pas une liste locale', () => {
    const source = readFileSync(join(ORG_DIR, 'focalOrgData.ts'), 'utf8')
    const bucket = source.slice(source.indexOf('export function unenrichedOrgContacts'))
    expect(bucket).toMatch(/isKnownContact\(/)
    expect(bucket).not.toMatch(/['"]import['"]/)
  })
})
