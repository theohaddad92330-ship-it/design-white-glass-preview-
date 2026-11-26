import { RECOMMENDED_PATH_MAX, type Contact, type OrgGraph } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { contactDeparture } from '@/features/contacts/lib/contactDeparture'
import { comparePriority } from '@/features/contacts/lib/contactPriority'
import { getOrganigrammeRoleWeight } from '@/lib/contactRoles'

/**
 * Le chemin d'approche affiché en tête de l'onglet Organigramme.
 *
 * Il était calculé ICI, par poids de rôle décisionnel — un tri qui place le
 * sponsor en premier et ignore tout le reste. Résultat : sur un compte froid, la
 * gouvernance pouvait être recommandée en première approche, exactement ce que le
 * garde-fou DoD interdit… alors que ce garde-fou tourne côté serveur et ne
 * protégeait qu'une section plus bas dans la même page.
 *
 * On préfère donc le chemin CALCULÉ PAR LE SERVEUR quand il existe : il porte le
 * garde-fou board, l'exclusion des rejetés et des ex-employés, et l'ordre du
 * comité d'achat. Rien n'est dupliqué côté web — reclasser les contacts ici
 * demanderait de réimplémenter le classifieur de niveau hiérarchique, et deux
 * implémentations d'une même règle finissent toujours par diverger.
 *
 * Sans graphe (dossier ancien, analyse partielle), on retombe sur l'ancien tri :
 * une heuristique imparfaite reste préférable à une section vide.
 */
export function getRecommendedPath(contacts: Contact[], serverPath?: ReadonlyArray<{ personId: string }>) {
  const byServerPath = resolveServerPath(contacts, serverPath)
  if (byServerPath) return byServerPath

  return [...contacts]
    .sort(
      (a, b) =>
        getOrganigrammeRoleWeight(b.decision_role) - getOrganigrammeRoleWeight(a.decision_role) ||
        // Rank 1 = highest priority, so the tie-break is ASCENDING.
        comparePriority(a.priority, b.priority),
    )
    .slice(0, RECOMMENDED_PATH_MAX)
}

/** Les contacts du chemin serveur, dans SON ordre. `null` dès qu'on ne sait pas
 *  le reconstituer — mieux vaut l'ancien tri qu'un chemin tronqué au hasard. */
function resolveServerPath(contacts: Contact[], serverPath?: ReadonlyArray<{ personId: string }>): Contact[] | null {
  if (!serverPath?.length) return null
  // Les ids du graphe sont synthétisés depuis le nom (`p-{slug}`) : on rapproche
  // sur cette même normalisation, seule clé commune entre les deux mondes.
  const byId = new Map(contacts.map(contact => [orgPersonSlug(contact.full_name), contact]))
  const resolved = serverPath.flatMap(step => {
    const contact = byId.get(step.personId)
    return contact ? [contact] : []
  })
  return resolved.length > 0 ? resolved.slice(0, RECOMMENDED_PATH_MAX) : null
}

/** Slug d'identifiant personne de l'assembleur IA (`p-{slug}`). Il vit dans
 *  `@bellum/utils` depuis que le jeu de données de démonstration en dépend lui
 *  aussi : trois copies d'une même normalisation finiraient par diverger, et une
 *  divergence d'un caractère efface les traits de la carte en silence.
 *  Ré-exporté ici pour ne pas casser les imports existants de l'onglet. */
export { orgPersonSlug }

