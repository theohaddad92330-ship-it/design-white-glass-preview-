// Client de la file de décision (GET /internal/admin/decision-queue, gardé par
// InternalSecretGuard). Appelé CÔTÉ SERVEUR uniquement — le secret interne ne
// doit jamais atteindre le navigateur. Même forme que src/lib/client-health.ts.
//
// ⚠️ AUCUNE ÉCRITURE ICI. On lit une file. Chaque ligne porte UNE action, qui
// est un LIEN vers l'écran où le geste existe déjà, avec sa propre capacité et
// son propre journal (#1647).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Les douze natures de #1647, telles que l'API les nomme — PLUS `flag_matured`
 * (#1667.1, treizième, ajoutée EN FIN de liste : GA-40, un ordre figé
 * n'insère jamais au milieu).
 *
 * ⚠️ `flag_matured` est un TYPE DÉCLARÉ, PAS UNE CAPACITÉ LIVRÉE. Elle
 * n'apparaîtra dans aucun `DecisionQueueReport` tant que deux choses
 * manquantes restent manquantes, aucune des deux dans le périmètre de ce lot :
 *  1. `apps/api/src/modules/admin/decision-queue.ts` (la SEULE source du
 *     douzet actuel) est hors périmètre — un autre agent y travaille en même
 *     temps.
 *  2. Même si ce fichier était ouvert, la donnée qui dirait « ce flag est à
 *     100 % depuis plus de 90 jours » n'existe NULLE PART : le SDK Reflag
 *     (`@reflag/node-sdk` 1.7.0) ne porte ni historique de bascule ni date
 *     d'activation sur une définition de flag (voir
 *     `apps/dashboard-manager/src/app/flags/_components/flag-coverage.ts`) —
 *     il faudrait une collecte NEUVE (observer le rollout et horodater le
 *     premier passage à 100 %), qu'aucun cron n'effectue aujourd'hui.
 * Le nom existe ici pour que le CONTRAT soit prêt le jour où ces deux
 * absences sont comblées — un type qui anticipe n'est pas une donnée
 * inventée, c'est un vide déclaré.
 */
export type DecisionNature =
  | 'invoice_missing'
  | 'invoice_unpaid'
  | 'commitment_ending'
  | 'trial_ending'
  | 'churn_risk'
  | 'credits_exhausted'
  | 'cost_spike'
  | 'queue_stuck'
  | 'analysis_failing'
  | 'feedback_unanswered'
  | 'user_suspended_long'
  | 'plan_mismatch'
  | 'flag_matured'

/** Local : ne voyage que dans `DecisionItem` (knip). */
type DecisionSubject = {
  kind: 'workspace' | 'user' | 'queue' | 'provider' | 'feedback' | 'platform'
  id: string
  label: string
}

/** Local : ne voyage que dans `DecisionItem` (knip). */
type DecisionAction = { label: string; href: string }

/** Une ligne de la file — les cinq champs de #1647, et rien de plus. */
export type DecisionItem = {
  nature: DecisionNature
  subject: DecisionSubject
  /** Le détail CHIFFRÉ. L'API refuse d'émettre une ligne qui n'en porte pas. */
  detail: string
  /**
   * ⚠️ `number | null` et le RESTE jusqu'à l'écran. `null` = la date de bascule
   * n'est enregistrée nulle part ; un `?? 0` ici écrirait « aujourd'hui », ce
   * qui serait faux, et annulerait la règle que toute l'API applique.
   */
  ageDays: number | null
  severity: 'danger' | 'warning' | 'info'
  action: DecisionAction
}

/**
 * L'état d'une nature.
 *
 * ⚠️ `unmeasured` est la moitié qui compte : « mesuré, rien à signaler » et
 * « pas mesurable » ne se lisent pas pareil. Une file vide parce qu'on ne sait
 * rien n'est pas une file vide parce que tout va bien.
 */
export type DecisionNatureStatus = {
  nature: DecisionNature
  measured: number
  raised: number
  unmeasured: string | null
  /**
   * Ce qui n'a PAS pu être lu alors que le reste l'a été. `null` s'il ne manque
   * rien. ⚠️ Ce champ existe parce que `unmeasured` se TAIT dès qu'une seule
   * chose a été mesurée : trois files sur cinq répondent, deux sont muettes, et
   * l'écran annoncerait « mesuré, rien à signaler » sur un périmètre amputé.
   */
  partial?: string | null
}

export type DecisionQueueReport = {
  items: DecisionItem[]
  /** Les douze, toujours, dans l'ordre figé par l'API. */
  natures: DecisionNatureStatus[]
}

/**
 * Lit la file de décision.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, et l'écran DIT qu'il
 * n'a pas la donnée. Une liste vide se lirait « rien ne demande de décision »,
 * ce qui est exactement le contresens que #1647 interdit.
 */
export async function fetchDecisionQueue(): Promise<DecisionQueueReport> {
  const res = await fetch(`${REAL_BASE}/internal/admin/decision-queue`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`decision-queue a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as DecisionQueueReport
}
