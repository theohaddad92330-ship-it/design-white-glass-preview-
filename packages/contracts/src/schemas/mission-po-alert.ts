import { z } from 'zod'
import { poConsumption as poConsumptionFn } from './staffing.js'

/**
 * LE SEUIL D'ANTICIPATION D'UN BON DE COMMANDE (PDF-06 §1.3, PDF-07 §2.6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La barre de consommation savait dire trois choses — volume non renseigné,
 * consommation non mesurée, et DÉPASSEMENT. Les trois se lisent APRÈS coup :
 * quand la barre annonce un dépassement, les jours ont déjà été travaillés hors
 * bon de commande, et la conversation avec le client se tient en position de
 * demandeur. Ce qui manquait est la seule qui vaut de l'argent : **prévenir
 * avant**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN SEUIL EST UN RÉGLAGE, DONC IL VIT À UN SEUL ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `0.9` écrit au milieu d'un composant est un réglage sans nom : le jour où
 * quelqu'un veut 85 %, il en trouve deux sur trois. La valeur vit ICI, elle
 * porte son nom, et sa raison est écrite juste en dessous.
 *
 * **Pourquoi 90 et pas autre chose ?** Un avenant se signe côté client par la
 * même chaîne qu'un bon de commande — achats, juridique, parfois un comité. Le
 * dépôt mesure déjà ce délai ailleurs sous le nom de `noticeDays` (préavis
 * contractuel), mais il porte sur la FIN d'une mission, pas sur son volume.
 * Dix pour cent d'un bon de commande de cinquante jours, c'est cinq jours
 * ouvrés — l'ordre de grandeur d'un aller-retour de signature, et le plus petit
 * matelas qui laisse encore le temps d'agir. Plus bas, l'alerte se déclenche
 * quand la mission est encore à mi-parcours et devient du bruit ; plus haut,
 * elle prévient quand il ne reste plus de marge de manœuvre.
 *
 * La borne est INCLUSE : « pile 90 % » est le cas exact que le seuil existe
 * pour attraper, et une borne exclusive le laisserait passer.
 */
export const PO_AMENDMENT_ALERT_PERCENT = 90

/**
 * Les quatre états d'un bon de commande, du point de vue de son volume.
 *
 * ⚠️ `unmeasured` en PREMIER, et il n'est pas une nuance de `ok` : un bon de
 * commande dont on ignore le volume n'est pas « à 0 % consommé ». Le zéro
 * tomberait du bon côté — vert, rassurant — sur exactement le cas où personne
 * ne sait rien.
 */
export const PO_CONSUMPTION_ALERTS = ['unmeasured', 'ok', 'approaching', 'overrun'] as const
export type PoConsumptionAlert = (typeof PO_CONSUMPTION_ALERTS)[number]

/**
 * L'état d'un bon de commande — et rien de plus.
 *
 * ⚠️ Cette fonction NE RECALCULE PAS le pourcentage. Il arrive déjà calculé par
 * `poConsumption` (`staffing.ts`), qui est le seul endroit du produit où la
 * division a lieu : deux chemins qui la refont divergent, l'un arrondira,
 * l'autre pas, et deux écrans donneront deux pourcentages pour la même
 * question.
 *
 * Elle prend `volumeDays` EN PLUS de `consumption` parce que `poConsumption`
 * rend `null` pour deux raisons distinctes (volume inconnu, consommation non
 * mesurable) et ne dit pas laquelle — c'est écrit dans sa documentation, et
 * c'est délibéré. Ici les deux mènent au même état, mais l'appelant, lui, doit
 * pouvoir les dire différemment à l'écran.
 */
export function poConsumptionAlert(input: {
  volumeDays: number | null | undefined
  consumption: { percent: number; remainingDays: number } | null | undefined
}): PoConsumptionAlert {
  const { volumeDays, consumption } = input
  if (volumeDays === null || volumeDays === undefined) return 'unmeasured'
  if (!consumption) return 'unmeasured'
  // Un dépassement STRICT. Un bon de commande pile épuisé (zéro jour restant)
  // n'a rien dépassé — l'annoncer « dépassé de 0 jour » serait un chiffre faux
  // au moment où le fait, lui, est vrai et urgent.
  if (consumption.remainingDays < 0) return 'overrun'
  return consumption.percent >= PO_AMENDMENT_ALERT_PERCENT ? 'approaching' : 'ok'
}

/**
 * Les FAITS d'une demande d'avenant — ce que le commercial recopie, sans une
 * phrase inventée.
 *
 * ⚠️ Aucun texte ici, et c'est le point. Le corps du message se compose dans
 * l'app, à partir des catalogues i18n : une phrase française rendue par le
 * contrat ne se traduirait jamais, et le produit parle deux langues. Ce que le
 * contrat garantit, c'est que les CHIFFRES envoyés au message sont ceux de la
 * barre — pas une seconde dérivation écrite à côté.
 *
 * ⚠️ Et la demande PRÉPARE, elle n'envoie pas. Il n'y a aucun chemin d'écriture
 * ici, ni ailleurs dans cette famille : ce n'est pas une convention, c'est
 * l'absence de code.
 */
