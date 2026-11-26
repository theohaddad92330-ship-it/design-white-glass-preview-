import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Photo mensuelle des indicateurs de STOCK (D2 · 26/08, D49 · 26/08) */
/* ------------------------------------------------------------------ */

/**
 * Ce que ce module photographie, et surtout ce qu'il NE photographie PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PARTAGE : FLUX / STOCK
 * ─────────────────────────────────────────────────────────────────────────────
 * Un indicateur de **FLUX** est daté par son événement (`created_at`,
 * `email_sent_at`, `paid_at`…). Sa comparaison d'un mois à l'autre se RECALCULE
 * à volonté : c'est ce que fait `ManagerService.monthlyTrend`, où `current` et
 * `previous` sortent de la même requête, de la même table et du même `WHERE`,
 * seule la fenêtre du `FILTER` changeant. Un flux n'a donc **aucun** besoin de
 * photo, et lui en donner une créerait une **seconde vérité** : deux chiffres
 * pour la même question, dont l'un vieillit.
 *
 * Un indicateur de **STOCK** est l'état courant d'une colonne que l'écriture
 * suivante ÉCRASE. `contacts.email` renseigné efface « ce contact n'avait pas
 * d'adresse » ; `consultants.availability` mise à jour efface la disponibilité
 * d'hier ; `accounts.commercial_status` passé à `customer` efface la date à
 * laquelle il ne l'était pas. Rien, dans la base, ne permet de reconstituer
 * l'état d'il y a un mois. Sans photo, la comparaison est **impossible** — pas
 * approximative : impossible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ ÉCARTÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre candidats sont sortis de la liste à la mesure, et chacun pour une
 * raison différente :
 *
 *  · **le DSO** — `RevenueService.dso` lit `invoice_readiness.invoiced_at` et
 *    `paid_at`, deux dates. Le DSO d'il y a un mois se recalcule en bornant
 *    `paid_at`. C'est un flux déguisé en stock.
 *  · **la marge** — `RevenueService.aggregate` et `marginByChannel` prennent
 *    déjà un `month` en paramètre et lisent `mission_timesheets.period_month`.
 *    Le mois dernier est à un argument de distance.
 *  · **les doublons non tranchés** (`unresolved_duplicates`) — `duplicate_pairs`
 *    porte `created_at`, `decision` ET `decided_at`. « En attente au 1er mars »
 *    s'écrit `created_at < D AND (decided_at IS NULL OR decided_at >= D)`.
 *  · **`contacts_to_enrich`** — c'en est un, mais il n'est ni dérivé ni affiché
 *    ici : `ContactsService.countToEnrichByUser` alimente le cockpit du tableau
 *    de bord. Le photographier depuis ce module supposerait de recopier son SQL
 *    (deux définitions pour un chiffre, GA-26) ou d'afficher sa tendance sur un
 *    écran qui n'appartient pas à ce lot. Son jumeau côté pilotage,
 *    `contacts_without_email`, est photographié, lui.
 */
export const STOCK_METRIC_KEYS = [
  /* --- Chaîne de pilotage (`PilotageService.gatherInputs`) --- */
  /** Consultants poussables MAINTENANT. `consultants.availability` est écrasée
   *  à chaque mise à jour : le vivier d'il y a un mois n'existe plus. */
  'benchAvailable',
  /** Comptes en `commercial_status = 'customer'`. Aucune table d'historique de
   *  statut commercial n'existe — le passage à client n'est pas daté. */
  'activeClients',
  /* --- Hygiène des données (`DataHygieneService.overview`) --- */
  /** Comptes suivis sans tâche ouverte à venir. Deux moitiés non datées : le
   *  `commercial_status` qui définit « suivi », et le statut de la tâche. */
  'accounts_without_next_action',
  /** `contacts.email` renseignée efface l'absence d'hier. */
  'contacts_without_email',
  /** `opportunities.amount_cents` et `stage`, toutes deux écrasées. */
  'projects_without_amount',
  /** `missions.ends_on` saisie efface le trou d'hier. */
  'missions_without_end_date',
  /** `project_needs.skills` complétées effacent le manque d'hier. */
  'needs_without_skills',
  /** `consultants.availability` — la même colonne écrasée que `benchAvailable`,
   *  lue par l'autre bout. */
  'talents_unknown_availability',
  /** `mission_commercial_terms.loaded_daily_cost_cents` saisi efface l'absence. */
  'missions_without_cost',
  /* --- Stocks de TRAVAIL (31/08/2026) — ce que les cinq écrans comparent ---
   *
   * Les neuf du dessus sortaient tous des deux dérivations du module `pilotage`,
   * et c'était la limite du service de photo, pas un choix de produit : le
   * kanban des besoins, l'administration des ventes, le vivier, les comptes et
   * le suivi des missions montrent des compteurs de TRAVAIL, et affichaient tous
   * « non mesuré » sur leur variation faute que rien ne les photographie.
   *
   * ⚠️ Les quatre sont AJOUTÉS EN FIN (GA-08) et leur contrainte SQL a été
   * élargie avant ce code (`1791009000001-StockSnapshotWorkKeys`, GA-11/GA-12).
   */
  /** Besoins ouverts sans AUCUN profil positionné. `submissions` créée efface le
   *  manque d'hier, et le besoin lui-même se ferme : rien ne permet de
   *  reconstituer « combien étaient orphelins au 1er mars ». */
  'needs_without_positioning',
  /** Relevés DÉPOSÉS, en attente de validation. La colonne de statut est
   *  écrasée à chaque geste — valider efface « il attendait ». */
  'timesheets_to_validate',
  /** Missions du mois prêtes à facturer. `invoice_readiness.state` passe à
   *  `invoiced` et l'état « prête » disparaît sans laisser de date. */
  'invoices_ready',
  /** Talents disponibles MAINTENANT, au sens DÉRIVÉ des affectations — celui
   *  que le bandeau du vivier affiche. ⚠️ Distinct de `benchAvailable`, qui lit
   *  le champ DÉCLARÉ `consultants.availability` sur un autre prédicat : deux
   *  questions différentes, deux photos différentes, et c'est écrit ici pour que
   *  personne ne les fusionne en croyant dédoublonner. */
  'talents_available',
] as const
export type StockMetricKey = (typeof STOCK_METRIC_KEYS)[number]

