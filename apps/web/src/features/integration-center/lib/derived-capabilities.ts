/**
 * CE QUE BELLUM BÂTIT AU-DESSUS DE L'OUTIL BRANCHÉ — #2078.14.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #1443 a posé une règle juste — *« rien d'autorisé, rien d'affiché »* — et la
 * carte n'a plus jamais promis une action que le connecteur ne sait pas faire.
 * Mais elle a rendu INDICIBLE une deuxième vérité : la détection de conflits
 * entre rendez-vous EXISTE (`GET /agenda/conflicts` → `AgendaService.conflicts`),
 * et elle n'est l'action d'aucun connecteur. C'est NOTRE calcul, posé au-dessus
 * de `list_events`. Faute d'un endroit où le dire, le libellé « détectera les
 * conflits » restait interdit alors que le produit le fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FRONTIÈRE, EN UNE PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ACTION DU CONNECTEUR sort de `allowed_actions` : l'outil la sait faire, et
 * si le registre ne l'autorise pas elle ne s'affiche pas. Une CAPACITÉ BELLUM
 * est un calcul qui nous appartient, qui ne sort pas de l'espace de l'outil, et
 * qui n'existe que si les accès qu'il REQUIERT sont là. Les deux se disent, sous
 * deux intitulés différents — c'est la distinction, pas le mélange, qui rend le
 * libellé honnête.
 *
 * ⚠️ D354 : le vocabulaire reste celui de la CAPACITÉ. Le nom de l'outil branché
 * arrive par l'entête de la carte (injection), jamais écrit en dur ici, et NOS
 * fournisseurs ne se nomment nulle part.
 *
 * ⚠️ Une capacité n'entre ici qu'avec le chemin de son APPELANT, vérifié sur le
 * disque par `derived-capabilities.test.ts`. Une ligne sans appelant serait une
 * promesse — exactement ce que #1443 refuse, déplacé d'un cran.
 */
type DerivedCapability = {
  /** La clé i18n de la phrase, sous `derivedCapabilities.*`. */
  key: string
  /** Les actions de connecteur SANS lesquelles le calcul n'a rien à lire. */
  requires: readonly string[]
  /** Le fichier qui porte le calcul — lu sur le disque par la garde. */
  provenIn: string
  /** Le symbole à y trouver : la preuve que le calcul existe vraiment. */
  provenBy: string
}

export const DERIVED_CAPABILITIES: readonly DerivedCapability[] = [
  {
    key: 'detect_conflicts',
    requires: ['list_events'],
    provenIn: 'apps/api/src/modules/agenda/agenda.service.ts',
    provenBy: 'detectConflicts(events)',
  },
  {
    key: 'free_slots',
    requires: ['list_events'],
    provenIn: 'apps/api/src/modules/agenda/agenda.service.ts',
    provenBy: 'computeFreeSlots(events',
  },
]

/**
 * Les capacités Bellum que ces accès débloquent, dans l'ordre de la table.
 *
 * `requires` est un ET : une capacité qui a besoin de deux accès et n'en a qu'un
 * ne s'affiche pas. Un calcul privé de sa matière ne « marche pas un peu », il
 * ne marche pas — et l'annoncer serait la promesse que #1443 refuse.
 */
export function derivedCapabilities(actions: readonly string[]): string[] {
  const available = new Set(actions)
  return DERIVED_CAPABILITIES.filter(capability => capability.requires.every(action => available.has(action))).map(
    capability => capability.key,
  )
}
