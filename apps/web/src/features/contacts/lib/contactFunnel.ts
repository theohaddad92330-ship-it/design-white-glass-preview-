import { computeContactLifecycleState, type ContactLifecycleState, type ContactLifecycleTally } from '@bellum/contracts'

/**
 * Le funnel de qualification demandé p46 du rapport TF1 :
 * « 214 détectés → 146 vérifiés → 82 compatibles → 30 classés → 9 prioritaires ».
 *
 * Les 7 états du cycle de vie sont EXCLUSIFS côté serveur (un contact tombe dans
 * un seul bucket) alors que le funnel est CUMULATIF : un contact actionnable a
 * forcément franchi « détecté » puis « identité vérifiée »… On reconstruit donc
 * chaque étape comme « tous ceux qui ont atteint AU MOINS cet état ».
 *
 * Les deux états terminaux (`historique` ex-employé, `rejete` écarté) ne sont pas
 * des étapes du funnel : ils en sortent. Ils sont comptés à part (`discarded`)
 * plutôt que noyés dans la 1re étape — sinon le funnel afficherait comme
 * « détectés » des contacts qu'on a justement décidé de ne plus travailler.
 */
const FUNNEL_STAGES = ['detecte', 'identite_verifiee', 'qualifie', 'enrichi', 'actionnable'] as const

/**
 * #2309.1 (clôture #2934) — les DEUX étapes terminales, nommées à part du
 * funnel cumulatif ci-dessus (raison inchangée : un ex-employé ou un profil
 * écarté n'a pas « franchi » les 5 étapes qui précèdent, le compter dedans
 * ferait mentir la 1re étape). Avec les 5 `FUNNEL_STAGES`, elles font les 7
 * états NOMMÉS que #2309.1 demande — chacun avec sa couverture (#2309.6) et
 * son coût (#2309.8), aucun classement neuf : les mêmes 7 compteurs du tally
 * serveur, déjà là.
 */
const EXIT_STATES = ['historique', 'rejete'] as const

/**
 * #2309.8 — le seul geste PAYANT de ce funnel est de révéler une coordonnée
 * (`CREDIT_WEIGHTS.contact_enrichment`, `@bellum/contracts`). Recherche,
 * vérification d'identité, qualification et préparation de message ne
 * débitent rien — `'free'` est un FAIT réel, jamais un coût non mesuré rendu
 * à zéro.
 */
type ContactFunnelStageCost = 'free' | 'perContact'

type ContactFunnelStage = {
  key: (typeof FUNNEL_STAGES)[number]
  /** Contacts ayant atteint AU MOINS cet état. */
  count: number
  /** Part du total (0-1) — largeur de la barre, et #2309.6 (couverture). 0 quand le total est nul. */
  share: number
  cost: ContactFunnelStageCost
}

/** Une étape terminale (#2309.1) : PAS cumulative — un compte ABSOLU du tally,
 *  jamais « au moins atteint », puisqu'on en sort plutôt qu'on n'y progresse. */
type ContactFunnelExitBranch = {
  key: (typeof EXIT_STATES)[number]
  count: number
  /** Part de la POPULATION COMPLÈTE (funnel + branches de sortie) — distincte
   *  du `share` cumulatif ci-dessus, qui rapporte au total du funnel seul. */
  share: number
  cost: ContactFunnelStageCost
}

type ContactFunnel = {
  total: number
  /** États terminaux : ex-employés + contacts écartés. Hors funnel.
   *  Somme de `exitBranches` — gardée pour l'en-tête existant (GA-26 : la
   *  garder ADDITIVE plutôt que la retirer sous les pieds de son seul appelant). */
  discarded: number
  stages: ContactFunnelStage[]
  /** #2309.1 — les DEUX étapes terminales nommées séparément, voir `EXIT_STATES`. */
  exitBranches: ContactFunnelExitBranch[]
}

/**
 * Reconstruit le funnel depuis l'agrégat serveur. `undefined` (agrégat non
 * calculé — pages > 1, snapshot d'avant le champ) ⇒ `null` : on préfère ne rien
 * afficher qu'un funnel faux.
 */
export function buildContactFunnel(tally: ContactLifecycleTally | undefined): ContactFunnel | null {
  if (!tally) return null

  const total = FUNNEL_STAGES.reduce((sum, key) => sum + tally[key], 0)
  let reached = total
  const stages = FUNNEL_STAGES.map(key => {
    const count = reached
    reached -= tally[key]
    const cost: ContactFunnelStageCost = key === 'enrichi' ? 'perContact' : 'free'
    return { key, count, share: total > 0 ? count / total : 0, cost }
  })

  const discarded = tally.historique + tally.rejete
  const fullPopulation = total + discarded
  const exitBranches = EXIT_STATES.map(key => ({
    key,
    count: tally[key],
    share: fullPopulation > 0 ? tally[key] / fullPopulation : 0,
    cost: 'free' as const,
  }))

  return { total, discarded, stages, exitBranches }
}

/** Ce qu'il faut d'un contact pour le situer dans le cycle de vie — forme
 *  structurelle, pour accepter aussi bien un `Contact` de dossier qu'une ligne
 *  de liste sans avoir à convertir. */
type ContactLifecycleRow = {
  lifecycle_state?: ContactLifecycleState | null
  full_name?: string | null
  title?: string | null
  entity?: string | null
  decision_role?: string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
}

/**
 * Agrège une LISTE COMPLÈTE de contacts en tally par état.
 *
 * Réservé au périmètre d'UN dossier, où `GET /contacts/account/:id` renvoie
 * TOUS les contacts du compte : le dénominateur est donc exact. La page globale
 * `/contacts` est paginée (25/page) — elle continue de lire l'agrégat serveur,
 * sinon le funnel annoncerait « 25 détectés » sur un stock de 210.
 *
 * Même règle que le serveur (`LIFECYCLE_STATE_SQL`) : l'état persisté fait foi,
 * et on retombe sur le calcul canonique quand il manque — jamais un état perdu.
 */
export function tallyContactLifecycle(contacts: readonly ContactLifecycleRow[]): ContactLifecycleTally {
  const tally: ContactLifecycleTally = {
    detecte: 0,
    identite_verifiee: 0,
    qualifie: 0,
    enrichi: 0,
    actionnable: 0,
    historique: 0,
    rejete: 0,
  }
  for (const contact of contacts) {
    const state =
      contact.lifecycle_state ??
      computeContactLifecycleState({
        fullName: contact.full_name,
        title: contact.title,
        entity: contact.entity,
        role: contact.decision_role,
        email: contact.email,
        phone: contact.phone,
        linkedinUrl: contact.linkedin_url,
      })
    if (state in tally) tally[state] += 1
  }
  return tally
}

/**
 * #4099 (recette prod 13/10, Sanofi) — le nombre de contacts PERTINENTS (qualifiés ou au-delà : la
 * même étape cumulative que « pertinents » de l'entonnoir) — jamais le total des contacts du compte,
 * qui compte aussi les simples personnes repérées dans les sources. `null` quand aucun n'est
 * pertinent : une valeur absente ne s'affiche jamais « 0 ».
 */
export function countRelevantContacts(contacts: readonly ContactLifecycleRow[]): number | null {
  const funnel = buildContactFunnel(tallyContactLifecycle(contacts))
  const relevant = funnel?.stages.find(stage => stage.key === 'qualifie')?.count
  return relevant !== undefined && relevant > 0 ? relevant : null
}
