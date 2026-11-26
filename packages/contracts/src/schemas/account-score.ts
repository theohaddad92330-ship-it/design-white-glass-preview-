/**
 * Canonical account-score verdict from the /10 ``priority_score``.
 *
 * Single source of truth for the front: the /10 column is a BAND-FAITHFUL
 * projection of the /25 account fit score (03_BUSINESS_RULES §1), so these
 * cutoffs are the SAME split as the /25 bands and the ``priority_score`` bucket
 * (chaud/moyen/froid). Every label / colour that reads ``priority_score`` MUST
 * go through here — else a PRUDENT account shows as "GO" on one screen and
 * "PRUDENT" on another (the divergence the reconciliation fixed).
 *
 * Keep in sync with the Python mirror ``account_score.py`` (``GLOBAL_GO_MIN`` /
 * ``GLOBAL_PRUDENT_MIN`` / ``legacy_global_score``).
 */

/** /10 ≥ 7 → GO (chaud). */
export const ACCOUNT_SCORE_GO_MIN = 7
/** /10 in [5, 7) → PRUDENT (moyen); below → NO-GO (froid). */
export const ACCOUNT_SCORE_PRUDENT_MIN = 5

/** ``EXPLORER`` (Annexe méthodo p25) = real potential the confidence can't yet
 *  confirm → "collecter l'info". It is NOT a /10 band: it only ever arrives on the
 *  IA-emitted verdict string (a data-missing dossier), so `accountVerdictFromScore`
 *  never returns it — use {@link normalizeStoredVerdict} to render a stored verdict. */
/**
 * #4016.L9.a — LE PLANCHER D'UN SCORE DE COMPTE : DEUX AXES ÉVALUABLES.
 *
 * ⚠️ RENVERSEMENT DATÉ du 13/10/2026 (Louis, QCM : « un score s'affiche dès 2
 * axes évaluables, toujours avec son nombre d'axes »). Avant : trois axes
 * (doctrine c26, `DOSSIER_SCORE_MIN_MEASURED_AXES = 3`). Le plancher vit ICI,
 * à un seul endroit (GA-26) ; le score du dossier en sept axes le reprend.
 *
 * Ce qui ne bouge pas : sous le plancher, il n'y a PAS de score (les axes
 * connus restent visibles) ; au-dessus, le score dit TOUJOURS sur combien
 * d'axes il repose (« 2 axes sur 7 évalués ») et nomme ceux qui manquent.
 * Ce plancher ne concerne que le score de COMPTE : le matching consultant, le
 * verdict de besoin et Découvrir gardent `MIN_AXES_FOR_SCORE` (3).
 */
export const ACCOUNT_SCORE_MIN_EVALUATED_AXES = 2

/** #4016.L9.a — un score de compte se montre-t-il, vu le nombre d'axes évaluables ? */
export function accountScoreIsShowable(evaluatedAxes: number): boolean {
  return Number.isFinite(evaluatedAxes) && evaluatedAxes >= ACCOUNT_SCORE_MIN_EVALUATED_AXES
}

export type AccountVerdict = 'GO' | 'PRUDENT' | 'NO-GO' | 'EXPLORER'

/** GO / PRUDENT / NO-GO from the /10 ``priority_score``. ``null`` score → null.
 *  Never EXPLORER — that verdict is not derivable from the score alone. */
export function accountVerdictFromScore(score: number | null | undefined): Exclude<AccountVerdict, 'EXPLORER'> | null {
  if (score == null) return null
  if (score >= ACCOUNT_SCORE_GO_MIN) return 'GO'
  if (score >= ACCOUNT_SCORE_PRUDENT_MIN) return 'PRUDENT'
  return 'NO-GO'
}

/** Map an IA-emitted verdict string (GO/PRUDENT/STOP/EXPLORER, or the legacy
 *  GO/CONDITIONNEL/NO-GO) onto the display {@link AccountVerdict}. ``STOP`` and the
 *  legacy ``NO-GO``/``CONDITIONNEL`` fold to their display equivalents; EXPLORER is
 *  preserved. Unknown/empty → null (fall back to the /10-derived badge). */
