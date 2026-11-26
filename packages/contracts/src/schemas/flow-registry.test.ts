import { describe, expect, it } from 'vitest'
import {
  FLOW_KEYS,
  FLOW_REGISTRY,
  flowDefinitionSchema,
  flowGaps,
  writingFlows,
  type FlowDefinition,
} from './flow-registry.js'

/**
 * Le registre des flux (BEL-ARCH-003) — ce que ces tests protègent.
 *
 * Un registre déclaratif a un défaut connu : il vieillit en silence. Personne ne
 * le relit, le code bouge, et il finit par décrire un produit qui n'existe plus
 * — ce qui est pire que son absence, parce qu'on s'y fie.
 *
 * Ces tests ne peuvent pas vérifier que la description est VRAIE : seule une
 * relecture le peut. Ils vérifient qu'elle est COMPLÈTE et qu'elle ne peut pas
 * devenir complaisante — chaque flux dit son échec, chaque flux qui écrit porte
 * une clé, et chaque flux incomplet nomme son écart. Un registre qui n'énonce
 * que ce qui marche est une brochure.
 */
describe('registre des flux — complétude', () => {
  it('décrit les NEUF flux, sans doublon', () => {
    expect(FLOW_REGISTRY).toHaveLength(FLOW_KEYS.length)
    expect(new Set(FLOW_REGISTRY.map(flow => flow.key)).size).toBe(FLOW_KEYS.length)
  })

  it('chaque entrée respecte le contrat', () => {
    for (const flow of FLOW_REGISTRY) {
      expect(flowDefinitionSchema.safeParse(flow).success).toBe(true)
    }
  })

  it('chaque flux dit ce qui se passe en ÉCHEC — un échec non décrit est un échec invisible', () => {
    const silent = FLOW_REGISTRY.filter(flow => !flow.onFailure.trim())
    expect(silent).toEqual([])
  })

  it('chaque flux nomme la règle qu’il ne franchit pas', () => {
    const ungoverned = FLOW_REGISTRY.filter(flow => !flow.guard.trim())
    expect(ungoverned).toEqual([])
  })
})

describe('registre des flux — honnêteté', () => {
  it('tout flux qui ÉCRIT porte une clé d’idempotence', () => {
    // Un flux qui écrit sans clé fabrique un doublon au premier rejeu. S'il
    // n'en a pas, ce n'est pas au registre de le cacher : c'est un défaut.
    const unkeyed = writingFlows().filter(flow => flow.idempotencyKey.length === 0)
    expect(unkeyed.map(flow => flow.key)).toEqual([])
  })

  it('tout flux incomplet ou absent NOMME son écart', () => {
    const unexplained = FLOW_REGISTRY.filter(flow => flow.state !== 'implemented' && !flow.caveat)
    expect(unexplained.map(flow => flow.key)).toEqual([])
  })

  it('autorise une réserve sur un flux COMPLET — la clé réelle peut différer de la clé spécifiée', () => {
    // Règle inverse de celle qu'on serait tenté d'écrire. Interdire toute
    // réserve sur un flux « complet » pousserait à SUPPRIMER la note plutôt
    // qu'à la lire : la capture d'activité fonctionne de bout en bout ET ses
    // clés ne sont pas celles de la spécification. Les deux sont vrais, et
    // c'est le second qui évite de fabriquer un doublon un jour.
    const timeline = FLOW_REGISTRY.find(flow => flow.key === 'external_activity_to_timeline')
    expect(timeline?.state).toBe('implemented')
    expect(timeline?.caveat).toBeTruthy()
  })

  it('reconnaît que la majorité des flux n’est PAS complète — un registre tout vert serait faux', () => {
    // Au 19/08/2026 : deux complets, trois partiels, quatre absents.
    // Au 26/08/2026 : cinq complets, quatre partiels, aucun absent — non
    // parce qu'on a codé quatre flux ce jour-là, mais parce que le registre
    // DÉCLARAIT absent ce qui tournait depuis des semaines. Le seul flux
    // encore réellement absent était `project_won_to_mission`, et c'est
    // l'inverse : il est vivant, et c'est SON DÉFAUT qui l'était aussi.
    //
    // Le test garde son sens : un registre entièrement `implemented` est faux
    // par construction, parce qu'il n'existe aucun produit dont les neuf flux
    // font exactement ce que leur spécification décrit.
    const implemented = FLOW_REGISTRY.filter(flow => flow.state === 'implemented')
    expect(implemented.length).toBeLessThan(FLOW_REGISTRY.length)
    expect(flowGaps().length).toBeGreaterThan(0)
  })

  it('les flux ABSENTS n’écrivent rien — déclarer une écriture sans code est la pire ligne possible', () => {
    const lying = FLOW_REGISTRY.filter((flow: FlowDefinition) => flow.state === 'absent' && flow.writes.length > 0)
    expect(lying.map(flow => flow.key)).toEqual([])
  })
})

describe('registre des flux — ce qu’il donne à lire', () => {
  it('répond à « que se passe-t-il quand un projet passe en gagné ? » sans relire six fichiers', () => {
    const flow = FLOW_REGISTRY.find(entry => entry.key === 'project_won_to_mission')

    // Le registre a déclaré ce flux `absent` — « le passage à `won` n'appelle
    // rien » — pendant que le serveur créait la mission depuis août. Une
    // entrée fausse dans le sens « absent » est aussi coûteuse qu'une entrée
    // fausse dans l'autre sens : elle fait rouvrir un chantier déjà fait, et
    // elle avait masqué le vrai défaut, qui était l'absence d'unicité.
    expect(flow?.state).toBe('implemented')
    expect(flow?.writes).toEqual(['missions'])
    expect(flow?.idempotencyKey).toEqual(['workspace_id', 'opportunity_id'])
    expect(flow?.guard).toContain('jamais de création silencieuse')
  })

  it('dit que le seul flux complet de bout en bout côté finance n’émet aucune facture', () => {
    const flow = FLOW_REGISTRY.find(entry => entry.key === 'timesheet_to_invoice_readiness')

    expect(flow?.state).toBe('implemented')
    expect(flow?.guard).toContain('AUCUNE facture')
  })
})