/**
 * D'où sort une photo — LA dérivation qui la produit.
 *
 * Elle sert de FILTRE aux réponses qui portent une base de comparaison : la
 * chaîne ne rapporte que ses deux stocks, la vue Qualité que ses sept. Une
 * tendance servie à côté d'un chiffre absent de l'écran est un chiffre que
 * personne ne peut vérifier.
 *
 * ⚠️ Les quatre familles ajoutées le 31/08/2026 ne sont rapportées par AUCUNE
 * réponse d'écran : elles se lisent par la série (`GET /pilotage/metric-series`),
 * qui rend tout l'historique sans filtrer. C'est voulu — un compteur de travail
 * vit sur SON écran, pas sur celui du pilotage.
 */
export const STOCK_METRIC_SOURCES = ['chain', 'hygiene', 'needs', 'timesheets', 'readiness', 'talents'] as const
export type StockMetricSource = (typeof STOCK_METRIC_SOURCES)[number]

/**
 * D'où sort chaque photo — la clé de la photo EST la clé de sa dérivation.
 *
 * Ce n'est pas une coquetterie de nommage. Une table de correspondance entre
 * « la clé qu'on stocke » et « la clé qu'on lit » est exactement l'endroit où
 * une divergence s'installe sans bruit : le jour où quelqu'un renomme un
 * indicateur, la photo continue d'écrire l'ancien nom et la comparaison
 * s'éteint en silence. Ici, l'extraction cherche le MÊME littéral que celui que
 * l'écran affiche, et une clé qui disparaît de la source fait tomber le test.
 *
 * `chain` = un `PilotageMetric` du rapport de chaîne ;
 * `hygiene` = une `HygieneLine` de la vue Qualité.
 */
export const STOCK_METRIC_SOURCE: Record<StockMetricKey, StockMetricSource> = {
  benchAvailable: 'chain',
  activeClients: 'chain',
  accounts_without_next_action: 'hygiene',
  contacts_without_email: 'hygiene',
  projects_without_amount: 'hygiene',
  missions_without_end_date: 'hygiene',
  needs_without_skills: 'hygiene',
  talents_unknown_availability: 'hygiene',
  missions_without_cost: 'hygiene',
  needs_without_positioning: 'needs',
  timesheets_to_validate: 'timesheets',
  invoices_ready: 'readiness',
  talents_available: 'talents',
}

/**
 * La PROVENANCE écrite sur chaque ligne photographiée.
 *
 * Elle voyage avec la valeur, et non dans un tableau à part, parce qu'une photo
 * doit rester lisible le jour où sa dérivation change : « ce 42 vient de la
 * requête d'août 2026 » est une information qu'aucune relecture du code
 * d'aujourd'hui ne peut redonner. C'est la même raison qui fait porter à un
 * fait sa source ET sa date (primitive `Provenance`).
 *
 * ⚠️ Les chemins sont vérifiés sur le disque par `stock-snapshot.service.spec.ts` :
 * une provenance qui désigne un fichier disparu est une piste morte, donc pire
 * qu'une absence de provenance.
 */
export const STOCK_METRIC_PROVENANCE: Record<StockMetricKey, string> = {
  benchAvailable: 'apps/api/src/modules/pilotage/pilotage.service.ts#gatherInputs.benchAvailable',
  activeClients: 'apps/api/src/modules/pilotage/pilotage.service.ts#gatherInputs.activeClients',
  accounts_without_next_action:
    'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.accounts_without_next_action',
  contacts_without_email: 'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.contacts_without_email',
  projects_without_amount: 'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.projects_without_amount',
  missions_without_end_date: 'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.missions_without_end_date',
  needs_without_skills: 'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.needs_without_skills',
  talents_unknown_availability:
    'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.talents_unknown_availability',
  missions_without_cost: 'apps/api/src/modules/pilotage/data-hygiene.service.ts#QUERIES.missions_without_cost',
  needs_without_positioning: 'apps/api/src/modules/projects/open-needs.service.ts#list.counters.withoutShortlist',
  timesheets_to_validate: 'apps/api/src/modules/delivery/timesheets.service.ts#month.summary.submitted',
  invoices_ready: 'apps/api/src/modules/delivery/invoice-readiness.service.ts#list.summary.ready',
  talents_available: 'apps/api/src/modules/consultants/talent.service.ts#stats.availableNow',
}