/**
 * L'index nom → contact pour le rapprochement carte de l'organigramme → fiche
 * contact réelle, et son repli tolérant à l'ordre prénom/nom et aux accents.
 *
 * #3019 (retour bêta, ré-échoué en recette écran le 25/09/2026 sur CAPGEMINI —
 * « Bernd Wachter ») — la clé EXACTE (`orgPersonSlug`) suppose que le graphe et
 * la fiche contact portent le nom dans le MÊME ordre et avec le MÊME jeu de
 * caractères. Ce n'est pas toujours vrai : un registre légal (Pappers) assemble
 * « NOM Prénom », une page équipe écrit « Prénom Nom » ; le nom du graphe est
 * figé au moment de l'analyse, celui du contact peut avoir été corrigé depuis
 * (accent restauré, casse corrigée). Deux sources d'un même humain peuvent donc
 * ne plus partager le même slug exact — et la carte retombait en lecture seule
 * alors que le contact existe VRAIMENT.
 *
 * La clé EXACTE reste PRINCIPALE : elle seule alimentait déjà #3019 v1 et ne
 * peut jamais rapprocher deux personnes différentes. Le repli ne joue qu'en son
 * absence, sur les jetons du nom triés (insensible à l'ordre) et débarrassés de
 * leurs diacritiques (insensible aux accents) — et seulement s'il désigne UN
 * SEUL contact du dossier : une ambiguïté ne rapproche personne plutôt que de
 * deviner (même doctrine que `pickRicherName`, `contact-identity.ts`, API).
 */
export function buildContactSlugIndex(contacts: Contact[]): ContactSlugIndex {
  const bySlug = new Map<string, Contact>()
  const looseCandidates = new Map<string, Contact | null>()
  for (const contact of contacts) {
    bySlug.set(orgPersonSlug(contact.full_name), contact)
    const loose = looseNameKey(contact.full_name)
    if (!loose) continue
    // Une deuxième fiche sur la même clé souple rend cette clé ambiguë — `null`
    // la marque comme « ne jamais deviner », sans effacer la fiche EXACTE.
    looseCandidates.set(loose, looseCandidates.has(loose) ? null : contact)
  }
  return { bySlug, looseCandidates }
}

export type ContactSlugIndex = {
  bySlug: ReadonlyMap<string, Contact>
  looseCandidates: ReadonlyMap<string, Contact | null>
}

/** Le contact réel derrière une carte de l'organigramme, ou `undefined` — jamais un identifiant inventé. */
export function resolveGraphPersonContact(
  index: ContactSlugIndex,
  person: { id: string; fullName: string },
): Contact | undefined {
  const exact = index.bySlug.get(person.id)
  if (exact) return exact
  const loose = looseNameKey(person.fullName)
  if (!loose) return undefined
  return index.looseCandidates.get(loose) ?? undefined
}

/** #4056.1 — la superposition CRM d'une personne du graphe. */
export type CrmMatchStatus = 'known' | 'uncertain' | 'notFound'

/**
 * #4056.1 — où en est cette personne du graphe côté CRM : retrouvée (`known`), détectée mais
 * absente du CRM (`notFound`), ou plusieurs fiches candidates pour le même nom (`uncertain`).
 * Le rapprochement incertain n'est JAMAIS résolu ici (aucune fiche choisie, aucune fusion) :
 * c'est le commercial qui tranche, depuis l'onglet Contacts. Nom vide ⇒ `null` : rien à dire.
 */
export function classifyCrmMatch(
  index: ContactSlugIndex,
  person: { id: string; fullName: string },
): CrmMatchStatus | null {
  if (index.bySlug.has(person.id)) return 'known'
  const loose = looseNameKey(person.fullName)
  if (!loose) return null
  if (!index.looseCandidates.has(loose)) return 'notFound'
  return index.looseCandidates.get(loose) ? 'known' : 'uncertain'
}

