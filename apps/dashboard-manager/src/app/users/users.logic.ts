import { PLAN_FEATURE_KEYS, PLAN_FEATURE_LABELS } from '@bellum/contracts'
import type { AdminUser, AdminUsersAuthStates, PlanKey, PlanScope } from '@/lib/admin'
import type { SortableValue } from '@/ui/DataTable.logic'

/**
 * Ce que l'annuaire des utilisateurs CALCULE, séparé de ce qu'il rend (#1664).
 *
 * Tout est pur : aucune horloge lue, aucune requête. C'est ce qui permet de
 * tester les seuls endroits où un mensonge pourrait s'écrire — et ici il n'y en
 * a qu'un, mais il est gros.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MENSONGE QU'ON REFUSE : « JAMAIS CONNECTÉ » POUR « ON NE SAIT PAS »
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demande un filtre « jamais connectés ». Deux comptes s'y ressemblent
 * et n'ont rien à voir :
 *
 *  · celui dont le magasin d'authentification a dit `last_sign_in_at: null` —
 *    il ne s'est VRAIMENT jamais connecté, et c'est une mesure ;
 *  · celui dont on n'a pas pu lire l'état (magasin en panne, plafond de pages
 *    atteint, profil sans compte d'authentification) — on ne sait pas.
 *
 * Les confondre relancerait une campagne de réactivation sur des clients actifs,
 * ou ferait conclure « personne n'utilise le produit » un jour de panne. C'est
 * exactement la doctrine « non mesuré n'est jamais zéro », appliquée à une date.
 *
 * ⚠️ La réponse est un TYPE UNION, pas un champ nullable avec un repli. Après
 * `if (connexion.etat === 'connecte')`, TypeScript sait que `date` est une
 * chaîne, et aucun `?? …` n'a plus de raison d'exister : on retire le MOYEN
 * d'écrire le repli, pas seulement l'occasion (gabarit : `analyses-heatmap.logic`).
 */

/** La dernière connexion d'un compte — trois états, jamais deux.
 *  Local : `LigneUtilisateur` le porte, et c'est lui que les appelants
 *  manipulent (knip refuse un type exporté lu dans son seul fichier). */
type DerniereConnexion =
  /** Mesuré : le magasin a répondu, et il n'y a aucune connexion. */
  | { etat: 'jamais_connecte' }
  /** Mesuré : voici quand. */
  | { etat: 'connecte'; date: string }
  /** NON mesuré. Ce n'est ni « jamais », ni une date. */
  | { etat: 'inconnu' }

/** L'état d'un compte — même règle : « on ne sait pas » n'est pas « actif ». */
export type EtatDuCompte = { etat: 'actif' } | { etat: 'suspendu'; jusquau: string | null } | { etat: 'inconnu' }

export type EspaceDeLigne = { id: string; name: string; role: string }

/** Une ligne du tableau dense : l'annuaire, JOINT à ce que l'auth sait. */
export type LigneUtilisateur = {
  userId: string
  email: string
  fullName: string
  plan: PlanKey
  planScope: PlanScope | null
  createdAt: string
  espaces: EspaceDeLigne[]
  connexion: DerniereConnexion
  compte: EtatDuCompte
}

/**
 * Joint l'annuaire et les états d'authentification, PAR IDENTIFIANT.
 *
 * ⚠️ Par identifiant, jamais par position : les deux listes viennent de deux
 * sources (nos tables / le magasin d'authentification), n'ont ni le même ordre
 * ni la même longueur, et une jointure positionnelle attribuerait la suspension
 * de quelqu'un au voisin de la ligne d'à côté.
 *
 * ⚠️ Un utilisateur ABSENT de `states` ressort `inconnu`, y compris quand
 * `complete` vaut `true` : un profil sans compte d'authentification est une
 * anomalie réelle (compte supprimé, profil resté), pas une personne qui ne
 * s'est jamais connectée.
 */
