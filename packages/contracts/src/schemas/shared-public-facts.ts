/**
 * #3989 (suite de #3971 point d) — LE CONTRAT DES FAITS SOCIÉTÉ PUBLICS PARTAGÉS
 * ENTRE ESPACES.
 *
 * La base commune a deux familles de faits :
 *  · les PERSONNES d'une société (`shared_company_people`, `shared-company-facts.ts`,
 *    c94) ;
 *  · les faits PUBLICS sur une société — registre, annonces légales, marchés
 *    publics, offres d'emploi publiques, presse — rangés par le service IA dans
 *    `source_cache` sous la famille `public_facts` (#4067, `public_facts.py`),
 *    relus par TOUS les espaces (Découvrir, analyse complète).
 *
 * Ce module est le CONTRAT de la seconde famille, lu par trois parties qui ne
 * doivent jamais diverger : la migration qui la borne en SQL
 * (`1796530328276-SharedPublicFactsContract`), le code IA qui l'écrit
 * (`public_facts.py`, miroir tenu par `shared-public-facts-boundary.spec.ts`), et
 * la garde d'architecture qui dit NON à une donnée d'espace.
 *
 * Règles (doctrine GA-43 / c92 / c94 — les espaces sont des concurrents) :
 *  · SEULES ces natures publiques entrent ; une famille PRIVÉE d'un espace
 *    (CRM, notes, documents, Drive, missions, corrections, listes, contacts,
 *    historique de signaux) est refusée par nom ;
 *  · la clé est l'ENTREPRISE (SIREN, sinon domaine) suivie d'un JETON fermé qui
 *    décrit la question posée à la source, jamais QUI la pose ;
 *  · aucune trace de l'espace qui a déclenché la collecte : aucun marqueur
 *    d'espace ni d'utilisateur, à aucune profondeur du fait ;
 *  · un fait garde sa date de collecte (`collectedAt`) ; sa source reste une
 *    valeur technique (`source_cache.source`), jamais un libellé d'écran.
 */

/** La table et la famille où vivent les faits publics partagés. */
export const SHARED_PUBLIC_FACTS_STORE = { table: 'source_cache', family: 'public_facts' } as const

/** Les natures de faits PUBLICS — registre, annonces légales, marchés publics, offres, presse. */
export const SHARED_PUBLIC_FACT_NATURES = ['jobs', 'news', 'legal', 'tenders', 'registry'] as const

/** Ce qui appartient à UN espace — jamais une famille du cache partagé `public_facts`.
 *  `contacts` : les FICHES d'un espace. Les personnes de la base commune vivent ailleurs
 *  (`shared_company_people`, c94) et y sont TOUTES gardées (Louis 15/10/2026, #3989). */
export const SHARED_PUBLIC_FACT_PRIVATE_FAMILIES = [
  'crm',
  'notes',
  'documents',
  'drive',
  'missions',
  'corrections',
  'lists',
  'contacts',
  'signal_history',
] as const

/** Une clé qui porte l'un de ces noms, à n'importe quelle profondeur, désigne un espace. */
export const SHARED_PUBLIC_FACT_WORKSPACE_MARKERS = ['workspace_id', 'workspaceId', 'user_id', 'userId'] as const

/**
 * La clé d'une ligne : `siren:<9 chiffres>` ou `domain:<hôte>`, puis `|` et le
 * jeton de la question (vide, `esn_it`, `apec:it`, `ft:esn_it:all`…). Un texte
 * libre — un nom, un domaine d'offre saisi par un espace — ne passe pas.
 * Écrit en syntaxe POSIX commune à PostgreSQL et à JavaScript.
 */
export const SHARED_PUBLIC_FACT_KEY_PATTERN =
  '^(siren:[0-9]{9}|domain:[a-z0-9-]+([.][a-z0-9-]+)+)[|][a-z0-9_:.-]{0,64}$'
