import { COLLEAGUE_ACTIVITY_WINDOW_DAYS, type Activity } from '@bellum/contracts'

/**
 * #2128.3 / #2128.4 — QUI, DANS L'ÉQUIPE, A TOUCHÉ CE COMPTE, ET QUAND.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LA MATIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 * De la timeline du compte, telle quelle : `GET /activities?scope=account` est
 * scopée à l'ESPACE (et non à l'utilisateur), et chaque ligne porte `userId` et
 * `authorName` — le nom étant résolu côté serveur depuis `profiles`, donc bien
 * celui d'un COLLÈGUE et jamais celui de l'interlocuteur du message.
 *
 * Le bandeau ne relance donc aucun appel : l'onglet Historique lit déjà cette
 * timeline sous la même clé de requête.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ON NE CALCULE PAS, ET C'EST LE CŒUR
 * ─────────────────────────────────────────────────────────────────────────────
 * **Aucun compteur par personne.** Pas de « 12 touches », pas de « le plus
 * actif », aucun tri par volume. Le contrat de la mémoire collective refuse déjà
 * exactement cela et écrit pourquoi (`memory-crossing.ts`, G4) : « compter les
 * touches d'un collègue serait un début de classement entre pairs ».
 *
 * La frontière est celle de l'analytique produit : nommer un collègue pour
 * COORDONNER est légitime — « Sarah a écrit à ce compte mardi, parle-lui avant
 * d'appeler » ; mesurer son activité ne l'est pas — « Sarah touche peu ses
 * comptes ». Un nom et UNE date coordonnent. Un compteur note quelqu'un.
 *
 * Le tri est donc par RÉCENCE, qui est une propriété du FAIT (quand a-t-il eu
 * lieu), jamais par volume, qui serait une propriété de la PERSONNE.
 */
// Non exporté : rien hors de ce fichier ne le consomme (garde `lint:exports:types`).
type TeamContributor = {
  userId: string
  /** Le nom résolu par le serveur. Jamais un uuid, jamais « inconnu ». */
  name: string
  /** La date de sa trace la PLUS RÉCENTE sur ce compte, en ISO. */
  lastTouchedAt: string
  /** La nature de cette trace — « a envoyé un e-mail », « a noté un appel ». */
  lastKind: Activity['kind']
}

/**
 * Les collègues qui ont laissé une trace sur ce compte, du plus récent au plus
 * ancien, une entrée par personne.
 *
 * ⚠️ **Une activité sans auteur NOMMÉ n'entre pas.** `userId` nul (un échange
 * capturé sans utilisateur Bellum identifié) ou `authorName` nul (profil
 * supprimé) donnent « Auteur inconnu » dans le fil, ce qui y est honnête — mais
 * dans un bandeau dont le seul but est de dire À QUI PARLER, une ligne qu'on ne
 * peut pas nommer n'aide personne et occupe la place de celle qui aiderait.
 * Elle est donc écartée, jamais remplacée par une valeur de remplissage.
 *
 * ⚠️ Une date illisible écarte la ligne elle aussi : la classer à « maintenant »
 * ferait remonter en tête un collègue qui n'a rien fait aujourd'hui, et le
 * bandeau ferait déranger quelqu'un pour rien.
 */
export function teamContributors(activities: readonly Activity[]): TeamContributor[] {
  const byUser = new Map<string, TeamContributor>()

  for (const activity of activities) {
    const { userId, authorName } = activity
    if (!userId || !authorName) continue
    const at = Date.parse(activity.occurredAt)
    if (Number.isNaN(at)) continue

    const known = byUser.get(userId)
    if (!known || Date.parse(known.lastTouchedAt) < at) {
      byUser.set(userId, {
        userId,
        name: authorName,
        lastTouchedAt: activity.occurredAt,
        lastKind: activity.kind,
      })
    }
  }

  return [...byUser.values()].sort((a, b) => Date.parse(b.lastTouchedAt) - Date.parse(a.lastTouchedAt))
}

/** Les natures qui se DISENT à un collègue (« a envoyé un e-mail ») : un échange ou
 *  une note — jamais un événement système (analyse, changement d'étape…). */
const SPOKEN_KINDS: readonly Activity['kind'][] = ['email', 'call', 'meeting', 'note', 'linkedin', 'task']

/** La nature à nommer, ou `null` — une nature qui ne se dit pas ne fait AUCUNE ligne. */
export function spokenKind(kind: Activity['kind']): Activity['kind'] | null {
  return SPOKEN_KINDS.includes(kind) ? kind : null
}

/**
 * #4158.20 — « déjà travaillé par X » : les COLLÈGUES (jamais moi) qui ont laissé
 * une trace sur ce compte dans les 90 derniers jours. Rien si c'est moi, rien si
 * personne. Même tri que {@link teamContributors} : par récence du fait.
 */
export function colleagueContributors(
  activities: readonly Activity[],
  me: string | null | undefined,
  now: number = Date.now(),
): TeamContributor[] {
  const horizon = now - COLLEAGUE_ACTIVITY_WINDOW_DAYS * 86_400_000
  return teamContributors(activities).filter(c => c.userId !== me && Date.parse(c.lastTouchedAt) >= horizon)
}
