import {
  orgGraphSchema,
  type OrgDeclaredPerson,
  type OrgGraph,
  type OrgPerson,
  type OrgSource,
} from '@bellum/contracts'

/**
 * Injection des personnes DÉCLARÉES par un humain dans le graphe stocké (#1103).
 *
 * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
 * soit pouvoir décrire des éléments et ensuite ça intègre. »
 *
 * Fonction PURE, miroir de `applyOrgGraphCorrection` : la correction ÉLAGUE ce
 * qu'on a écarté, celle-ci GREFFE ce qu'on connaît. Les deux sont rejouées sur
 * le graphe déjà affiché pour que le geste se voie sans attendre un run, et
 * réappliquées après chaque run pour qu'il ne l'écrase pas.
 *
 * ── Les quatre règles, et l'accident que chacune évite ────────────────────
 *
 * 1. **La déclaration ne double pas quelqu'un qu'on a déjà.** Le rapprochement
 *    se fait sur le nom normalisé, la même clé que le reste du pipeline. Une
 *    personne déjà présente est CONFIRMÉE (source + confiance), pas dupliquée —
 *    deux fiches pour la même personne dans un organigramme est exactement ce
 *    qu'un commercial ne pardonne pas.
 * 2. **On ne crée JAMAIS d'entité.** Une direction écrite qui ne correspond à
 *    aucun nœud laisse la personne rattachée à rien. Fabriquer l'entité
 *    inventerait une branche d'organigramme à partir d'une faute de frappe.
 * 3. **Un manager introuvable ne produit AUCUN lien.** Jamais un lien vers le
 *    « plus proche » : se tromper de N+1 oriente toute une approche commerciale
 *    vers la mauvaise personne.
 * 4. **Le résultat est re-validé contre le contrat.** Un graphe qui violerait
 *    un invariant n'est pas écrit : on préfère perdre la greffe que stocker un
 *    graphe qui ment. Même arbitrage que `applyRelationVerdict`.
 *
 * Ce qu'une déclaration VAUT : source `org_chart`, grounding `A`, confiance
 * 100. C'est le maximum de l'échelle, et c'est justifié — quelqu'un qui
 * travaille le compte affirme connaître cette personne. Le lien hiérarchique
 * qui en découle est `verified`, pour la même raison : la p14 réserve le trait
 * plein aux preuves de rang A, et une déclaration humaine en est une.
 */

/**
 * Clé d'identité d'une personne — MIROIR de `normalize_person_name` côté IA.
 *
 * Accents, casse, ponctuation et espaces multiples neutralisés. C'est ce qui
 * permet à une déclaration de retrouver la MÊME personne dans le graphe du run
 * suivant, où tous les ids ont été refabriqués. « Jean Dupond » n'est toujours
 * pas « Jean Dupont » : on neutralise la forme, jamais l'orthographe.
 */
export function personKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Id stable d'une personne déclarée. Stable = la même à chaque réapplication. */
function declaredId(name: string): string {
  return `p-declared-${personKey(name).replace(/ /g, '-')}`
}

/**
 * #2553.3 — la preuve porte la date du FAIT, pas celle du geste : quand la
 * déclaration vient d'un document daté (organigramme importé), `verifiedAt`
 * est la date du document, sinon celle du clic. C'est cette même valeur qui
 * alimente `lastVerifiedAt` plus bas, donc la fraîcheur du graphe.
 */
function declaredSource(id: string, verifiedAt: string, fromDocument: boolean): OrgSource {
  return {
    id: `s-${id}`,
    kind: 'org_chart',
    grounding: 'A',
    // #2553 / #3740 — un document daté NOMME son année : « organigramme importé
    // (2023) », pour que l'utilisateur sache que la donnée a trois ans.
    ref: fromDocument ? `organigramme importé (${verifiedAt.slice(0, 4)})` : 'saisi dans Bellum',
    date: verifiedAt,
  }
}

/**
 * Greffe les déclarations sur `graph`. Rend `null` quand il n'y a rien à faire
 * ou quand le résultat ne passerait pas le contrat — dans les deux cas
 * l'appelant laisse le graphe stocké tel quel.
 */
