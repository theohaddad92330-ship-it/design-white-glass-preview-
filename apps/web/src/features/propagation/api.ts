import type {
  AccountPropagation,
  AccountRevenuePropagation,
  ConsultantMarginPropagation,
  ConsultantPropagation,
  ContactPropagation,
} from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/lib/api'

/**
 * LES BLOCS PROPAGÉS, CÔTÉ ÉCRAN (PDF 2 du dossier du 26/08, §4.2 et §4.4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq agrégats sont calculés et servis depuis le 28/08 (`propagation.service.ts`,
 * `GET /delivery/propagation` et `GET /delivery/finance/propagation`). Personne
 * ne les affichait : « du code juste, calculé, testé, que personne n'appelle » —
 * le motif qui revient dans tous les chantiers de ce dépôt.
 *
 * Ils s'affichent sur TROIS écrans qui n'ont rien à voir entre eux : le
 * portefeuille et le dossier de compte, la liste des contacts, le vivier et la
 * fiche d'un consultant. Mettre l'appel dans l'un des trois et l'importer depuis
 * les deux autres poserait une dépendance qui ne veut rien dire (pourquoi le
 * vivier lirait-il le module « comptes » ?), et le recopier trois fois donnerait
 * trois clés de cache, trois formes de repli et trois façons de dire « pas ton
 * périmètre ». Un réglage vit à UN seul endroit (GA-26) — donc ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ DEUX ROUTES, DEUX DROITS — ET TROIS RÉPONSES POSSIBLES, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/propagation` est une lecture d'espace (`@WorkspaceRead`) : tout
 * le monde la reçoit. Elle porte ce qui n'est PAS un montant gardé — le tarif
 * vendu moyen y compris, parce que le prix de VENTE est visible par design.
 *
 * `GET /delivery/finance/propagation` exige `finance:read` OU `finance:read:own`.
 * D'où trois issues, et non deux :
 *
 *  1. **403** — le rôle n'a AUCUN droit financier (`tech_admin`, `member`,
 *     `recruiter`, `viewer` : `ROLE_PERMISSIONS` ne leur en donne pas). Rien
 *     n'arrive, et c'est {@link useFinancePropagation} qui doit le DIRE.
 *     ⚠️ Le cas n'est pas théorique : `recruiter` est précisément le rôle qui
 *     ouvre le vivier et la fiche d'un consultant.
 *  2. **200, `canReadFinance: false`** — l'appelant a `finance:read:own`. Il voit
 *     le CA de SON portefeuille ; la marge par consultant, elle, décrit l'ÉQUIPE
 *     et reste rédigée (`marginPercent: null`, clé PRÉSENTE et vide — D45).
 *  3. **200, `canReadFinance: true`** — tout est lisible.
 *
 * Sans ce découpage, un `marginPercent: null` se lit indifféremment « tu n'as
 * pas ce droit » et « le coût chargé n'est pas renseigné » : deux phrases qui
 * font chercher la panne à deux endroits opposés. C'est le défaut que D45 a
 * corrigé côté serveur en faisant voyager `canReadFinance` avec la réponse ; le
 * perdre côté écran le réintroduirait entier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ON NE RECALCULE RIEN ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas de somme, pas de moyenne, pas de « CA estimé = TJM × durée ». Ce module
 * fait exactement deux choses : appeler, et INDEXER par identifiant pour qu'une
 * fiche trouve sa ligne en O(1). Un calcul écrit ici serait la seconde vérité
 * que le §4.4 existe pour empêcher — et il divergerait, parce que rien ne le
 * relierait à la requête SQL qui produit l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UNE SEULE RÉPONSE POUR TOUT L'ESPACE, JAMAIS UN APPEL PAR FICHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux routes rendent des LISTES d'espace, et les deux hooks n'en gardent
 * qu'une copie en cache. La colonne du portefeuille lit la même réponse que le
 * bandeau d'une fiche : à trois cents comptes, un appel par ligne rendrait la
 * liste inutilisable. C'est le parti pris explicite du contrôleur.
 */

/** Ce que rend `GET /delivery/propagation` — sans aucun montant gardé. */
type PropagationDigest = {
  accounts: AccountPropagation[]
  contacts: ContactPropagation[]
  consultants: ConsultantPropagation[]
}

/** Ce que rend `GET /delivery/finance/propagation`, DROIT COMPRIS. */
type FinancePropagationDigest = {
  accounts: AccountRevenuePropagation[]
  consultants: ConsultantMarginPropagation[]
  /** ⚠️ Ne dit PAS « la réponse est arrivée » : il dit « la marge d'équipe est
   *  lisible ». Un `finance:read:own` reçoit `false` et voit quand même son CA. */
  canReadFinance: boolean
}

export const propagationKeys = {
  digest: () => ['propagation'] as const,
  finance: () => ['propagation', 'finance'] as const,
}

