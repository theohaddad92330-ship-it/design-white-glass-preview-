/**
 * #2378.9 — LA FRONTIÈRE : ce qui SORT attend, ce qui est INTERNE part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISION LOUIS 21/09/2026. Une étape programmée d'une séquence (J+4, J+10)
 * s'exécute SELON CE QU'ELLE ATTEINT :
 *
 *  - elle atteint quelqu'un d'EXTÉRIEUR (e-mail, message, invitation) ⇒ elle
 *    ATTEND une validation explicite, même programmée, même lancée ;
 *  - elle est purement INTERNE (créer une tâche, poser un rappel, rafraîchir une
 *    donnée) ⇒ elle s'exécute à l'heure dite, sans clic.
 *
 * Ce qui est écrit ici n'est donc PAS « auto-exécution interdite » — c'est la
 * FRONTIÈRE. Le produit a le droit d'agir tout seul ; il n'a pas le droit de
 * PARLER À QUELQU'UN tout seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FICHIER À PART PLUTÔT QU'UNE DEUXIÈME TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * La frontière existait déjà, sous un seul de ses deux visages : `INTENT_REACH`
 * (`action-os.ts`, #1931) classe les treize intents de l'Action Router, et
 * `approval-policy.ts` en tire le plancher d'approbation (GA-239). Le
 * constructeur de séquences, lui, parle un AUTRE vocabulaire — `email`,
 * `reminder`, `task` — et n'avait aucune table.
 *
 * Deux tables qui disent la même règle avec deux mots différents divergent au
 * troisième contributeur. Le vocabulaire vit donc ICI, à un seul endroit
 * (GA-26), et chaque famille d'effets DÉCLARE ses natures contre lui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI REND LA RÈGLE TENABLE DANS SIX MOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une nature d'effet NEUVE est obligée de déclarer son côté, de deux façons qui
 * ne se remplacent pas :
 *
 *  1. AU COMPILATEUR — une table est un `Record<K, EffectReach>` exhaustif :
 *     ajouter une valeur à l'énumération sans l'ajouter à la table ne compile
 *     pas. C'est ce qui attrape le développeur.
 *  2. À L'EXÉCUTION — {@link reachFromTable} ne lit jamais la table à nu : une
 *     clé absente rend {@link UNDECLARED_EFFECT_REACH}, c'est-à-dire le côté
 *     qui ATTEND. C'est ce qui attrape la valeur venue d'AILLEURS, là où le
 *     compilateur ne voit rien : une colonne `kind` élargie par une migration,
 *     le JSON d'un workflow importé, une réponse de service.
 *
 * Le sens du défaut n'est pas symétrique et c'est tout le point : se tromper du
 * côté « attend » coûte un clic ; se tromper du côté « part » écrit à un client
 * au nom du commercial. Un doute tombe donc TOUJOURS du côté qui attend.
 */

/**
 * Les deux côtés de la frontière. Liste FERMÉE.
 *
 * `internal` — l'effet reste dans le produit ou dans les outils de l'espace :
 *   une tâche, un rappel, une note, une donnée rafraîchie. Personne d'autre que
 *   le propriétaire du geste n'apprend quoi que ce soit.
 * `external` — l'effet SORT et atteint quelqu'un : une boîte aux lettres qui
 *   n'est pas la nôtre, un agenda avec des invités, une invitation.
 */
export const EFFECT_REACHES = ['internal', 'external'] as const
export type EffectReach = (typeof EFFECT_REACHES)[number]

/**
 * Le côté d'une nature d'effet que PERSONNE n'a déclarée.
 *
 * `external` — le côté qui attend. Jamais l'autre : une nature inconnue est par
 * définition une nature dont on ne sait pas si elle parle à quelqu'un, et
 * « on ne sait pas » ne s'exécute pas tout seul (même famille de décision que
 * `unknown` sur une écriture de connecteur : un timeout n'est pas un échec, il
 * ARRÊTE la reprise au lieu de la relancer).
 */
export const UNDECLARED_EFFECT_REACH: EffectReach = 'external'

/**
 * Ce qu'une étape ÉCHUE a le droit de faire.
 *
 * `awaits_validation` — l'échéance passe, l'étape est prête, et rien ne part :
 *   il manque un clic, et il manquera toujours un clic.
 * `runs_on_schedule` — l'échéance passe, l'étape s'exécute. Aucun geste humain
 *   n'est attendu, et en réclamer un serait du bruit.
 */
export const EFFECT_EXECUTIONS = ['awaits_validation', 'runs_on_schedule'] as const
export type EffectExecution = (typeof EFFECT_EXECUTIONS)[number]

/** La frontière, en une ligne : ce qui SORT attend, ce qui est INTERNE part. */
export function executionForReach(reach: EffectReach): EffectExecution {
  return reach === 'external' ? 'awaits_validation' : 'runs_on_schedule'
}

/**
 * Lit une table de frontière par une clé dont on ne contrôle pas l'origine.
 *
 * ⚠️ Ne JAMAIS lire une table de frontière à nu (`TABLE[kind]`) : le type dit
 * que la clé existe, la base dit autre chose, et `undefined === 'external'`
 * rend `false` — c'est-à-dire « interne », c'est-à-dire « pars ». C'est le sens
 * exact de l'erreur qu'on refuse, et il se produit sans qu'aucun test ne
 * rougisse tant que personne n'élargit l'énumération.
 */
export function reachFromTable(table: Readonly<Record<string, EffectReach>>, key: string): EffectReach {
  return table[key] ?? UNDECLARED_EFFECT_REACH
}