export function joindreEtatsDauth(users: readonly AdminUser[], auth: AdminUsersAuthStates): LigneUtilisateur[] {
  const parUtilisateur = new Map(auth.states.map(state => [state.userId, state]))

  return users.map(user => {
    const state = parUtilisateur.get(user.userId)
    const connexion: DerniereConnexion = !state
      ? { etat: 'inconnu' }
      : state.lastSignInAt === null
        ? { etat: 'jamais_connecte' }
        : { etat: 'connecte', date: state.lastSignInAt }
    const compte: EtatDuCompte = !state
      ? { etat: 'inconnu' }
      : state.banned
        ? { etat: 'suspendu', jusquau: state.bannedUntil }
        : { etat: 'actif' }

    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      plan: user.plan,
      planScope: user.planScope ?? null,
      createdAt: user.createdAt,
      espaces: user.workspaces ?? [],
      connexion,
      compte,
    }
  })
}

/** Les cinq pilules de l'issue, dans l'ordre où elles s'affichent. */
export const FILTRES = ['tous', 'actifs', 'suspendus', 'jamais_connectes', 'sans_espace'] as const
export type Filtre = (typeof FILTRES)[number]

export const LIBELLES_FILTRES: Record<Filtre, string> = {
  tous: 'Tous',
  actifs: 'Actifs',
  suspendus: 'Suspendus',
  jamais_connectes: 'Jamais connectés',
  sans_espace: 'Sans espace',
}

/**
 * Une ligne entre-t-elle dans ce filtre ?
 *
 * ⚠️ `actifs` exige l'état MESURÉ `actif`. Un compte dont l'état est inconnu
 * n'est pas actif « par défaut » — sinon la pilule « Actifs » afficherait tout
 * le monde un jour de panne, ce qui est le pire chiffre possible ici. Même
 * règle pour `jamais_connectes`, qui est tout le sujet de #1664.
 */
export function correspond(ligne: LigneUtilisateur, filtre: Filtre): boolean {
  switch (filtre) {
    case 'tous':
      return true
    case 'actifs':
      return ligne.compte.etat === 'actif'
    case 'suspendus':
      return ligne.compte.etat === 'suspendu'
    case 'jamais_connectes':
      return ligne.connexion.etat === 'jamais_connecte'
    case 'sans_espace':
      return ligne.espaces.length === 0
  }
}

export function filtrer(lignes: readonly LigneUtilisateur[], filtre: Filtre): LigneUtilisateur[] {
  return lignes.filter(ligne => correspond(ligne, filtre))
}

/** Le compte de CHAQUE pilule — il vit sur la pilule, sinon on clique pour voir. */
export function compterParFiltre(lignes: readonly LigneUtilisateur[]): Record<Filtre, number> {
  const comptes = { tous: 0, actifs: 0, suspendus: 0, jamais_connectes: 0, sans_espace: 0 }
  for (const ligne of lignes) {
    for (const filtre of FILTRES) {
      if (correspond(ligne, filtre)) comptes[filtre] += 1
    }
  }
  return comptes
}

/**
 * Combien de lignes ont un état d'authentification NON LU.
 *
 * ⚠️ Ce nombre doit s'AFFICHER, et c'est le point : sans lui, un opérateur qui
 * lit « 18 actifs · 2 suspendus » sur 30 comptes conclut qu'il en manque dix,
 * ou pire, ne remarque rien. « Actifs + suspendus = tous » est une promesse que
 * seul ce chiffre rend vérifiable.
 */
export function compterEtatsNonLus(lignes: readonly LigneUtilisateur[]): number {
  return lignes.filter(ligne => ligne.compte.etat === 'inconnu').length
}

/** Ce que la colonne « Dernière connexion » affiche, et sur quel ton. */
type LibelleConnexion = { texte: string; ton: 'mesure' | 'absent' }

export function libelleConnexion(
  connexion: DerniereConnexion,
  formaterDate: (iso: string) => string,
): LibelleConnexion {
  if (connexion.etat === 'connecte') return { texte: formaterDate(connexion.date), ton: 'mesure' }
  // « jamais » est une MESURE : le magasin a répondu, il n'y a pas de connexion.
  if (connexion.etat === 'jamais_connecte') return { texte: 'jamais connecté', ton: 'mesure' }
  // « inconnu » n'est pas une date, et ce n'est pas « jamais » non plus. Le mot
  // est écrit plutôt que remplacé par un tiret, qui se lirait « rien ».
  return { texte: 'non lu', ton: 'absent' }
}

/** Ce que la colonne « État » affiche : un mot, et la classe de badge qui va avec. */
type LibelleEtat = { texte: string; badge: 'completed' | 'error' | 'analyzing' }