export const propagationApi = {
  digest(): Promise<PropagationDigest> {
    return apiFetch<PropagationDigest>({ path: '/delivery/propagation' })
  },
  finance(): Promise<FinancePropagationDigest> {
    return apiFetch<FinancePropagationDigest>({ path: '/delivery/finance/propagation' })
  },
}

/**
 * Les trois agrégats ouverts : tarif vendu moyen par compte, missions signées
 * par contact, placements par consultant.
 */
export function usePropagationDigest() {
  return useQuery({ queryKey: propagationKeys.digest(), queryFn: propagationApi.digest })
}

/**
 * Ce que l'écran a le droit de savoir sur les montants — y compris « rien ».
 *
 * ⚠️ `retry: false` sur un 403 : réessayer trois fois une porte fermée retarde
 * la phrase que l'utilisateur doit lire, et la fait précéder d'un temps de
 * chargement qui ressemble à une panne. Un refus de droit n'est pas une panne
 * réseau, et le distinguer est tout l'intérêt de ce hook.
 */
export function useFinancePropagation() {
  return useQuery({
    queryKey: propagationKeys.finance(),
    queryFn: propagationApi.finance,
    retry: (failureCount, error) => !isForbidden(error) && failureCount < 2,
  })
}

/** Un refus de DROIT, distinct d'une panne — la seule chose que le statut dit. */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}

/**
 * L'état financier d'un écran, en UN objet, parce que trois écrans posent
 * exactement les mêmes trois questions.
 *
 * ⚠️ `denied` et `canReadFinance: false` ne sont PAS la même chose, et les
 * replier l'un sur l'autre est précisément le défaut à éviter : le premier veut
 * dire « aucune donnée n'est arrivée », le second « le CA est là, la marge
 * d'équipe non ».
 */
type FinanceAccess = {
  /** 403 : le rôle n'a aucun droit financier. Rien n'est arrivé. */
  denied: boolean
  /** La lecture a échoué pour une autre raison — c'est une PANNE, et elle se dit
   *  autrement qu'un refus. « Cassé » et « pas mesurable » se ressemblent trop. */
  failed: boolean
  /** La marge d'équipe est lisible. `false` sous `finance:read:own`. */
  canReadFinance: boolean
  /**
   * #4016.8e — les MONTANTS du pipe (cumul des besoins, « CA potentiel ») sont lisibles :
   * la route a répondu 200, donc l'appelant porte `finance:read` OU `finance:read:own`.
   * Un commercial les voit ; la marge d'équipe (`canReadFinance`) reste hors de ce droit.
   * Sans réponse (refus, panne, chargement), on ne SAIT pas : `false`.
   */
  canReadPipeAmounts: boolean
}

export function useFinanceAccess(): FinanceAccess & { digest: FinancePropagationDigest | undefined } {
  const query = useFinancePropagation()
  const denied = isForbidden(query.error)
  return {
    digest: query.data,
    denied,
    failed: query.isError && !denied,
    // Jamais `?? true` : sans réponse, on ne SAIT pas, et le repli sûr est le
    // plus fermé — afficher une marge d'équipe qu'on n'a pas le droit de voir
    // serait irrattrapable, l'inverse se corrige en rechargeant.
    canReadFinance: query.data?.canReadFinance === true,
    canReadPipeAmounts: query.data !== undefined,
  }
}

/* ── Indexation — chercher, jamais recalculer ─────────────────────────────── */

/**
 * Une liste d'agrégats, indexée par l'identifiant qui la porte.
 *
 * ⚠️ Indexée par CLÉ et jamais par rang : les deux routes ne rendent pas leurs
 * lignes dans le même ordre (ni le même nombre — un compte peut avoir des
 * missions sans avoir un seul mois facturé), et joindre par position ferait
 * porter le CA d'un client par un autre. C'est la jointure positionnelle qui
 * avait déjà produit « Free 119 € » dans ce dépôt.
 */
function indexBy<T, K extends keyof T>(rows: T[] | undefined, key: K): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows ?? []) {
    const id = row[key]
    if (typeof id === 'string' && id.length > 0) map.set(id, row)
  }
  return map
}

export function accountPropagationById(digest: PropagationDigest | undefined): Map<string, AccountPropagation> {
  return indexBy(digest?.accounts, 'accountId')
}

export function contactPropagationById(digest: PropagationDigest | undefined): Map<string, ContactPropagation> {
  return indexBy(digest?.contacts, 'contactId')
}

export function consultantPropagationById(digest: PropagationDigest | undefined): Map<string, ConsultantPropagation> {
  return indexBy(digest?.consultants, 'consultantId')
}

export function accountRevenueById(
  digest: FinancePropagationDigest | undefined,
): Map<string, AccountRevenuePropagation> {
  return indexBy(digest?.accounts, 'accountId')
}

export function consultantMarginById(
  digest: FinancePropagationDigest | undefined,
): Map<string, ConsultantMarginPropagation> {
  return indexBy(digest?.consultants, 'consultantId')
}