export function normalizeStoredVerdict(verdict: string | null | undefined): AccountVerdict | null {
  switch ((verdict ?? '').trim().toUpperCase()) {
    case 'GO':
      return 'GO'
    case 'PRUDENT':
    case 'CONDITIONNEL':
      return 'PRUDENT'
    case 'STOP':
    case 'NO-GO':
      return 'NO-GO'
    case 'EXPLORER':
      return 'EXPLORER'
    default:
      return null
  }
}

/**
 * Le verdict AFFICHÉ d'un dossier : ce que le badge sous le score doit dire.
 *
 * Il y avait deux verdicts qui pouvaient diverger sur le même écran. Le badge
 * était calculé par {@link accountVerdictFromScore} — une projection du /10, qui
 * ne rend JAMAIS `EXPLORER`. Mais l'IA écrit son propre verdict dans le dossier
 * (`evaluation.go_no_go`), et sur un compte à données manquantes ce verdict est
 * précisément `EXPLORER`. Résultat vu sur TF1 : le donut affiche « 3/10 → NO-GO »
 * pendant que la justification juste au-dessous conclut « Verdict attendu : EXPLORER ».
 *
 * La règle : le verdict de l'IA fait foi dès qu'il est lisible ; le dérivé /10
 * n'est qu'un filet quand l'IA n'a rien émis (dossier ancien, verdict vide ou
 * inconnu). C'est le SEUL point où l'on tranche, pour que les trois écrans qui
 * montrent ce badge (aperçu, lecture Bellum, onglet Score) s'accordent.
 */
export function accountDisplayVerdict(
  score: number | null | undefined,
  storedVerdict: string | null | undefined,
): AccountVerdict | null {
  return normalizeStoredVerdict(storedVerdict) ?? accountVerdictFromScore(score)
}

/**
 * #2932 (#2304.12-.16) — les CINQ catégories MÉTIER du verdict de compte, pour
 * un lecteur qui n'a jamais vu GO/PRUDENT/STOP/EXPLORER. Mirror TS de
 * `named_verdict()` (`apps/ia/app/services/account_score.py`, livré par cette
 * épopée) — jusqu'ici branché uniquement côté chat (`build_account_briefing`,
 * `chat_tools.py`), jamais sur les écrans web : le badge « Verdict » de la
 * fiche compte restait replié sur l'ancien libellé legacy `NO-GO` via
 * {@link accountDisplayVerdict}. Constaté en recette écran le 27/09/2026 sur
 * une analyse fraîche de Capital Recrutement.
 */
export type NamedAccountVerdict =
  | 'AGIR MAINTENANT'
  | 'QUALIFIER'
  | 'RÉSERVE'
  | 'METTRE EN VEILLE'
  | 'ÉCARTER POUR CET OBJECTIF'

export const NAMED_ACCOUNT_VERDICTS: readonly NamedAccountVerdict[] = [
  'AGIR MAINTENANT',
  'QUALIFIER',
  'RÉSERVE',
  'METTRE EN VEILLE',
  'ÉCARTER POUR CET OBJECTIF',
]

/**
 * #3818.1 — l'espace a-t-il renseigné un objectif commercial (un domaine
 * d'offre) ? Seule source : `offer_domain` (singulier, historique) ou
 * `offer_domains` (portefeuille DATAFORGE) — là où ce réglage vit et nulle
 * part ailleurs (`offer-portfolio.ts` : « Le portefeuille de DOMAINES vit
 * dans esn_profiles.offer_domains et nulle part ailleurs », GA-26). Mirror
 * TS de `_profile_has_objective` (`chat_tools.py`) — même lecture, jamais un
 * second calcul. Sans profil du tout (`null`/`undefined`), pas d'objectif
 * renseigné.
 */
