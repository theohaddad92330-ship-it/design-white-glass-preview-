import { hasPermission, type WorkspacePermission, type WorkspaceRole } from '@bellum/contracts'

/**
 * Ce qu'un rôle a le droit de VOIR sur une fiche talent (PDF 3 §13.1).
 *
 * Deux axes qui n'ont rien à voir l'un avec l'autre, et c'est pour ça qu'ils
 * sont séparés :
 *
 *  - les **coordonnées** (email, téléphone, profil public) sont masquables par
 *    RÉGLAGE d'espace, pas par rôle universel. Certaines ESN laissent leurs
 *    commerciaux appeler un consultant en direct, d'autres passent toujours par
 *    le recrutement. C'est une politique d'entreprise, pas une règle produit —
 *    d'où le défaut à « visible », qui ne change rien aux espaces existants ;
 *  - les **montants** (TJM minimum, coût chargé, TJM d'achat) suivent la
 *    permission `finance:read`, comme la marge d'une mission. Là c'est une règle
 *    produit : savoir ce qu'une personne coûte n'est pas le métier de tout le
 *    monde.
 *
 * Pur et sans dépendance NestJS : c'est la fonction qui décide ce qui sort de
 * l'API, elle doit se tester sans base.
 */

type TalentVisibilityInput = {
  role: WorkspaceRole
  /** Permissions additives accordées au MEMBRE, au-delà de son rôle. */
  extraPermissions?: readonly WorkspacePermission[]
  /** Le réglage d'espace `hide_talent_contacts_from_sales`. */
  hideContactsFromSales: boolean
}

type TalentVisibilityDecision = { contacts: boolean; finance: boolean }

/**
 * Les rôles qui gardent les coordonnées MÊME quand l'espace les cloisonne.
 *
 * `recruiter` parce que c'est son métier, `owner` et `admin` parce qu'un
 * réglage d'espace ne doit jamais empêcher celui qui l'a posé de vérifier ce
 * qu'il a fait — sinon la seule façon de contrôler la donnée serait de
 * décocher.
 */
const CONTACTS_ALWAYS: readonly WorkspaceRole[] = ['owner', 'admin', 'recruiter']

export function talentVisibility(input: TalentVisibilityInput): TalentVisibilityDecision {
  const finance = hasPermission(input.role, 'finance:read') || (input.extraPermissions ?? []).includes('finance:read')
  const contacts = !input.hideContactsFromSales || CONTACTS_ALWAYS.includes(input.role)
  return { contacts, finance }
}
