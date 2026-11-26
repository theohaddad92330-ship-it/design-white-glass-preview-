import { z } from 'zod'
import { relationshipStateSchema, salesRuleCitationSchema } from './sales-context.js'

/**
 * Moteur de cadence multi-touch (Drive #8, méthode Théo).
 *
 * Une fois un contact « touché » (premier email envoyé / marqué contacté), le
 * commercial suit une séquence de relance exécutable. La séquence n'est PAS une
 * constante : elle **découle du scénario relationnel du compte** (restitution
 * TF1 p25 ① ; annexe méthodo p6 « le même signal produit un message et une
 * action différents selon la relation existante »). Un compte froid garde la
 * séquence historique J+1 → J+3 → J+6 → J+9 ; une connexion LinkedIn acceptée
 * suit M1/M2/M3 (annexe p10) ; un partenaire rang 2 est espacé, un besoin
 * ouvert resserré.
 *
 * Les étapes de suivi sont matérialisées en `action_plan_items` datés
 * (`due_date`) : elles réutilisent tel quel le cron « Rappels de relance »
 * (aucun cron dupliqué). Ce contrat décrit ce que renvoie
 * `GET /contacts/:id/cadence` : le scénario, le calendrier complet et la
 * prochaine action.
 */

/** Clé stable d'une étape de la cadence — sert de discriminant côté back
 *  (`action_plan_items.cadence_step`) et de clé de rendu côté front. */
export const cadenceStepKeySchema = z.enum(['initial', 'relance', 'preuve_sociale', 'close_loop'])
export type CadenceStepKey = z.infer<typeof cadenceStepKeySchema>

/** Une étape du calendrier de relance. */
export const cadenceStepSchema = z.object({
  key: cadenceStepKeySchema,
  /** Libellé lisible (« Relance », « Preuve sociale »…). */
  label: z.string(),
  /** Décalage en jours par rapport à la date de premier contact (1/3/6/9). */
  offset_days: z.number().int(),
  /** Échéance calendaire `YYYY-MM-DD` (date d'ancrage + `offset_days`). */
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** L'étape a-t-elle été réalisée (message initial envoyé / item coché) ? */
  done: z.boolean(),
  /** Id de l'`action_plan_item` matérialisé, ou `null` si étape non planifiée
   *  (ex. l'étape initiale, ou une prévisualisation avant contact). */
  item_id: z.string().guid().nullable(),
  /** Le CONTENU prêt à copier de cette touche (annexe méthodo p12 : « une preuve
   *  NEUVE par touche »). Les relances étaient des rappels datés pointant sur le
   *  MÊME email initial — une répétition, pas une séquence. L'IA rédige désormais
   *  un texte propre à chaque touche (relance J+3 preuve neuve, preuve sociale
   *  J+6, close-loop J+9). `null` = un dossier antérieur, ou l'étape initiale
   *  (dont le contenu est l'email lui-même). */
  body: z.string().nullable().default(null),
})
export type CadenceStep = z.infer<typeof cadenceStepSchema>

/** Le patron de cadence choisi pour un scénario relationnel. Chaque clé est un
 *  patron écrit dans l'annexe méthodo (jamais une variante inventée) :
 *   - `standard` .............. compte froid / simplement connu : la séquence
 *                               historique J+1 → J+3 → J+6 → J+9 (annexe p12) ;
 *   - `linkedin_3_touches` .... connexion acceptée : M1 / M2 / M3, stop après
 *                               3 messages (annexe p10) ;
 *   - `referral_short` ........ référé : nommer le référent, demander un
 *                               aiguillage précis, séquence courte (p6) ;
 *   - `reactivation` .......... dormant : réactiver par un signal ou une valeur,
 *                               borne haute J+7 / J+14 (p6 + p12) ;
 *   - `ancien_client_preuve` .. ancien client : capitaliser sur la preuve et
 *                               vérifier ce qui a changé (p6) ;
 *   - `partenaire_rang2` ...... rang 2 : respecter le partenaire en place, donc
 *                               espacer les touches (p6) ;
 *   - `client_expansion` ...... client actif : check-in, foisonnement BU
 *                               adjacente, revue renouvellement / REX (p6) ;
 *   - `besoin_ouvert` ......... besoin ouvert : qualification, push profil,
 *                               next step daté (p6). */
export const cadenceTemplateKeySchema = z.enum([
  'standard',
  'linkedin_3_touches',
  'referral_short',
  'reactivation',
  'ancien_client_preuve',
  'partenaire_rang2',
  'client_expansion',
  'besoin_ouvert',
  // #2371.4 (#2887) — partenaire actif : échange entre pairs, touches espacées.
  'partenaire_actif',
])
export type CadenceTemplateKey = z.infer<typeof cadenceTemplateKeySchema>

/** Pourquoi CETTE cadence : l'état de relation lu sur le compte, le patron qui
 *  en découle, et la citation règle + preuve exigée p31 (« chaque reco cite la
 *  règle, le profil et les preuves »). L'état est repris tel quel du
 *  `SalesContext` du dossier quand il existe ; à défaut il est dérivé de la
 *  colonne kanban du compte ; sinon `froid` sans preuve. */
export const cadenceScenarioSchema = z.object({
  state: relationshipStateSchema,
  template: cadenceTemplateKeySchema,
  citation: salesRuleCitationSchema,
})
export type CadenceScenario = z.infer<typeof cadenceScenarioSchema>

/** Réponse de `GET /contacts/:id/cadence`. */
export const contactCadenceSchema = z.object({
  contact_id: z.string().guid(),
  /** Le scénario relationnel qui a produit ce calendrier (jamais implicite). */
  scenario: cadenceScenarioSchema,
  /** `true` dès que le contact a été touché (premier email envoyé). */
  contacted: z.boolean(),
  /** Date de premier contact `YYYY-MM-DD` (ancre de la cadence), ou `null` si
   *  jamais contacté — le calendrier est alors une prévisualisation à partir
   *  d'aujourd'hui. */
  anchor_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  /** `true` si les étapes de suivi sont matérialisées en items datés (donc
   *  couvertes par le cron de rappels). */
  scheduled: z.boolean(),
  /** Le calendrier complet (les 4 touches), ordonné par échéance croissante. */
  steps: z.array(cadenceStepSchema),
  /** La prochaine étape à jouer (première non-faite), ou `null` si terminé. */
  next_step: cadenceStepSchema.nullable(),
})
export type ContactCadence = z.infer<typeof contactCadenceSchema>
