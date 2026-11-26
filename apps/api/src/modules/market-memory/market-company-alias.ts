import { marketMatchKey } from './market-company-key'

/**
 * #1756 — L'ALIAS : le troisième candidat, et le plus FAIBLE des trois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN ALIAS EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corpus est indexé sur SON libellé, le registre sur la raison sociale. Aucun
 * identifiant stable n'existe des deux côtés — pas de SIREN, pas d'identifiant
 * de registre, pas de LinkedIn, et pas de site web côté suggestion. « SG SOCIETE
 * GENERALE » ne rencontre donc jamais « SOCIETE GENERALE » et ses 267 parcours
 * observés, sans qu'aucune requête n'échoue.
 *
 * Un alias enregistre un rapprochement **décidé ailleurs** : à l'ingestion, ou
 * par un opérateur qui lit le journal des entités non résolues. Il n'est PAS un
 * identifiant, et il ne se déduit pas d'une règle sur le texte.
 *
 * ⚠️ **Un rapprochement par alias reste une APPROXIMATION.** Deux graphies qu'un
 * humain a déclarées équivalentes ne sont pas la même preuve qu'un domaine
 * racine partagé. C'est pourquoi une résolution par alias ressort avec
 * `matchedOn: 'alias'` et la force FAIBLE (`inferred`) — un appelant a le droit
 * de la refuser, et le journal la compte à part.
 *
 * ⚠️ **Ce qu'on ne fait PAS ici, et #1756 le refuse elle-même** : allonger
 * `NOISE_TOKENS` de `sg`, `bnp`, `cic`, `ste`… L'issue écrit noir sur blanc que
 * l'heuristique « jettera un jour le préfixe qui EST le nom », et la classe de
 * noms touchée n'est pas bornée (« SOCIETE NATIONALE SNCF » contre « SNCF » n'a
 * même pas de préfixe à retirer). Chaque token ajouté crée ses propres faux
 * positifs sur soixante mille lignes, et un mauvais rapprochement est pire
 * qu'une absence.
 */

/**
 * La clé sous laquelle un alias se range et se cherche.
 *
 * ⚠️ C'est **exactement** `marketMatchKey`, et ce n'est pas une redite : les
 * deux côtés de la table d'alias doivent passer par LA MÊME normalisation que
 * la clé de nom du corpus, sinon ils ne se rencontrent jamais — « deux
 * normalisations différentes ne se rencontrent jamais, et croire qu'elles se
 * rencontrent produit un silence total qu'aucun test ne montre »
 * (`market-company-key.ts`). La fonction existe pour DONNER UN NOM à cet
 * invariant et pour qu'un test le prouve, plutôt que pour ajouter une règle.
 */
export function marketAliasKey(rawAlias: string): string {
  return marketMatchKey(rawAlias)
}

/**
 * Les entreprises DISTINCTES visées par un jeu de lignes d'alias.
 *
 * Deux lignes qui visent la même entreprise (deux graphies enregistrées
 * séparément) ne font pas deux candidats : ce serait une ambiguïté fabriquée
 * par le stockage, et elle ferait taire un rapprochement juste.
 */
export function aliasTargetKeys(rows: readonly { readonly companyKey: string }[]): string[] {
  return [...new Set(rows.map(row => row.companyKey))]
}
