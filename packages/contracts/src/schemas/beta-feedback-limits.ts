/**
 * LES BORNES DU WIDGET DE SIGNALEMENT — un réglage vit à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le plafond du message était écrit UNE fois, dans le schéma Zod de l'API
 * (`max(5000)`), et le `<textarea>` du widget n'en savait rien : aucun
 * `maxLength`, aucun compteur. Un signalement plus long partait, se faisait
 * refuser en **400 brut**, et le texte était perdu.
 *
 * Ce n'est pas théorique. Mesuré le 02/09/2026 sur les 21 retours ouverts :
 * le plus long faisait **4 827 caractères**, soit 96 % du plafond. Les
 * signalements de ce dépôt ne sont plus des phrases mais des cahiers des
 * charges de 250 lignes ; le prochain passait à la trappe.
 *
 * La trace était d'ailleurs déjà dans les corps : `POST /feedback → 400`
 * apparaît dans le tableau « Requêtes en échec » de seize issues sur vingt et
 * une, sans que personne ne l'ait lu — c'est une tentative refusée avant celle
 * qui a fini par passer.
 *
 * Les autres tampons du widget (console, fil d'Ariane, requêtes en échec,
 * markup de l'élément) sont DÉJÀ bornés côté client, sous les plafonds de
 * l'API. Le message était le seul champ libre.
 */

/** Le plafond du corps d'un signalement, en caractères. */
export const FEEDBACK_MESSAGE_MAX = 5000

/**
 * À partir d'où le compteur s'affiche.
 *
 * Un compteur permanent sur un champ qu'on remplit rarement à moitié est du
 * bruit ; un compteur qui n'apparaît jamais ne prévient de rien. Il se montre
 * dans le dernier cinquième — soit à partir de 4 000 caractères, c'est-à-dire
 * exactement là où se trouvaient les retours du 02/09.
 */
export const FEEDBACK_MESSAGE_WARN_AT = Math.round(FEEDBACK_MESSAGE_MAX * 0.8)
