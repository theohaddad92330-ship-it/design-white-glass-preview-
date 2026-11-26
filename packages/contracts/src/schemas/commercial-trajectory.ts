import type { DecisionRole } from './contact.js'

/**
 * #3402 — LA CARTE D'INFLUENCE DEVIENT DES TRAJECTOIRES COMMERCIALES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR DEMANDE, ET CE QUI EXISTAIT DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Faire évoluer la Carte d'influence pour afficher des trajectoires
 * commerciales et non un faux organigramme officiel » (#3402). L'onglet
 * Organigramme porte déjà UNE séquence d'approche calculée
 * (`recomputeRecommendedPath`, `apps/api/.../org-graph-path.ts`), rendue par
 * `RecommendedPathCard.tsx` avec son point de départ (`computePathOrigin`,
 * direct/à un saut/froid), ses étapes ordonnées et l'avertissement de
 * péremption — la preuve : `RecommendedPathCard.tsx:74-125`. Ce que cette
 * séquence UNIQUE ne fait pas, c'est distinguer les QUATRE trajectoires du
 * retour : elle mélange les rôles dans un seul ordre, jamais quatre chemins
 * nommés qu'un commercial pourrait choisir entre eux.
 *
 * Ce module comble CE manque-là, et rien d'autre : il RE-GROUPE des contacts
 * déjà classés (`Contact.decision_role`, déjà réel, déjà corrigible — voir le
 * tiroir de correction de l'organigramme, `DeclareOrgPanel.tsx` /
 * `OrgCorrectionsHistory.tsx`) en quatre trajectoires nommées. Il ne
 * RÉIMPLÉMENTE PAS le classifieur de niveau hiérarchique : `decision_role` est
 * un champ déjà écrit par le serveur, ce module ne fait que le LIRE et le
 * BUCKETER — exactement ce que `getClassifiedContactsCount`/`RoleLegendCard`
 * font déjà pour compter, ici pour grouper (même principe, GA-26 respecté :
 * aucune dérivation dupliquée).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE TRAJECTOIRE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Point de départ et étapes = les contacts eux-mêmes, triés par la PRIORITÉ
 * déjà connue (`Contact.priority`, 1 = la plus haute) — jamais un ordre
 * inventé. Rôle attendu = `decision_role`, déjà porté par chaque étape.
 * Preuves = le rôle et le titre déjà connus (aucune preuve nouvelle
 * fabriquée). Confiance = absente de ce module : `Contact` ne porte pas de
 * confiance de RÔLE calculée à ce niveau — l'inventer serait un chiffre sans
 * appui (doctrine). Risque = nommé seulement quand un fait le justifie : une
 * trajectoire qui ne repose que sur UNE SEULE personne (`single_contact`),
 * jamais un risque générique. Résultat recherché et condition de bascule =
 * une méthode FIXE par trajectoire (i18n, `accountOrg.trajectories.*`),
 * jamais une phrase par compte — même principe que `ROLE_OBJECTIVES`
 * (`org-graph-path.ts`, côté serveur) pour la séquence unique existante.
 *
 * Distinction lien prouvé / influence probable / chemin recommandé (#3402.9) :
 * une trajectoire EST un chemin commercial recommandé par construction (une
 * méthode, jamais un fait sourcé) — elle ne prétend à aucun lien hiérarchique.
 * Ne pas inventer de liens hiérarchiques (#3402.8) : aucune position, aucun
 * rattachement n'est lu ici, seulement le rôle déjà déclaré.
 */
export const COMMERCIAL_TRAJECTORY_KINDS = ['top', 'field', 'middle_manager', 'parallel'] as const
export type CommercialTrajectoryKind = (typeof COMMERCIAL_TRAJECTORY_KINDS)[number]

/** Les seuls champs de `Contact` que ce module lit — jamais la fiche entière,
 *  pour que la fonction reste testable sans construire un `Contact` complet. */
export type TrajectoryContact = {
  id: string
  full_name: string
  title: string | null
  decision_role: DecisionRole | null
  priority: number
}