export function libelleEtat(compte: EtatDuCompte): LibelleEtat {
  if (compte.etat === 'actif') return { texte: 'actif', badge: 'completed' }
  if (compte.etat === 'suspendu') return { texte: 'suspendu', badge: 'error' }
  return { texte: 'non lu', badge: 'analyzing' }
}

/**
 * La clé de tri de la colonne « Dernière connexion ».
 *
 * ⚠️ Deux absences, deux traitements OPPOSÉS, et c'est voulu :
 *  · « jamais connecté » est une MESURE — elle se range AVANT toutes les dates,
 *    parce que c'est la place vraie de quelqu'un qui n'est jamais venu (la
 *    chaîne vide précède toute date ISO) ;
 *  · « non lu » est une ABSENCE de mesure — `null`, et `DataTable.logic` le
 *    range TOUJOURS en dernier, dans les deux sens du tri, précisément pour
 *    qu'un tri descendant ne le présente pas comme la plus grande valeur.
 */
export function triConnexion(connexion: DerniereConnexion): SortableValue {
  if (connexion.etat === 'connecte') return connexion.date
  if (connexion.etat === 'jamais_connecte') return ''
  return null
}

/** Même règle : un état non lu sort en dernier plutôt que de se ranger entre
 *  « actif » et « suspendu » comme s'il en était un troisième. */
export function triEtat(compte: EtatDuCompte): SortableValue {
  return compte.etat === 'inconnu' ? null : compte.etat
}

/**
 * Les rôles DISTINCTS de cette personne, dans l'ordre où ses espaces arrivent.
 *
 * ⚠️ Pas d'index partagé entre la colonne « Espace » et la colonne « Rôle » :
 * deux colonnes qui liraient le même tableau par position se décaleraient à la
 * première ligne triée. Chacune rend une chaîne complète, indépendante.
 */
export function libelleRoles(espaces: readonly EspaceDeLigne[]): string {
  const distincts: string[] = []
  for (const espace of espaces) {
    if (!distincts.includes(espace.role)) distincts.push(espace.role)
  }
  return distincts.length === 0 ? '—' : distincts.join(' · ')
}

/** La clé de tri des espaces. Zéro espace est une MESURE : la chaîne vide se
 *  range avant les autres, et ne devient jamais `null`. */
export function triEspaces(espaces: readonly EspaceDeLigne[]): SortableValue {
  return espaces.map(espace => espace.name).join(' · ')
}

/**
 * PLAN-GATE #4381 — « Plan de l'espace EXTEAM », dit quand il n'est pas celui de
 * la personne. Le plan vit sur l'abonnement du propriétaire : sur la ligne d'un
 * membre, le sélecteur règle donc l'ESPACE, et l'écran doit le dire avant le clic.
 * Propriétaire ou compte solo : rien à dire, le plan est le sien.
 */
export function libellePortee(scope: PlanScope | null | undefined): string | null {
  if (!scope || scope.isOwner) return null
  return `Plan de l’espace ${scope.workspaceName} — porté par ${scope.ownerEmail ?? 'son propriétaire'}`
}

/**
 * Ce qu'un palier N'ouvre PAS, nommé — lu dans le catalogue, jamais recopié ici.
 * « Entreprise (sur devis) » laissait croire à tout ouvert alors que le Vivier est
 * la marche Growth : l'écart se découvrait chez le client. Sans catalogue (ou sans
 * liste de fonctions pour ce palier) : liste vide, on ne devine pas.
 */
export function fonctionsFermees(plan: string, catalogue: readonly { key: string; features?: string[] }[]): string[] {
  const ouvertes = catalogue.find(p => p.key === plan)?.features
  if (!ouvertes) return []
  return PLAN_FEATURE_KEYS.filter(key => !ouvertes.includes(key)).map(key => PLAN_FEATURE_LABELS[key].fr)
}

/**
 * #4423.1 — « Dernière activité » + en dessous « dernière connexion par mot de passe ».
 *
 * `last_sign_in_at` ne bouge qu'à la connexion par mot de passe : un espace actif jusqu'au 20/10
 * sur une session ouverte affichait « 01/10 ». La ligne principale est la dernière ACTIVITÉ ;
 * la connexion par mot de passe reste lisible dessous, nommée pour ce qu'elle est.
 */