export function hasOfferObjective(
  answers: { offer_domain?: string | null; offer_domains?: readonly string[] | null } | null | undefined,
): boolean {
  return Boolean(answers?.offer_domain) || (answers?.offer_domains?.length ?? 0) > 0
}

/**
 * #3818 — sans objectif renseigné dans l'espace, un STOP ne peut légitimement
 * dire « ÉCARTER POUR CET OBJECTIF » : il n'y a pas de "cet objectif" contre
 * lequel juger. Mirror TS de `VERDICT_SOURCE_DOWN` / `VERDICT_ZERO_MEASURED` /
 * `VERDICT_INCOMPATIBILITY_ESTABLISHED` (`account_score.py`) — trois issues
 * distinctes, jamais fondues, en dehors des cinq catégories de l'épopée (elles
 * ne remplacent PAS `NAMED_ACCOUNT_VERDICTS`, qui reste exactement les cinq).
 */
export type UnarbitratedAccountVerdict =
  | 'ÉVALUATION PERSONNALISÉE INDISPONIBLE — SOURCE EN PANNE'
  | 'ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ'
  | 'INCOMPATIBILITÉ ÉTABLIE'

/**
 * Projection DÉTERMINISTE de {@link AccountVerdict} (la famille déjà résolue
 * par {@link accountDisplayVerdict}) vers les cinq catégories métier — jamais
 * un second jugement du modèle, même principe que `named_verdict` lui-même.
 * `hasNoGoTrigger` sépare les deux visages de `NO-GO` (STOP) sur le seul fait
 * qui les distingue déjà ailleurs dans le dépôt (`dossier_read.no_go`,
 * doctrine « un no-go est toujours temporaire ») : un déclencheur identifié →
 * METTRE EN VEILLE (le compte rouvrira dessus) ; aucun → ÉCARTER POUR CET
 * OBJECTIF.
 *
 * #3818 — `options.hasObjective: false` (défaut `true`, comportement d'avant à
 * l'octet près) retire cette dernière branche et rend l'une des trois issues
 * de {@link UnarbitratedAccountVerdict} : un déclencheur reste un écartement
 * légitime (il ne dépend pas d'un objectif) → INCOMPATIBILITÉ ÉTABLIE ; sans
 * déclencheur, `options.dataComplete: false` (même signal que
 * `accountVerdictFromScore`/EXPLORER) → une source est en panne, on ne sait
 * pas conclure ; données complètes → mesuré à zéro, mais sans objectif pour
 * en juger la portée.
 */
export function namedAccountVerdict(
  family: AccountVerdict,
  hasNoGoTrigger: boolean,
  options?: { hasObjective?: boolean; dataComplete?: boolean },
): NamedAccountVerdict | UnarbitratedAccountVerdict {
  const hasObjective = options?.hasObjective ?? true
  const dataComplete = options?.dataComplete ?? true
  switch (family) {
    case 'GO':
      return 'AGIR MAINTENANT'
    case 'PRUDENT':
      return 'RÉSERVE'
    case 'NO-GO':
      if (hasNoGoTrigger) return hasObjective ? 'METTRE EN VEILLE' : 'INCOMPATIBILITÉ ÉTABLIE'
      if (!hasObjective) {
        return dataComplete
          ? 'ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ'
          : 'ÉVALUATION PERSONNALISÉE INDISPONIBLE — SOURCE EN PANNE'
      }
      return 'ÉCARTER POUR CET OBJECTIF'
    case 'EXPLORER':
      return 'QUALIFIER'
  }
}

export const ACCOUNT_VERDICT_COLOR: Record<AccountVerdict, string> = {
  GO: '#22C55E',
  PRUDENT: '#F59E0B',
  'NO-GO': '#EF4444',
  EXPLORER: '#6366F1',
}

/** Semantic colour for a /10 score (green/amber/red), ghost when unknown. */
export function accountScoreColor(score: number | null | undefined): string {
  const verdict = accountVerdictFromScore(score)
  return verdict ? ACCOUNT_VERDICT_COLOR[verdict] : 'var(--text-ghost)'
}
