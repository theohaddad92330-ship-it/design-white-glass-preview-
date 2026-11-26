import type { DecisionItem, DecisionNature, DecisionNatureStatus, DecisionQueueReport } from '@/lib/decision-queue'

/**
 * Ce que le bloc « Ce qui demande une décision » AFFICHE (#1647).
 *
 * La logique vit ici, hors du `.tsx`, pour la même raison
 * qu'`analyses-heatmap.logic.ts` : l'environnement de test du back-office est
 * `node`, donc ce qui se garde est la LOGIQUE — ce qui se voit à l'écran se
 * recette en direct, parce que jsdom ne met rien en page.
 *
 * ⚠️ TROIS ÉTATS, ET ILS NE DISENT PAS LA MÊME CHOSE :
 *  · **Illisible** — l'API n'a pas répondu. On rend une ERREUR. Une panne ne
 *    rend jamais une file vide : ce serait annoncer que rien ne demande de
 *    décision alors qu'on n'en sait rien.
 *  · **Rien à décider** — « Rien ne demande de décision aujourd'hui », le T2 de
 *    l'issue. Et le compte des natures MESURÉES l'accompagne : « rien » a plus
 *    de valeur quand on sait sur combien de natures ce « rien » porte.
 *  · **Des lignes** — cinq au plus, « + N autres » au-delà.
 */

/** Le bloc du cockpit en montre cinq. Au-delà, ce n'est plus un bloc, c'est un
 *  écran — celui de #1646, qui reprendra cette même dérivation. */
export const LIGNES_AFFICHEES = 5

/** La phrase du T2, à un seul endroit. */
export const RIEN_A_DECIDER = 'Rien ne demande de décision aujourd’hui'

/**
 * Le nom lisible de chaque nature. Une nature sans libellé ne s'explique pas.
 *
 * ⚠️ `flag_matured` (#1667.1) est ici pour que `Record<DecisionNature, string>`
 * reste EXHAUSTIF — le type l'exige — mais elle ne vient JAMAIS remplir
 * `rapport.natures` tant que `apps/api/src/modules/admin/decision-queue.ts`
 * (hors périmètre) ne l'émet pas : voir le docblock de `DecisionNature` dans
 * `@/lib/decision-queue`.
 */
export const LIBELLES: Readonly<Record<DecisionNature, string>> = {
  invoice_missing: 'Facture non émise',
  invoice_unpaid: 'Facture impayée',
  commitment_ending: 'Engagement qui s’achève',
  trial_ending: 'Essai qui se termine',
  churn_risk: 'Espace sans activité',
  credits_exhausted: 'Enveloppe de crédits',
  cost_spike: 'Pic de coût fournisseur',
  queue_stuck: 'File bloquée',
  analysis_failing: 'Analyses en échec',
  feedback_unanswered: 'Retour sans réponse',
  user_suspended_long: 'Suspension sans décision',
  plan_mismatch: 'Usage au-dessus de l’offre',
  flag_matured: 'Flag arrivé à 100 % de rollout',
}

/** Ce que le bloc a besoin de savoir, une fois la file lue. */
interface ResumeDeFile {
  /** Les lignes RENDUES — cinq au plus. */
  lignes: DecisionItem[]
  /** Combien ne tiennent pas dans le bloc. `0` = tout est affiché. */
  reste: number
  /** Combien de natures ont pu être mesurées, sur celles que l'API rend
   *  (`rapport.natures.length` — douze aujourd'hui ; `flag_matured` s'y
   *  ajoutera le jour où #1667.1 est comblée côté API, hors périmètre ici). */
  mesurees: number
  /** Celles qui se taisent FAUTE DE DONNÉE, avec leur raison. */
  muettes: DecisionNatureStatus[]
  /** Celles qui ont mesuré une PARTIE seulement, avec ce qui leur a manqué. */
  amputees: DecisionNatureStatus[]
}

/**
 * Le résumé du bloc.
 *
 * ⚠️ `muettes` n'est pas décoratif. Une nature qui se tait faute de donnée et
 * une nature qui n'a rien trouvé produisent le même vide à l'écran ; sans cette
 * liste, l'opérateur lirait « tout va bien » là où il faut lire « on ne mesure
 * pas ». C'est la règle de #1647 rendue visible, et non seulement appliquée.
 */
export function resumerFile(rapport: DecisionQueueReport): ResumeDeFile {
  const items = rapport.items ?? []
  const natures = rapport.natures ?? []
  return {
    lignes: items.slice(0, LIGNES_AFFICHEES),
    reste: Math.max(0, items.length - LIGNES_AFFICHEES),
    mesurees: natures.filter(nature => nature.measured > 0).length,
    muettes: natures.filter(nature => nature.unmeasured !== null),
    // Les natures qui ont mesuré QUELQUE CHOSE mais pas tout. Sans elles,
    // une panne partielle se lit « rien ne demande de décision ».
    amputees: natures.filter(nature => (nature.partial ?? null) !== null),
  }
}

/**
 * L'ancienneté, telle qu'elle se lit.
 *
 * ⚠️ `null` ne devient PAS « 0 j ». La date de bascule d'une enveloppe de
 * crédits n'est enregistrée nulle part ; écrire « 0 j » dirait « c'est arrivé
 * aujourd'hui », ce qui est faux. On dit qu'on ne sait pas.
 */
export function anciennete(ageDays: number | null): string {
  if (ageDays === null) return 'bascule non datée'
  if (ageDays === 0) return 'aujourd’hui'
  return `depuis ${ageDays} j`
}

/** Le token de couleur d'une gravité. Jamais une valeur hexadécimale. */
export function tokenDeGravite(severity: DecisionItem['severity']): string {
  if (severity === 'danger') return 'var(--red)'
  if (severity === 'warning') return 'var(--amber)'
  return 'var(--muted)'
}
