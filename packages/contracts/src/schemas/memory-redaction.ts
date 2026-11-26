/**
 * #1918.1 (masquage) — MASQUE D'AFFICHAGE d'une mémoire `workspace` pour qui
 * n'en est pas l'auteur. Décision de Louis du 15/09/2026, déclenchée par un
 * fait mesuré en production (`ed7caa6ee`) : le registre de mémoire
 * (`MemoryService.toWireFact`, apps/api) rend le TEXTE de l'utilisateur tel
 * quel. Pour l'auteur c'est normal — il l'a écrit, il le relit. Mais une
 * mémoire a une PORTÉE : si elle vaut `workspace`, ce qu'un membre y a
 * collé — y compris un secret collé par erreur — devient lisible par TOUS
 * les autres membres de l'ESN.
 *
 * La règle, écrite une fois :
 *
 *   un fait est masqué QUAND, ET SEULEMENT QUAND, `scope === 'workspace'` ET
 *   `ownedByMe === false`. L'auteur voit toujours son texte entier ; une
 *   mémoire `user` n'est JAMAIS masquée, elle ne sort pas de son auteur.
 *
 * ⚠️ Ce n'est PAS le même sujet que la garde de sortie de Laura
 * (`apps/ia/app/services/secret_redaction.py`, qui masque ce que le MODÈLE
 * écrit). Ici c'est ce que l'UTILISATEUR a écrit, qu'on a STOCKÉ, et qu'on
 * RE-SERT à d'autres humains — aucune migration, aucune réécriture : le
 * texte reste entier en base (on archive, on ne supprime pas), c'est un
 * masque d'AFFICHAGE. Il s'applique côté SERVEUR (jamais un filtre côté
 * écran, qui laisserait le secret passer dans la réponse HTTP).
 *
 * Les deux masques partagent cependant la FORME de ce qu'est un secret : les
 * motifs ci-dessous sont des extraits BYTE-IDENTIQUES des motifs Python
 * correspondants (même source de regex, caractère pour caractère), et une
 * parité qui LIT ce fichier PAR CHEMIN le prouve — même discipline que
 * `apps/ia/tests/test_consulting_domains_parity.py` pour `OFFER_DOMAINS` :
 * voir `apps/ia/tests/test_memory_redaction_parity.py`.
 *
 * Portée volontairement PARTIELLE : seulement les quatre familles prouvées en
 * recette (IBAN sous ses deux formes, mot de passe dans une URL, hôte interne
 * `*.railway.internal`, JWT). Porter TOUT `secret_redaction.py` (l'en-tête
 * d'autorisation, l'affectation `NOM_DE_VARIABLE=valeur`, le flux SSE…) est
 * laissé pour un lot suivant — un masque partiel qui sait dire NON vaut mieux
 * qu'un masque complet qui n'atterrit pas.
 *
 * Pièges déjà payés côté Python, repris tels quels ici (ne pas les repayer) :
 *  · les IPv4 privées ne sont PAS dans ce lot (hors des 4 familles prouvées) ;
 *  · l'IBAN est reconnu sous ses DEUX formes, compacte et imprimée par
 *    groupes de quatre (`FR76 3000 6000 0112 3456 7890 189`) ;
 *  · le motif IBAN exige onze à trente-deux caractères après la clé de
 *    contrôle : un numéro de TVA intracommunautaire (`FR12345678901`, dix
 *    chiffres au plus) a la même tête et NE matche PAS ;
 *  · la prose professionnelle ordinaire (coordonnées d'un contact, SIRET…)
 *    ne se masque pas — voir le témoin de sur-masquage du test.
 */

/** Le remplacement, volontairement lisible — même constante que côté Python. */
export const REDACTED_MEMORY_VALUE = '[valeur masquée]'

interface MemoryRedactionFamily {
  readonly name: string
  /**
   * Source de regex BRUTE (sans drapeau), copiée caractère pour caractère
   * depuis `apps/ia/app/services/secret_redaction.py` — c'est cette chaîne,
   * telle quelle, que la parité Python cherche dans le fichier source.
   */
  readonly pattern: string
  readonly flags: string
  /** Gabarit de remplacement `String.prototype.replace` (peut référencer `$1`). */
  readonly replacement: string
}

const MEMORY_REDACTION_FAMILIES: readonly MemoryRedactionFamily[] = [
  {
    name: 'jwt',
    // Un JWT (trois segments base64url) — jeton de session, service-role
    // Supabase, jeton d'accès OAuth. Identique à `secret_redaction.py:49`.
    pattern: String.raw`\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}`,
    flags: 'g',
    replacement: REDACTED_MEMORY_VALUE,
  },
  {
    name: 'internal_host',
    // #1956.18 — un hôte du DNS privé Railway désigne un service à un AUTRE
    // service, jamais une information pour un commercial. Identique à
    // `secret_redaction.py:56` (IGNORECASE — un nom de domaine est insensible
    // à la casse).
    pattern: String.raw`\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.railway\.internal(?::\d+)?\b`,
    flags: 'gi',
    replacement: REDACTED_MEMORY_VALUE,
  },
  {
    name: 'iban',
    // #1956.20 — coordonnées BANCAIRES, sous ses deux formes (compacte et
    // imprimée par groupes de quatre). Identique à `secret_redaction.py:89`.
    pattern: String.raw`\b[A-Z]{2}\d{2}(?:(?: ?[A-Z0-9]{4}){3,7} ?[A-Z0-9]{1,4}|(?: ?[A-Z0-9]{4}){2} ?[A-Z0-9]{3,4})\b`,
    flags: 'g',
    replacement: REDACTED_MEMORY_VALUE,
  },
  {
    name: 'url_credentials',
    // `scheme://identifiant:mot-de-passe@hôte` — le SCHÉMA et l'HÔTE restent
    // lisibles (information de diagnostic utile), seul `user:motdepasse`
    // avant le `@` est masqué. Identique à `secret_redaction.py:190`.
    pattern: String.raw`\b([a-zA-Z][a-zA-Z0-9+.\-]{1,20}://)[^\s/:@]*:[^\s/@]+@`,
    flags: 'g',
    replacement: `$1${REDACTED_MEMORY_VALUE}@`,
  },
] as const

/** Les noms de familles couvertes — pour la garde « corpus non vide » et la parité Python. */
export function memoryRedactionFamilyNames(): readonly string[] {
  return MEMORY_REDACTION_FAMILIES.map(family => family.name)
}

/**
 * Rend `text` débarrassé de ce qui a la forme d'un secret des quatre familles
 * ci-dessus. Idempotent : appliquer deux fois donne le même résultat.
 *
 * N'appelle JAMAIS cette fonction pour une mémoire `user`, ni pour l'auteur
 * d'une mémoire `workspace` — la règle (`scope === 'workspace' && !ownedByMe`)
 * se décide à l'appelant (`toWireFact`), pas ici : cette fonction ne connaît
 * ni la portée ni le lecteur.
 */
export function redactMemoryFact(text: string): string {
  if (!text) return text
  return MEMORY_REDACTION_FAMILIES.reduce(
    (cleaned, family) => cleaned.replace(new RegExp(family.pattern, family.flags), family.replacement),
    text,
  )
}
