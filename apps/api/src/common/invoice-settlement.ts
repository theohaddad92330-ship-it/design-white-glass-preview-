/**
 * ─────────────────────────────────────────────────────────────────────────────
 * « CETTE FACTURE EST-ELLE SOLDÉE ? », EN SQL — #2419.4
 * ─────────────────────────────────────────────────────────────────────────────
 * `isSettled` (contrat) répond à la question en TypeScript, pour l'écran et
 * pour la cadence de relance. Trois requêtes y répondaient de leur côté, et
 * toutes les trois de la même façon fautive : `paid_at IS NULL`. Un client qui
 * règle 5 000 € sur une facture de 10 000 € fait poser `paid_at`, et la ligne
 * disparaissait alors de la file d'intervention, de la sonde de Laura et du
 * compteur de risque d'une mission — sans qu'aucune alerte ne le dise.
 *
 * Le prédicat vit donc à UN endroit (GA-26), sous la forme d'un fragment SQL
 * paramétré par l'alias de la table. Trois copies écrites à la main
 * divergeraient au premier `null` oublié, et c'est exactement ce qui vient
 * d'arriver.
 *
 * ⚠️ IL EST LE MIROIR EXACT DE `isSettled`, refus compris :
 *  - `paid_at IS NULL` ⇒ rien n'a été constaté : NON soldée ;
 *  - `paid_amount_cents IS NULL` ⇒ payée d'un montant NON MESURÉ, donc
 *    SOLDÉE. La traiter comme partielle accuserait un client d'un impayé sur
 *    la foi d'une absence, et le remettrait dans une file de relance ;
 *  - `invoiced_amount_cents IS NULL` ⇒ dénominateur manquant, rapport
 *    indéterminé : SOLDÉE, pour la même raison ;
 *  - sinon, elle n'est NON soldée que si l'encaissé est STRICTEMENT inférieur
 *    au facturé. Un trop-perçu solde ; ce n'est pas un reste dû négatif.
 *
 * ⚠️ `alias` n'est jamais une valeur d'utilisateur — c'est l'alias écrit dans
 * la requête appelante (`r`, `ir`). Il n'y a donc pas de paramètre à lier ici,
 * et rien de ce fichier ne doit jamais recevoir d'entrée externe.
 */
export function unsettledInvoiceSql(alias: string): string {
  return `(${alias}.paid_at IS NULL
           OR (${alias}.paid_amount_cents IS NOT NULL
               AND ${alias}.invoiced_amount_cents IS NOT NULL
               AND ${alias}.paid_amount_cents < ${alias}.invoiced_amount_cents))`
}
