/**
 * L'analytique produit — l'unité d'analyse, et les deux seuls réglages qu'elle
 * a le droit d'avoir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FRONTIÈRE, ET ELLE N'EST PAS OÙ ON CROIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas « anonyme contre nominatif ». C'est l'UNITÉ D'ANALYSE :
 *
 *   ON MESURE LE PRODUIT              ON NE MESURE PAS LA PERSONNE
 *   ──────────────────────────        ──────────────────────────────────
 *   cet écran est abandonné           Sarah abandonne les écrans
 *   cette fonction n'est jamais       Sarah n'utilise jamais cette
 *     utilisée                          fonction
 *   ce parcours casse ici             Sarah bloque ici
 *   ce champ fait fuir                Sarah met 4 min sur ce champ
 *
 * On agrège par ÉCRAN, par FONCTION, par PARCOURS — jamais par personne, même
 * identifiée par un hash. Un pseudonyme ne change pas l'unité d'analyse : il
 * rend seulement la personne plus difficile à nommer une fois qu'on l'a isolée.
 * C'est cette phrase-là qui tranche les cas ambigus, pas les seuils ci-dessous.
 *
 * La doctrine complète (les cinq règles, leur raison, ce qui les tient) vit au
 * registre : `doctrine-registry.ts`, entrée `c64_analytique_produit`, issue
 * #1681. Ce fichier n'en porte que la part CHIFFRÉE — celle qu'un écran doit
 * lire au lieu de la recopier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES DEUX NOMBRES VIVENT ICI ET NULLE PART AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un réglage vit à un seul endroit » (GA-26). Le seuil d'agrégation minimale
 * est déjà écrit QUATRE fois dans les issues voisines, sous quatre formes qui
 * disent la même chose : cohortes de moins de 3 espaces masquées (#1658, #1686),
 * parcours sous 5 occurrences (#1684), « trop récent » sous 5 sessions (#1683),
 * et la règle 1 de #1681. Quatre recopies, c'est quatre valeurs le jour où l'on
 * en change une — et un écran qui masque à 3 pendant qu'un autre publie à 5
 * désigne quelqu'un sur le second.
 *
 * Il vit dans `@bellum/contracts` et non dans `apps/api` parce que les DEUX
 * côtés en ont besoin, et pour des raisons différentes : l'API décide ce qu'elle
 * CALCULE (une agrégation sous le seuil ne doit pas sortir de la base), le
 * back-office décide ce qu'il DIT à sa place (« pas encore assez de sessions
 * pour en tirer quelque chose »). Un seuil qui vivrait côté serveur seul ferait
 * réinventer le libellé côté écran, avec sa propre valeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS EXCEPTIONS NOMMÉES (deux : décision Louis 13/09/2026, batch 12 ; la troisième : 11/10/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prises CONTRE la recommandation, relecture juridique toujours due :
 *  - #1946.22 — une alerte OPÉRATEUR par espace nommé dont le score de santé
 *    mesuré passe sous le seuil (règle 5 levée pour elle seule, GA-266) ;
 *  - #1949.23 — la trace ANONYME d'une demande que Laura n'a pas su router
 *    (règle 2 levée pour elle seule, GA-264). Elle lit le seuil de CE fichier
 *    comme plancher d'occurrences DISTINCTES à la lecture (GA-267), et son hash
 *    d'(espace, jour) est `hashBehavioralSession` — les deux nombres restent ICI.
 *
 *  - #2442.10 (11/10/2026, lot W9) — l'agrégat des CONTESTATIONS / CORRECTIONS
 *    des réponses de Laura, par FONCTION, jamais par personne ni par espace
 *    nommé (GA-412). Il lit le plancher de CE fichier comme seuil de lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ #1946 (14/09/2026) — ÉLARGIR N'EST PAS EXCEPTER
 * ─────────────────────────────────────────────────────────────────────────────
 * L'union fermée du traceur produit est passée de NEUF à DIX-NEUF événements
 * sur décision de Louis, prise contre la recommandation et sans que la
 * relecture juridique ci-dessus soit faite. Il n'y a toujours QUE DEUX
 * exceptions nommées : les dix formes ajoutées sont tenues par les cinq règles
 * comme les neuf d'origine — aucune ne porte de contenu (liste blanche par
 * événement, GA-264), aucune ne porte d'identité (`trackBehavioral()` écrit
 * `user_id` et `workspace_id` à `null` inconditionnellement), et le plancher de
 * {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions s'applique aux cinq blocs
 * du rapport de valeur comme aux sept lectures d'avant (GA-267).
 *
 * Les deux nombres n'ont pas bougé, et c'est le point : un lot qui élargit ce
 * qu'on MESURE n'a aucune raison de toucher à ce qui protège la personne
 * MESURÉE. Une QUATRIÈME exception ferait rougir GA-264 / GA-266 / GA-412 — et le compte
 * des exceptions est lui-même gardé, dans le test voisin de ce fichier.
 */

/**
 * Le nombre de SESSIONS DISTINCTES sous lequel aucune métrique comportementale
 * n'est publiée — ni affichée, ni renvoyée par une route, ni exportée.
 *
 * Cinq, et la raison n'est pas statistique : sous ce seuil, une « moyenne »
 * désigne quelqu'un. Un taux d'abandon calculé sur trois sessions dans un espace
 * qui compte trois utilisateurs est une phrase sur une personne, écrite en
 * pourcentage.
 *
 * ⚠️ Le seuil porte sur les sessions DISTINCTES, jamais sur les événements : dix
 * clics d'une même session restent une seule session, et c'est précisément le
 * cas où la moyenne ne parle que d'elle.
 *
 * Le dépôt a déjà un seuil d'échantillon minimal ailleurs —
 * `OBSERVABILITY_ALERT_MIN_SAMPLE` (20, `apps/api/src/modules/analytics/observability-alerts.ts`),
 * qui décide quand une ALERTE technique a assez de matière pour être crue. Il ne
 * s'applique pas ici et l'inverse non plus : l'un protège une conclusion, l'autre
 * protège une personne. Les confondre alignerait les deux sur le plus grand des
 * deux nombres, et masquerait des mesures produit parfaitement publiables.
 */
