import { z } from 'zod'

/**
 * Les paramètres d'URL que `/billing` accepte — l'intention avec laquelle on
 * arrive, ET le retour de la page de paiement.
 *
 * **Pourquoi le schéma vit ici et plus dans le fichier de route.** Un fichier
 * posé dans `src/routes/` EST une route pour le routeur : un test à côté de la
 * route deviendrait une page de l'application. Le schéma descend donc dans la
 * fonctionnalité, où il se teste, et la route l'importe.
 *
 * **Les deux défauts que ce schéma corrige** (mesurés le 15/09/2026) :
 *
 *  1. `success`, `canceled` et `setup` n'étaient pas déclarés. Zod jette en
 *     SILENCE une clé inconnue : le retour de la caisse n'atteignait donc
 *     jamais l'application, et un client revenu d'un paiement réussi lisait
 *     l'écran qu'il venait de quitter, inchangé.
 *  2. `topup` portait `z.boolean()`, et le serveur renvoie `?topup=success`.
 *     Zod ne strippe pas une clé CONNUE de mauvais type, il LÈVE — donc un
 *     retour de recharge payée tombait sur l'erreur de validation de la route.
 *
 * La cause commune des deux : `topup` porte deux choses. L'intention « ouvre la
 * recharge » (`?topup=true`, posée par la carte d'upsell) et le retour de la
 * caisse (`?topup=success|canceled`). C'est `resolveCheckoutReturn`, dans les
 * contrats, qui sait les distinguer — jamais un `if` écrit ici.
 */

/**
 * Une clé qui porte soit une INTENTION booléenne, soit un mot de RETOUR.
 *
 * On accepte large et on interprète à un seul endroit : un schéma qui
 * n'accepterait que les deux mots connus casserait la route le jour où le
 * fournisseur de paiement en ajoute un troisième — alors que la bonne réponse à
 * un mot inconnu est « aucun retour observé », pas un écran d'erreur.
 */
const intentOrOutcome = z.union([z.boolean(), z.string()]).optional()

export const billingSearchSchema = z.object({
  /** Intention : ouvrir la grille des offres. */
  offers: z.boolean().optional(),
  /** Intention (`true`) OU retour de recharge (`success` / `canceled`). */
  topup: intentOrOutcome,
  /** Retour d'abonnement payé. */
  success: intentOrOutcome,
  /** Retour d'abonnement abandonné avant paiement — rien n'a été débité. */
  canceled: intentOrOutcome,
  /** Retour d'enregistrement de carte (`success` / `canceled`), sans débit. */
  setup: intentOrOutcome,
})
