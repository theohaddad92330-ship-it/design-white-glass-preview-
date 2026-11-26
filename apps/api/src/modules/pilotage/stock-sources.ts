import type { OpenNeedsQuery } from '@bellum/contracts'

/**
 * LES QUATRE DÉRIVATIONS QUE LA PHOTO VA CHERCHER HORS DE SON MODULE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES PORTS, ET PAS QUATRE IMPORTS DE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le problème est réel et se pose dans cet ordre :
 *
 *  1. La photo ne calcule RIEN. Elle appelle les dérivations que les écrans
 *     appellent, et recopie ce qu'elles rendent. Recopier ici un
 *     `SELECT COUNT(*) … NOT EXISTS (… submissions …)` serait une SECONDE
 *     définition de « besoin sans profil positionné » — et le jour où le
 *     prédicat change d'un côté, la tendance affichée compare deux définitions
 *     différentes sans que rien ne rougisse.
 *  2. Ces dérivations vivent dans `projects`, `delivery` et `consultants`.
 *  3. GA-07 — le cliquet des imports service → service — est à SON PLAFOND
 *     EXACT (243 imports, 119 fichiers, zéro marge). Quatre imports de plus le
 *     feraient rougir, et le relever pour un lot de lecture serait payer une
 *     dette d'architecture pour un confort d'affichage.
 *
 * La sortie prise est la TROISIÈME que le message de la garde nomme
 * elle-même — « passe par un contrat partagé, un événement, ou fais
 * l'orchestration ailleurs » — appliquée à un balayage, qui n'a pas de
 * contrôleur où orchestrer : **le service dépend d'une interface qu'il POSSÈDE,
 * et c'est le module qui branche l'implémentation.**
 *
 * Ce n'est pas un contournement de la garde, c'est ce qu'elle demande : après
 * ce lot, `stock-snapshot.service.ts` ne connaît le nom d'AUCUN service d'un
 * autre module. Le couplage qui reste est un couplage de MODULE (déclaré dans
 * `pilotage.module.ts`, où il est visible et vérifié au démarrage), pas un
 * couplage de code.
 *
 * ⚠️ Chaque port est aussi ÉTROIT que possible : il ne déclare que ce que la
 * photo lit. Un port qui recopierait la signature entière du service ferait
 * revenir le couplage par la fenêtre — et rendrait impossible de savoir, en le
 * lisant, ce que la photo consomme réellement.
 *
 * ⚠️ La preuve que chaque service SATISFAIT son port est faite à la
 * COMPILATION, dans `pilotage.module.ts` : les fournisseurs sont déclarés par
 * `useFactory` avec le port en type de retour. Un `useExisting` n'aurait rien
 * vérifié du tout — le jeton est un symbole, et TypeScript ne le relie à aucune
 * forme.
 */

/* ------------------------------------------------------------------ */
/*  Les besoins sans profil positionné (module `projects`)             */
/* ------------------------------------------------------------------ */

/** Le jeton d'injection de la lecture des besoins ouverts. */
export const OPEN_NEEDS_STOCK_SOURCE = Symbol('OPEN_NEEDS_STOCK_SOURCE')

/**
 * Ce que la photo lit du kanban des besoins.
 *
 * `total` est la POPULATION — les besoins ouverts retenus par le filtre — et
 * `withoutShortlist` le compteur. Les deux sortent du MÊME `QueryBuilder`
 * cloné : c'est ce qui garantit que « 7 sur 41 » porte bien sur les 41 mêmes
 * besoins.
 */
export interface OpenNeedsStockSource {
  list(workspaceId: string, query: OpenNeedsQuery): Promise<{ counters: { total: number; withoutShortlist: number } }>
}

/* ------------------------------------------------------------------ */
/*  Les relevés à valider (module `delivery`)                          */
/* ------------------------------------------------------------------ */

export const TIMESHEET_STOCK_SOURCE = Symbol('TIMESHEET_STOCK_SOURCE')

/**
 * Ce que la photo lit du suivi des relevés.
 *
 * ⚠️ `submitted` — DÉPOSÉ, en attente de validation — et rien d'autre. La
 * dérivation compte `awaiting` (personne n'a déposé) et `rejected` (renvoyé
 * pour correction) à part, exprès : trois états, trois gestes. Les additionner
 * ici referait le fondu que `summarizeTimesheets` a explicitement défait.
 */
export interface TimesheetStockSource {
  month(workspaceId: string, query: { month: string }): Promise<{ summary: { total: number; submitted: number } }>
}

/* ------------------------------------------------------------------ */
/*  Les factures prêtes (module `delivery`)                            */
/* ------------------------------------------------------------------ */

export const INVOICE_READINESS_STOCK_SOURCE = Symbol('INVOICE_READINESS_STOCK_SOURCE')

/**
 * Ce que la photo lit de la préparation de facturation.
 *
 * ⚠️ AUCUN montant. `preparedAmountCents` est une donnée FINANCE, gardée par
 * `redactFinance` (D45) : la photographier ferait de `stock_snapshots` un second
 * endroit où re-tenir cette porte, sur une ligne écrite par un balayage qui ne
 * sait pas qui la lira. Le port ne le déclare donc même pas — retirer le MOYEN
 * vaut mieux que retirer la permission.
 *
 * Les quatre états PARTITIONNENT la population (`summarizeReadiness` a une
 * branche nommée par état, sans `else` fourre-tout), et c'est ce qui rend leur
 * somme utilisable comme dénominateur.
 */
export interface InvoiceReadinessStockSource {
  list(
    workspaceId: string,
    /**
     * ⚠️ `blockedOnly` est EXPLICITE, et le compilateur l'a exigé — il est
     * obligatoire côté dérivation. Le laisser tomber à `undefined` aurait
     * fonctionné (il est lu en position falsy) et aurait été un pari : le jour
     * où quelqu'un en fait un `?? true`, la photo compterait la population
     * BLOQUÉE sous le nom de la population entière, et rien ne rougirait.
     */
    query: { month: string; blockedOnly: boolean },
    options: { canReadFinance: boolean },
  ): Promise<{ summary: { ready: number; blocked: number; invoiced: number; notDue: number } }>
}

/* ------------------------------------------------------------------ */
/*  Les talents disponibles (module `consultants`)                     */
/* ------------------------------------------------------------------ */

export const TALENT_STOCK_SOURCE = Symbol('TALENT_STOCK_SOURCE')

/**
 * Ce que la photo lit du bandeau du vivier.
 *
 * ⚠️ `availableNow` est le disponible DÉRIVÉ des affectations — celui que
 * l'écran affiche. Il n'est PAS `benchAvailable`, qui lit le champ déclaré
 * `consultants.availability` sur un autre prédicat et vient de la chaîne de
 * pilotage. Deux questions différentes, deux photos différentes : les fusionner
 * en croyant dédoublonner ferait mentir l'une des deux tendances.
 */
export interface TalentStockSource {
  stats(workspaceId: string): Promise<{ total: number; availableNow: number }>
}