export const MIN_DISTINCT_SESSIONS_FOR_A_METRIC = 5

/**
 * La période de rotation du hash qui identifie une session dans l'analytique
 * produit — 24 heures.
 *
 * L'identifiant est un hash de SESSION, jamais d'utilisateur. On suit un
 * parcours DANS une journée (« ce parcours casse ici »), on ne suit pas une
 * personne DANS LE TEMPS. La rotation est ce qui rend la seconde lecture
 * impossible plutôt qu'interdite : sans elle, l'interdit ne tient que par la
 * discipline de celui qui écrit la requête.
 */
export const SESSION_HASH_ROTATION_HOURS = 24

/**
 * Une agrégation comportementale a-t-elle assez de sessions distinctes pour être
 * publiée ?
 *
 * ⚠️ `false` veut dire « ne publie pas », JAMAIS « zéro ». Un écran qui
 * remplacerait une métrique retenue par « 0 % » mentirait deux fois — sur la
 * mesure, et sur la raison de son absence (doctrine « non mesuré n'est jamais
 * 0 », invariant `unknown_is_not_zero`). La bonne phrase à cet endroit nomme le
 * seuil : « moins de {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions — pas
 * encore de quoi en tirer une mesure ».
 *
 * Un compte INCONNU (`null`, `undefined`) n'est pas publiable non plus : on ne
 * sait pas ce qu'on publierait. Un compte non entier ou négatif est un compte
 * cassé, pas un petit compte — il ne franchit donc pas le seuil par accident.
 */
export function hasEnoughSessionsToPublish(distinctSessions: number | null | undefined): boolean {
  if (typeof distinctSessions !== 'number' || !Number.isInteger(distinctSessions)) return false
  return distinctSessions >= MIN_DISTINCT_SESSIONS_FOR_A_METRIC
}

/**
 * #1681.4 — la fonction de hachage + rotation, posée à côté du réglage qu'elle
 * applique. `SESSION_HASH_ROTATION_HOURS` existait depuis le 06/09/2026 sans
 * AUCUN appelant : la règle 4 (« l'identifiant est un hash de session tourné,
 * jamais d'utilisateur ») tenait par la prose, pas par le code. Cette fonction
 * est le premier appelant, et c'est délibéré qu'elle vive ICI plutôt que dans
 * `apps/api` ou `apps/web` :
 *
 *  - si elle vivait côté NAVIGATEUR, la rotation ne tiendrait que par la
 *    discipline du code qui l'appelle — un traceur qui oublierait de faire
 *    tourner son identifiant local romprait la règle sans qu'aucun test ne le
 *    voie, exactement la faille que la doctrine nomme : « la rotation est ce
 *    qui rend la seconde lecture IMPOSSIBLE plutôt qu'INTERDITE » ;
 *  - en la posant ici et en l'appelant côté SERVEUR (là où la ligne est
 *    effectivement écrite), la rotation est structurelle : même un traceur
 *    buggé qui réutiliserait le même germe pendant des semaines produit un
 *    `session_id` qui change quand même toutes les
 *    {@link SESSION_HASH_ROTATION_HOURS} heures, parce que l'heure d'écriture
 *    fait partie de l'entrée du hachage.
 *
 * Aucune dépendance à `node:crypto` : le paquet est consommé aussi bien côté
 * API que côté web, et une fonction volontairement PURE (un simple hachage
 * FNV-1a, en deux passes pour réduire les collisions) reste isomorphe sans
 * qu'on ait à s'interroger sur ce qu'un bundler navigateur fait d'un import
 * Node. Ce n'est pas un choix cryptographique — le germe d'entrée
 * (`rawSessionSeed`) est déjà un identifiant aléatoire non réversible ; le
 * hachage n'a qu'à être STABLE et à faire ENTRER le temps dans le résultat.
 *
 * Germe vide/absent → chaîne vide, jamais un hash « par défaut » qui
 * ferait croire à une session : symétrique à `track()` qui refuse d'écrire
 * sans `userId`.
 */
export function hashBehavioralSession(rawSessionSeed: string, at: Date = new Date()): string {
  const seed = typeof rawSessionSeed === 'string' ? rawSessionSeed.trim() : ''
  if (!seed) return ''
  const rotationMs = SESSION_HASH_ROTATION_HOURS * 60 * 60 * 1000
  const bucket = Math.floor(at.getTime() / rotationMs)
  const input = `${seed}:${bucket}`
  // Deux passes à graines différentes : un seul FNV-1a (32 bits) collisionnerait
  // trop vite pour compter des sessions DISTINCTES correctement au volume d'un
  // produit — la sortie ci-dessous porte 64 bits utiles.
  return `${fnv1a(input, 0x811c9dc5)}${fnv1a(`${input}#2`, 0x9e3779b9)}`
}

/** FNV-1a sur 32 bits, en hexadécimal fixe (8 caractères). Pure, déterministe,
 *  sans dépendance — un hachage de conformité (rendre l'entrée non lisible),
 *  pas un hachage cryptographique. */
function fnv1a(input: string, seed: number): string {
  let hash = seed
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
