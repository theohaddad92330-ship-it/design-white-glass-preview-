import type { OrgEntity, OrgGraph, OrgPerson } from './org-graph.js'

/**
 * #2554.1 / #2554.2 — actualiser un compte doit RE-VÉRIFIER l'organigramme
 * EXISTANT, pas le laisser vieillir en silence, et le DIRE : qui a été
 * revérifié, qui a changé de poste, qui n'a pas pu être reconfirmé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISTINCT DE `mergeOrgGraphDelta` (org-graph-merge.ts)
 * ─────────────────────────────────────────────────────────────────────────
 * `mergeOrgGraphDelta` sert une VAGUE ciblée : `touchedPersonIds` est connu
 * D'AVANCE (le planificateur a choisi ce lot), donc une personne touchée mais
 * absente du résultat est reconduite SANS un mot — la vague ne prétend rien
 * sur elle.
 *
 * Un run COMPLET (« Actualiser », dimension `entities`/`positions` du
 * rafraîchissement) envoie TOUT le compte en seeds et ne sait pas d'avance
 * qui la phase 3 va confirmer : c'est un vrai geste de VÉRIFICATION. Ce
 * fichier compare donc ce qui EST REVENU (`incoming`) à ce qui était STOCKÉ
 * (`current`) après coup, et nomme le résultat plutôt que de le taire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOCTRINE TENUE ICI
 * ─────────────────────────────────────────────────────────────────────────
 *  · **on archive, on ne supprime pas** — une personne du graphe stocké qui
 *    n'est pas revenue dans `incoming` n'est retirée de rien ; elle est
 *    réinjectée, marquée `notConfirmedSince` avec la date de CE run ;
 *  · **« non confirmé » n'est ni « parti » ni « à jour »** — son titre reste
 *    celui du dernier run qui l'a vue, jamais réaffirmé comme actuel ;
 *  · **distinct de #2502** (organigramme ABSENT) — un premier peuplement n'a
 *    rien à comparer : `preserveNotConfirmedPeople` rend `null`.
 */

export type OrgPersonDiffKind = 'reverified' | 'changedPosition' | 'new' | 'notConfirmed'

export type OrgPersonDiffEntry = {
  personId: string
  fullName: string
  kind: OrgPersonDiffKind
  /** `changedPosition` seulement. */
  previousTitle?: string
  nextTitle?: string
}

/** #2318.4 — une entité (filiale, site) apparue dans ce run qui n'était pas
 *  dans le graphe stocké. Pas de symétrique « disparue » : contrairement aux
 *  personnes, une entité absente n'est jamais réinjectée ici — elle reste
 *  simplement hors de `incoming.entities`, sans qu'on prétende savoir si elle
 *  a fermé ou si le run ne l'a pas revue. */
export type OrgEntityDiffEntry = { entityId: string; name: string }

export type OrgPeopleRefreshDiff = {
  /** Quand CE run a tourné — la date que porte chaque personne non confirmée. */
  asOf: string
  reverified: OrgPersonDiffEntry[]
  changedPosition: OrgPersonDiffEntry[]
  new: OrgPersonDiffEntry[]
  notConfirmed: OrgPersonDiffEntry[]
  /** #2318.4 — « nouvelles entités » : filiales/sites apparus dans ce run. */
  newEntities: OrgEntityDiffEntry[]
}

/**
 * Compare le graphe STOCKÉ et celui qu'un run d'actualisation vient de
 * rendre, et produit le graphe à PERSISTER — jamais un simple remplacement :
 * une personne absente de `incoming` est réinjectée depuis `current`, nommée
 * non confirmée. Rend `null` sur un premier peuplement (`current` sans
 * personne) : il n'y a rien à revérifier, voir #2502.
 *
 * Pure, sans horloge ni base — `asOf` est fourni par l'appelant.
 */
export function preserveNotConfirmedPeople(input: {
  current: OrgGraph
  incoming: OrgGraph
  asOf: string
}): { orgGraph: OrgGraph; diff: OrgPeopleRefreshDiff } | null {
  const { current, incoming, asOf } = input
  if (current.people.length === 0) return null

  const currentById = new Map(current.people.map(person => [person.id, person]))
  const incomingIds = new Set(incoming.people.map(person => person.id))

  const diff: OrgPeopleRefreshDiff = {
    asOf,
    reverified: [],
    changedPosition: [],
    new: [],
    notConfirmed: [],
    newEntities: [],
  }

  // #2318.4 — « nouvelles entités » : dans `incoming.entities` mais pas dans
  // `current.entities`. Calculé ici, où les deux graphes sont déjà en main —
  // un second passage sur les mêmes données diviserait la source (GA-26).
  const currentEntityIdSet = new Set(current.entities.map(entity => entity.id))
  for (const entity of incoming.entities) {
    if (!currentEntityIdSet.has(entity.id)) diff.newEntities.push({ entityId: entity.id, name: entity.name })
  }

  const people: OrgPerson[] = incoming.people.map(person => {
    const before = currentById.get(person.id)
    if (!before) {
      diff.new.push({ personId: person.id, fullName: person.fullName, kind: 'new' })
    } else if ((before.title ?? '') !== (person.title ?? '')) {
      diff.changedPosition.push({
        personId: person.id,
        fullName: person.fullName,
        kind: 'changedPosition',
        previousTitle: before.title,
        nextTitle: person.title,
      })
    } else {
      diff.reverified.push({ personId: person.id, fullName: person.fullName, kind: 'reverified' })
    }
    // Reconfirmée par CE run : une marque héritée d'un run antérieur ne tient plus.
    const { notConfirmedSince: _dropped, ...reconfirmed } = person
    return reconfirmed
  })

  const entityIds = new Set(incoming.entities.map(entity => entity.id))
  const entities: OrgEntity[] = [...incoming.entities]

  for (const person of current.people) {
    if (incomingIds.has(person.id)) continue
    diff.notConfirmed.push({ personId: person.id, fullName: person.fullName, kind: 'notConfirmed' })
    people.push({ ...person, notConfirmedSince: person.notConfirmedSince ?? asOf })
    // Son entité de rattachement doit survivre elle aussi, sinon la personne
    // pointerait vers une entité qui n'existe plus dans le graphe rendu.
    if (person.entityId && !entityIds.has(person.entityId)) {
      const entity = current.entities.find(candidate => candidate.id === person.entityId)
      if (entity) {
        entities.push(entity)
        entityIds.add(entity.id)
      }
    }
  }

  return { orgGraph: { ...incoming, entities, people }, diff }
}