export type CommercialTrajectoryStep = {
  contactId: string
  fullName: string
  title: string | null
  role: DecisionRole
  priority: number
}

export type CommercialTrajectoryRisk = 'single_contact'

export type CommercialTrajectory = {
  kind: CommercialTrajectoryKind
  steps: readonly CommercialTrajectoryStep[]
  /** `null` quand rien ne justifie d'en nommer un — jamais un risque générique. */
  risk: CommercialTrajectoryRisk | null
}

/**
 * Les rôles qui alimentent `top` et `field` — `middle_manager` s'en déduit
 * (tout le reste des rôles CONNUS), et `parallel` des deux premiers combinés.
 *
 * `sponsor`/`operational`/`purchasing` (legacy, « no longer emitted » —
 * `contact.ts`) restent lus ici : un contact classé AVANT le vocabulaire
 * actuel ne doit pas disparaître d'une trajectoire parce que le libellé a
 * changé de nom.
 */
const TOP_ROLES: ReadonlySet<DecisionRole> = new Set(['economic', 'sponsor'])
const FIELD_ROLES: ReadonlySet<DecisionRole> = new Set(['user', 'champion', 'operational'])
const MIDDLE_MANAGER_ROLES: ReadonlySet<DecisionRole> = new Set(['technical', 'influencer'])

function bySortedPriority(contacts: readonly TrajectoryContact[]): CommercialTrajectoryStep[] {
  return [...contacts]
    .sort((a, b) => a.priority - b.priority || a.full_name.localeCompare(b.full_name, 'fr'))
    .map(contact => ({
      contactId: contact.id,
      fullName: contact.full_name,
      title: contact.title,
      // Non-null : seuls des contacts dont le rôle matche un des ensembles
      // ci-dessus atteignent cette fonction (voir `computeCommercialTrajectories`).
      role: contact.decision_role as DecisionRole,
      priority: contact.priority,
    }))
}

function riskOf(steps: readonly CommercialTrajectoryStep[]): CommercialTrajectoryRisk | null {
  return steps.length === 1 ? 'single_contact' : null
}

/**
 * #3402.1-.5 — REGROUPE des contacts déjà classés en quatre trajectoires
 * nommées. Une trajectoire SANS contact n'apparaît PAS (doctrine « on
 * n'affiche pas ce qu'on n'a pas ») : jamais une ligne vide ni un risque
 * inventé pour la justifier.
 */
export function computeCommercialTrajectories(contacts: readonly TrajectoryContact[]): CommercialTrajectory[] {
  const topContacts = contacts.filter(c => c.decision_role && TOP_ROLES.has(c.decision_role))
  const fieldContacts = contacts.filter(c => c.decision_role && FIELD_ROLES.has(c.decision_role))
  const middleManagerContacts = contacts.filter(c => c.decision_role && MIDDLE_MANAGER_ROLES.has(c.decision_role))

  const trajectories: CommercialTrajectory[] = []

  if (topContacts.length > 0) {
    const steps = bySortedPriority(topContacts)
    trajectories.push({ kind: 'top', steps, risk: riskOf(steps) })
  }
  if (fieldContacts.length > 0) {
    const steps = bySortedPriority(fieldContacts)
    trajectories.push({ kind: 'field', steps, risk: riskOf(steps) })
  }
  if (middleManagerContacts.length > 0) {
    const steps = bySortedPriority(middleManagerContacts)
    trajectories.push({ kind: 'middle_manager', steps, risk: riskOf(steps) })
  }
  // #3402.5 — EN PARALLÈLE : un relais opérationnel ET un sponsor, EN MÊME
  // TEMPS. Les deux trajectoires précédentes restent distinctes (un
  // commercial peut vouloir jouer SEULEMENT le terrain) ; celle-ci les
  // combine pour la lecture « joue les deux de front ».
  if (topContacts.length > 0 && fieldContacts.length > 0) {
    const steps = bySortedPriority([...topContacts, ...fieldContacts])
    trajectories.push({ kind: 'parallel', steps, risk: riskOf(steps) })
  }

  return trajectories
}