export function applyDeclaredPeople(graph: OrgGraph, declared: readonly OrgDeclaredPerson[]): OrgGraph | null {
  if (declared.length === 0) return null

  const people: OrgPerson[] = [...graph.people]
  const byKey = new Map(people.map((p, index) => [personKey(p.fullName), index]))
  const entityByName = new Map(graph.entities.map(e => [personKey(e.name), e.id]))
  const hierarchyEdges = [...graph.hierarchyEdges]
  // Une personne rejetée reste rejetée tant que personne ne la redéclare — mais
  // la redéclarer EST la levée du rejet : c'est un geste humain postérieur, et
  // le contrat refuse qu'un id soit à la fois actif et sur l'ardoise.
  const declaredIds = new Set<string>()

  for (const entry of declared) {
    const key = personKey(entry.fullName)
    if (!key) continue
    const existingIndex = byKey.get(key)
    // #2553.3 — un document daté (organigramme importé) prouve le fait à SA
    // date, pas à celle de l'import. Sans `documentDate`, rien ne change :
    // c'est la date du geste, comme avant.
    const verifiedAt = entry.documentDate ?? entry.declaredAt
    const source = declaredSource(
      existingIndex === undefined ? declaredId(entry.fullName) : people[existingIndex]!.id,
      verifiedAt,
      entry.documentDate !== undefined,
    )

    if (existingIndex !== undefined) {
      // Règle 1 — on CONFIRME, on ne duplique pas.
      const current = people[existingIndex]!
      declaredIds.add(current.id)
      people[existingIndex] = {
        ...current,
        // Un titre écrit par un humain l'emporte sur un titre déduit ; un champ
        // laissé vide dans le formulaire n'efface RIEN (present-only).
        ...(entry.title ? { title: entry.title } : {}),
        sources: current.sources.some(s => s.id === source.id) ? current.sources : [...current.sources, source],
        confidence: 100,
        identityStatus: 'verified_identity',
        // Déclarer quelqu'un, c'est l'AFFIRMER — donc c'est une vérification,
        // et elle a une date : celle du geste, jamais celle de l'écriture en
        // base ni « aujourd'hui » recalculé plus tard. Sans elle, une
        // confirmation humaine de mars 2026 se lirait encore « à jour » en
        // 2027. #2553.3 — sauf si un document plus ancien la prouve : c'est
        // alors SA date qui doit vieillir, pas celle du clic qui l'importe.
        lastVerifiedAt: verifiedAt,
      }
    } else {
      const id = declaredId(entry.fullName)
      declaredIds.add(id)
      // Règle 2 — aucune entité créée. Introuvable ⇒ rattaché à rien.
      const entityId = entry.entityName ? (entityByName.get(personKey(entry.entityName)) ?? null) : null
      const person: OrgPerson = {
        id,
        fullName: entry.fullName,
        ...(entry.title ? { title: entry.title } : {}),
        entityId,
        decisionRoles: [],
        identityStatus: 'verified_identity',
        sources: [source],
        confidence: 100,
        lastVerifiedAt: verifiedAt,
      }
      people.push(person)
      byKey.set(key, people.length - 1)
    }

    // Règle 3 — un manager introuvable ne produit aucun lien.
    if (!entry.managerName) continue
    const managerIndex = byKey.get(personKey(entry.managerName))
    if (managerIndex === undefined) continue
    const fromId = people[byKey.get(key)!]!.id
    const toId = people[managerIndex]!.id
    if (fromId === toId) continue
    const already = hierarchyEdges.some(e => e.fromId === fromId && e.toId === toId && e.type === 'reports_to')
    if (already) continue
    hierarchyEdges.push({
      fromId,
      toId,
      type: 'reports_to',
      verified: true,
      confidence: 100,
      sourceIds: [source.id],
      // #2553.3 — sans cette date, le lien ne vieillit jamais (jamais
      // `never_verified` non plus, puisque `verified: true`) : la file de
      // revérification (`orgRevalidationQueue`) ne peut agir que sur une date.
      lastVerifiedAt: verifiedAt,
    })
  }

  const next: OrgGraph = {
    ...graph,
    people,
    hierarchyEdges,
    // Redéclarer quelqu'un lève son rejet : sans ça le contrat refuserait le
    // graphe (un id ne peut pas être actif ET sur l'ardoise), et la personne
    // resterait invisible sans qu'on sache pourquoi.
    rejectedItems: graph.rejectedItems.filter(r => !declaredIds.has(r.sourceId)),
  }

  // Règle 4 — on préfère perdre la greffe que stocker un graphe qui ment.
  const parsed = orgGraphSchema.safeParse(next)
  return parsed.success ? parsed.data : null
}

/**
 * Ajoute une déclaration à l'ardoise du compte, sans doublon.
 *
 * Redéclarer quelqu'un REMPLACE sa déclaration au lieu d'en empiler une
 * seconde : deux déclarations de la même personne se contrediraient un jour, et
 * personne ne saurait laquelle fait foi.
 */
export function mergeDeclaredPeople(
  current: readonly OrgDeclaredPerson[],
  incoming: readonly OrgDeclaredPerson[],
): OrgDeclaredPerson[] {
  const out = [...current]
  for (const entry of incoming) {
    const key = personKey(entry.fullName)
    if (!key) continue
    const index = out.findIndex(existing => personKey(existing.fullName) === key)
    if (index === -1) out.push(entry)
    else out[index] = entry
  }
  return out
}