export interface PoAmendmentFacts {
  /** `null` quand la mission n'a pas d'intitulé lisible. */
  missionLabel: string | null
  /** La référence du bon de commande. `null` = non renseignée. */
  poNumber: string | null
  volumeDays: number
  consumedDays: number
  percent: number
  /** Jours restants. Négatif = déjà dépassé — le fait se dit tel quel. */
  remainingDays: number
}

/**
 * Les faits, ou RIEN.
 *
 * `null` dès qu'un terme manque : une demande d'avenant qui annonce « 0 jour
 * restant sur 0 » ne se recopie pas, elle se jette. Mieux vaut ne pas proposer
 * le geste que de le proposer creux.
 */
/**
 * #2783 — L'IMPACT d'une PROLONGATION sur un bon de commande, AVANT que
 * l'avenant ne soit enregistré (épopée « simulation impact avenant »).
 * Compose EXACTEMENT les deux calculs déjà testés (`poConsumption` de
 * `staffing.ts`, `poConsumptionAlert` juste au-dessus) sur une consommation
 * HYPOTHÉTIQUE — jamais un second moteur de pourcentage (GA-26). Le TJM ne
 * change rien à un volume compté en JOURS : seule une prolongation de date
 * (des jours en plus à travailler) déplace la consommation.
 *
 * `null` dès que le volume ou la consommation actuelle est inconnue — un bon
 * de commande sans volume ne projette rien, même piège que
 * `poConsumptionAlert` (« non mesuré » ne se déguise jamais en 0 %).
 */
export function poConsumptionAfterExtension(input: {
  volumeDays: number | null | undefined
  consumedDays: number | null | undefined
  extraDays: number
}): {
  before: { percent: number; remainingDays: number } | null
  after: { percent: number; remainingDays: number } | null
  alertBefore: PoConsumptionAlert
  alertAfter: PoConsumptionAlert
} | null {
  const { volumeDays, consumedDays, extraDays } = input
  if (volumeDays === null || volumeDays === undefined) return null
  if (consumedDays === null || consumedDays === undefined) return null
  if (!Number.isFinite(extraDays) || extraDays < 0) return null
  const before = poConsumptionFn(volumeDays, consumedDays)
  const after = poConsumptionFn(volumeDays, consumedDays + extraDays)
  return {
    before,
    after,
    alertBefore: poConsumptionAlert({ volumeDays, consumption: before }),
    alertAfter: poConsumptionAlert({ volumeDays, consumption: after }),
  }
}

/**
 * #2783 — LE VOLUME DE BONS DE COMMANDE, à l'échelle de l'ESPACE.
 *
 * Jusqu'ici, `poConsumption`/`poConsumptionAlert` ne se lisaient que PAR
 * MISSION (`MissionMarginEngine.tsx`, la fiche mission) — aucune vue
 * n'agrégeait combien de missions approchent ou dépassent leur bon de
 * commande à l'échelle du portefeuille. Cette forme ne recalcule rien : elle
 * COMPTE, pour chaque mission dont le volume est connu, l'état déjà rendu
 * par `poConsumptionAlert` — même énumération, même seuil (`PO_AMENDMENT_ALERT_PERCENT`).
 *
 * `amendments` — les avenants qui touchent CES MÊMES missions (celles dont
 * un bon de commande est suivi), COMPTÉS jamais chiffrés, même raison
 * doctrinale que `ForecastHorizonsService`/`InvoiceReadinessService` (`new_term`
 * est un JSON libre sans contrat de clé vérifiable — en extraire un montant
 * serait deviner).
 */
export const poConsumptionOverviewSchema = z.object({
  ok: z.number().int().nonnegative(),
  approaching: z.number().int().nonnegative(),
  overrun: z.number().int().nonnegative(),
  unmeasured: z.number().int().nonnegative(),
  amendments: z.object({
    accepted: z.number().int().nonnegative(),
    simulated: z.number().int().nonnegative(),
  }),
})
export type PoConsumptionOverview = z.infer<typeof poConsumptionOverviewSchema>

export function poAmendmentFacts(input: {
  missionLabel: string | null
  poNumber: string | null | undefined
  volumeDays: number | null | undefined
  consumedDays: number | null | undefined
  consumption: { percent: number; remainingDays: number } | null | undefined
}): PoAmendmentFacts | null {
  const { volumeDays, consumedDays, consumption } = input
  if (volumeDays === null || volumeDays === undefined) return null
  if (consumedDays === null || consumedDays === undefined) return null
  if (!consumption) return null
  return {
    missionLabel: input.missionLabel,
    poNumber: input.poNumber ?? null,
    volumeDays,
    consumedDays,
    percent: consumption.percent,
    remainingDays: consumption.remainingDays,
  }
}