/**
 * La base de comparaison servie à l'écran : les photos du mois PRÉCÉDENT.
 *
 * Ce que l'API rend est **la photo, et rien d'autre**. La valeur courante reste
 * celle que l'écran affiche déjà, tirée de sa propre lecture — c'est ce qui
 * garantit, structurellement, que le chiffre comparé est le chiffre montré.
 * Servir les deux depuis ici aurait ouvert la porte au défaut classique : deux
 * lectures de la même question qui divergent d'une seconde à l'autre.
 *
 * ⚠️ Une clé ABSENTE de `values` veut dire « aucune photo », et jamais « zéro ».
 * C'est la raison pour laquelle `values` est partielle plutôt que remplie de
 * `null` : un `null` se recopie en `0` à la première étourderie, une clé absente
 * ne se recopie pas.
 */
export const stockBaselineSchema = z.object({
  /** Le mois photographié, `YYYY-MM`, ou `null` quand aucune photo n'existe. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  /** Le jour EXACT de la photo (dernier jour du mois), `YYYY-MM-DD`. */
  takenOn: z.string().nullable(),
  values: z.record(z.string(), z.number()),
  /**
   * La POPULATION sur laquelle chaque valeur a été mesurée — « 7 sur 42 comptes
   * suivis » (31/08/2026). Même règle que `values` : une clé ABSENTE veut dire
   * « aucune population lue », jamais « population vide ». Les deux se
   * ressembleraient à `0`, et c'est précisément la confusion qu'on refuse.
   *
   * Facultative : les photos prises avant le 31/08/2026 n'en portent pas, et une
   * base de comparaison sans population reste parfaitement lisible — elle dit
   * juste moins.
   */
  denominators: z.record(z.string(), z.number()).optional(),
})
export type StockBaseline = z.infer<typeof stockBaselineSchema>

/**
 * La photo d'un indicateur, ou `null` — la SEULE porte de lecture.
 *
 * Elle existe parce que `Record<string, number>` ment au typage : sans
 * `noUncheckedIndexedAccess`, `values['activeClients']` se déclare `number`
 * alors qu'il vaut `undefined` dès qu'aucune photo n'a été prise. Un écran qui
 * fait confiance à ce type écrit « −100 % » le premier mois. Ici, l'absence
 * porte un nom et un type : `null`.
 *
 * ⚠️ `null` et non `0`. Un mois sans photo n'est pas un mois à zéro.
 */
export function stockBaselineValue(baseline: StockBaseline | undefined | null, key: StockMetricKey): number | null {
  const value = baseline?.values?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Le jour que porte la photo d'un mois : son DERNIER jour.
 *
 * Le balayage tourne le 1er à 03:00, et il photographie le mois qui vient de se
 * terminer. Dater la ligne du 1er aurait été plus simple à écrire et faux à
 * lire : pendant tout le mois de mars, l'écran compare la valeur d'aujourd'hui
 * à celle du **28 février**, et c'est exactement ce que « vs mois précédent »
 * veut dire. Une photo datée du 1er mars aurait annoncé une comparaison avec
 * mars pendant qu'on comparait avec février.
 *
 * ⚠️ Le calcul passe par UTC (`Date.UTC`) : une date nue interprétée dans le
 * fuseau local recule d'un jour à l'ouest de Greenwich, et la photo de janvier
 * s'appellerait alors « 30 janvier ».
 */
export function previousMonthLastDay(now: Date): string {
  const firstOfCurrentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  return new Date(firstOfCurrentMonth - 86_400_000).toISOString().slice(0, 10)
}

/** Le mois `YYYY-MM` d'un jour `YYYY-MM-DD`. */
export function monthOf(takenOn: string): string {
  return takenOn.slice(0, 7)
}

/**
 * Le jour que porte la photo d'il y a `monthsBack` mois.
 *
 * `monthsBack = 1` rend exactement `previousMonthLastDay` — c'est le même
 * calcul, généralisé, et il DÉLÈGUE plutôt que de refaire l'arithmétique. Deux
 * chemins qui décalent un mois chacun de leur côté divergent sur les mois de
 * 31 jours et sur février : `Date.UTC(2026, 0, 31)` reculé d'un mois donne le
 * 3 mars, pas le 28 février.
 *
 * Sert à lire une série (« vs N-1 » = douze mois en arrière) et à semer
 * plusieurs mois dans la salle de démonstration.
 */
export function monthsBackLastDay(now: Date, monthsBack: number): string {
  return previousMonthLastDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1, 1)))
}
