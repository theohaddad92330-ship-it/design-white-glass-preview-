import type {
  AccountPropagation,
  AccountRevenuePropagation,
  ConsultantMarginPropagation,
  ConsultantPropagation,
  ContactPropagation,
} from '@bellum/contracts'
import {
  accountPropagationById,
  accountRevenueById,
  consultantMarginById,
  consultantPropagationById,
  contactPropagationById,
  useFinanceAccess,
  usePropagationDigest,
} from './api'

/**
 * CE QUE CHAQUE ÉCRAN DEMANDE, ET RIEN DE PLUS.
 *
 * Un hook par écran plutôt qu'un objet passé de composant en composant, pour une
 * raison précise et vérifiable : **l'entête d'un tableau et ses cellules vivent
 * dans deux fichiers différents** (`AccountsTableHeaderRow.tsx` et
 * `AccountTableRow.tsx`). Leur faire porter la même décision par un `prop` la
 * confierait à deux appelants ; leur faire lire le MÊME hook la rend
 * structurellement unique (GA-26).
 *
 * ⚠️ Ce n'est pas de la coquetterie : GA-29 compte les colonnes masquées entête
 * par entête et cellule par cellule **dans un même fichier**, et passe donc à
 * côté de ce dossier-ci (`if (!hasHeads || !hasCells) continue`). Un décalage de
 * colonne ne casse rien, ne lève rien, et se lit parfaitement bien — c'est ce
 * qui le rend dangereux. La seule protection qui tienne ici est qu'il n'y ait
 * qu'une source à la décision.
 *
 * ⚠️ Un appel par ligne ? Non : les deux requêtes portent une clé de cache
 * d'ESPACE (`propagationKeys`), donc vingt-cinq lignes qui appellent le même
 * hook produisent UNE requête réseau et vingt-cinq abonnements au même cache.
 * C'est ce que le contrôleur demande en toutes lettres.
 */

/* ── Le portefeuille et le dossier de compte ──────────────────────────────── */

export type AccountRevenueColumn = {
  /**
   * La colonne existe-t-elle ?
   *
   * `false` uniquement sur un REFUS de droit (403). Une colonne d'argent vide
   * sur toute sa hauteur, chez quelqu'un qui n'aura jamais le droit d'y lire
   * quoi que ce soit, n'est pas une information — c'est une case à cocher
   * mentale de plus sur chaque ligne.
   *
   * ⚠️ Une PANNE de lecture ne la fait pas disparaître : « cassé » et « pas ton
   * périmètre » se ressemblent trop pour qu'on les confonde, et une colonne qui
   * s'évapore au premier réseau instable se lit « la fonction a été retirée ».
   */
  visible: boolean
  /** La lecture a échoué — dit, jamais confondu avec « rien à facturer ». */
  failed: boolean
  /** `false` sous `finance:read:own` : l'absence d'une ligne devient ambiguë
   *  (aucun mois facturé, OU compte hors du portefeuille de l'appelant), et
   *  l'écran doit le DIRE plutôt que de trancher à la place du lecteur. */
  canReadFinance: boolean
  byAccount: Map<string, AccountRevenuePropagation>
}

export function useAccountRevenueColumn(): AccountRevenueColumn {
  const { digest, denied, failed, canReadFinance } = useFinanceAccess()
  return { visible: !denied, failed, canReadFinance, byAccount: accountRevenueById(digest) }
}

/** Le tarif vendu moyen — ouvert, comme tout prix de VENTE. */
export function useAccountRate(accountId: string | undefined): AccountPropagation | undefined {
  const { data } = usePropagationDigest()
  if (!accountId) return undefined
  return accountPropagationById(data).get(accountId)
}

export function useAccountRevenue(accountId: string | undefined): {
  revenue: AccountRevenuePropagation | undefined
  denied: boolean
  failed: boolean
  canReadFinance: boolean
} {
  const { digest, denied, failed, canReadFinance } = useFinanceAccess()
  return {
    revenue: accountId ? accountRevenueById(digest).get(accountId) : undefined,
    denied,
    failed,
    canReadFinance,
  }
}

/* ── Les contacts ─────────────────────────────────────────────────────────── */

/**
 * « Ce contact a signé N missions » — ou rien du tout.
 *
 * ⚠️ Le serveur ne rend AUCUNE ligne pour un contact qui n'a rien signé, et
 * `signedMissions` est `positive()`. `undefined` veut donc dire « ce contact
 * n'a rien signé », ce qui est exactement ce qu'un badge ne doit PAS écrire :
 * « a signé 0 mission » se lit comme une mesure alors que c'est l'absence de
 * mesure — et surtout, un prospect ressemblerait alors à un client déçu.
 */
export function useContactSignedMissions(contactId: string | undefined): ContactPropagation | undefined {
  const { data } = usePropagationDigest()
  if (!contactId) return undefined
  return contactPropagationById(data).get(contactId)
}

export function useContactSignedMissionsIndex(): Map<string, ContactPropagation> {
  const { data } = usePropagationDigest()
  return contactPropagationById(data)
}

/* ── Le vivier et la fiche d'un consultant ────────────────────────────────── */

/**
 * « Placé N fois » — des PLACEMENTS, jamais des positionnements.
 *
 * Le vivier affichait déjà « N positionnements en cours sur M » : une
 * proposition ENVOYÉE à un client. Un placement est une mission qui a DÉMARRÉ.
 * Les deux comptent des choses différentes, et c'est leur ÉCART qui intéresse un
 * recruteur — quelqu'un qu'on présente beaucoup et qu'on place peu est
 * exactement la personne à repérer. D'où deux compteurs côte à côte, et jamais
 * un seul qui prétendrait dire les deux.
 */
export function useConsultantPlacementsIndex(): Map<string, ConsultantPropagation> {
  const { data } = usePropagationDigest()
  return consultantPropagationById(data)
}

export function useConsultantMargin(consultantId: string | undefined): {
  margin: ConsultantMarginPropagation | undefined
  denied: boolean
  failed: boolean
  canReadFinance: boolean
} {
  const { digest, denied, failed, canReadFinance } = useFinanceAccess()
  return {
    margin: consultantId ? consultantMarginById(digest).get(consultantId) : undefined,
    denied,
    failed,
    canReadFinance,
  }
}