/**
 * #3742 / #3744 (reste) — la carte d'influence et l'organigramme
 * (`FocalOrgView`, issus de `raw_analysis.org.orgGraph`) n'étaient pas
 * refiltrés par pays : le filtre géographique (`isOutsideGeoPerimeter`,
 * `excludeOutsideGeoPerimeter`) écarte le CONTACT en base, mais le graphe,
 * lui, continuait de dessiner la personne comme carte de décision.
 *
 * Même rapprochement que {@link resolveGraphPersonContact} (nom exact puis
 * repli tolérant) : une personne du graphe dont le contact correspondant
 * porte `excluded_at` sort de la carte, avec tout ce qui la cite — arête
 * hiérarchique, lien d'influence, lien relationnel, siège au comité d'achat,
 * étape du chemin recommandé. Sans ce nettoyage, une arête pendante vers une
 * personne retirée planterait la lecture du graphe en aval.
 *
 * Le graphe STOCKÉ n'est jamais modifié ici : ce n'est qu'une projection de
 * lecture, réversible comme l'exclusion elle-même (`restoreContact` fait
 * réapparaître la personne au rendu suivant). Aucun contact écarté ne
 * correspond à une personne du graphe ⇒ rend le graphe TEL QUEL (même
 * référence) — un dossier sans exclusion reste byte-identique à avant ce
 * point.
 */
export function filterOrgGraphByExcludedContacts(graph: OrgGraph, contacts: readonly Contact[]): OrgGraph {
  const excludedContacts = contacts.filter(contact => contact.excluded_at)
  if (excludedContacts.length === 0) return graph
  const index = buildContactSlugIndex(excludedContacts)
  const excludedPersonIds = new Set(
    graph.people.filter(person => resolveGraphPersonContact(index, person)).map(person => person.id),
  )
  if (excludedPersonIds.size === 0) return graph

  const kept = (id: string) => !excludedPersonIds.has(id)

  return {
    ...graph,
    people: graph.people.filter(person => kept(person.id)),
    hierarchyEdges: graph.hierarchyEdges.filter(edge => kept(edge.fromId) && kept(edge.toId)),
    influenceEdges: graph.influenceEdges.filter(edge => kept(edge.fromId) && kept(edge.toId)),
    relationalEdges: graph.relationalEdges.filter(edge => kept(edge.fromId) && kept(edge.toId)),
    buyingCommittee: graph.buyingCommittee.filter(member => kept(member.personId)),
    recommendedPath: graph.recommendedPath.filter(stepEntry => kept(stepEntry.personId)),
  }
}

/** Jetons du nom, en minuscules et sans diacritiques, triés — la clé de repli
 *  qui ignore l'ordre prénom/nom ET les accents. `null` sur un nom vide : rien
 *  à rapprocher. */
function looseNameKey(fullName: string | null | undefined): string | null {
  const tokens = (fullName ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
  return tokens.length > 0 ? tokens.join(' ') : null
}

export function getClassifiedContactsCount(contacts: Contact[]) {
  return contacts.filter(contact => contact.decision_role && contact.decision_role !== 'unknown').length
}

/**
 * Les contacts qui ont leur place dans l'organigramme COURANT.
 *
 * Un ex-employé (`historique`) et un contact écarté (`rejete`) sont des états
 * terminaux du cycle de vie : l'annexe (p15/p25) les envoie en « vue réseau /
 * capteur » et interdit explicitement de les montrer comme membres de l'org
 * actuelle. Ils étaient pourtant dessinés comme n'importe quel autre nœud, photo
 * et badge de rôle compris — un commercial pouvait appeler quelqu'un qui a quitté
 * l'entreprise en croyant lire l'organigramme du compte.
 *
 * Ils restent visibles sur l'onglet Contacts, avec leur badge d'état : on les
 * retire de la carte, on ne les efface pas du dossier. Un état non renseigné
 * (dossiers antérieurs au calcul serveur) reste affiché — on ne masque un contact
 * que sur une donnée réelle.
 */
export function getCurrentOrgContacts(contacts: Contact[], accountName?: string | null): Contact[] {
  return contacts.filter(
    contact =>
      contact.lifecycle_state !== 'historique' &&
      contact.lifecycle_state !== 'rejete' &&
      // #4465.2 — un départ déduit du parcours sort du décompte des personnes en poste (il reste dans le dossier).
      contactDeparture(contact, accountName) === null,
  )
}