type LibelleActivite = { activite: string; source: string | null; connexion: string }

const SOURCES_ACTIVITE: Record<'sign_in' | 'action' | 'laura', string> = {
  sign_in: 'connexion par mot de passe',
  action: 'action dans l’espace',
  laura: 'message à Laura',
}

export function libelleActivite(
  activite: { at: string; source: 'sign_in' | 'action' | 'laura' } | null | undefined,
  derniereConnexion: string | null | undefined,
  formaterDate: (iso: string) => string,
): LibelleActivite {
  const connexion =
    derniereConnexion === undefined
      ? 'non lue'
      : derniereConnexion === null
        ? 'jamais connecté'
        : formaterDate(derniereConnexion)
  if (!activite) return { activite: 'aucune activité enregistrée', source: null, connexion }
  return { activite: formaterDate(activite.at), source: SOURCES_ACTIVITE[activite.source], connexion }
}

/** #4423.2 — les statuts d'analyse, en clair (un statut inconnu s'affiche tel quel, jamais masqué). */
const STATUTS_ANALYSE: Readonly<Record<string, string>> = {
  prospect: 'prospect',
  analyzing: 'en cours',
  error: 'en échec',
  canceled: 'annulée',
  archived: 'archivée',
  deleted: 'supprimée',
  imported: 'importée (à compléter)',
}

/**
 * #4423.2 — trois écrans, trois chiffres pour « les comptes de ce client » : ce back-office compte
 * les analyses LANCÉES, Laura les « comptes analysés » (analyses TERMINÉES), l'app les « Comptes
 * suivis » (statut commercial). Chaque ligne dit ce qu'elle compte ; l'écart est NOMMÉ.
 */
export function libelleDossiers(
  ventilation:
    | {
        total: number
        completed: number
        active?: number | undefined
        followed: number
        notCompletedNames: readonly string[]
        notFollowedNames: readonly string[]
        notCompletedByStatus?: Readonly<Record<string, number>> | undefined
        failedReasons?: readonly { name: string; reason: string | null }[] | undefined
      }
    | null
    | undefined,
): string[] {
  if (!ventilation) return ['ventilation indisponible']
  const lignes = [
    `${ventilation.total} ${ventilation.total > 1 ? 'analyses lancées' : 'analyse lancée'}`,
    `${ventilation.completed} ${ventilation.completed > 1 ? 'terminées' : 'terminée'} (celles que Laura compte comme « comptes analysés »)`,
    `${ventilation.followed} ${ventilation.followed > 1 ? 'suivies' : 'suivie'} (ce que l’app appelle « Comptes suivis »)`,
  ]
  // #4423.2 — « actifs » (vue ESN) n'est pas « lancées » : l'écart, ce sont les comptes archivés.
  if (ventilation.active !== undefined) {
    lignes.splice(
      2,
      0,
      `${ventilation.active} ${ventilation.active > 1 ? 'actifs' : 'actif'} (non archivés — le « Comptes actifs » de la vue ESN, qui n’est pas « lancées »)`,
    )
  }
  // #4423.2 — « 281 lancées / 5 terminées » : les autres NOMMENT leur statut, un échec dit sa raison.
  const parStatut = Object.entries(ventilation.notCompletedByStatus ?? {})
  if (parStatut.length > 0) {
    lignes.push(
      `non terminées par statut : ${parStatut.map(([statut, n]) => `${n} ${STATUTS_ANALYSE[statut] ?? statut}`).join(', ')}`,
    )
  }
  for (const echec of ventilation.failedReasons ?? []) {
    lignes.push(`échec ${echec.name} : ${echec.reason ?? 'aucune raison consignée'}`)
  }
  if (ventilation.notCompletedNames.length > 0) {
    lignes.push(
      `non terminée${ventilation.notCompletedNames.length > 1 ? 's' : ''} : ${ventilation.notCompletedNames.join(', ')}`,
    )
  }
  if (ventilation.notFollowedNames.length > 0) {
    lignes.push(
      `non suivi${ventilation.notFollowedNames.length > 1 ? 's' : ''} : ${ventilation.notFollowedNames.join(', ')}`,
    )
  }
  return lignes
}
