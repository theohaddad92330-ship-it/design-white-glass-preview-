import { marketVerificationKey } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'

/**
 * #2288.2 (décision Louis, 18/09/2026) — CONFIRMER LANCE TOUT CE QUI A ÉTÉ
 * ANNONCÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE FAIT CE QUE LE DEVIS A DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le devis a annoncé N entreprises et leur coût exact (la somme des réponses du
 * lanceur). Confirmer lance donc les N, chacune par le MÊME lanceur
 * qu'« Analyser » (`POST /analysis/start`) : le serveur y débite selon son
 * propre plan de lancement — 0 pour un dossier déjà analysé, 0 en démo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ISSUES, ET AUCUNE N'EST UN SUCCÈS GLOBAL
 * ─────────────────────────────────────────────────────────────────────────────
 * · `launched` — le lanceur a accepté : un reçu `verified` est inscrit.
 * · `unknown` — temps dépassé ou connexion coupée : on NE SAIT PAS si c'est
 *   parti. Un reçu `unknown` (« non mesuré ») est inscrit, et on ne rejoue
 *   RIEN — le rejouer pourrait payer deux fois ce qu'on n'a pas su compter.
 * · `failed` — refus explicite (solde, droit, nom illisible…) : rien n'est
 *   parti, rien n'a été vérifié, AUCUN reçu. L'écran la NOMME.
 *
 * Un échec au milieu n'arrête pas les suivantes : chaque entreprise a été
 * annoncée pour elle-même. Les lancements partent UN PAR UN — une rafale de
 * N démarrages sur le lanceur serait une charge que personne n'a annoncée.
 */
type LaunchOutcome = 'launched' | 'unknown' | 'failed'

type LaunchResult = { companyName: string; outcome: LaunchOutcome }

/** Temps dépassé ou connexion coupée : on ignore si le lancement est parti. */
function isUnmeasured(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 408 || error.status === 504
  if (error instanceof TypeError) return true
  const name = (error as { name?: unknown } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

export async function launchVerifications(
  companies: readonly string[],
  deps: {
    start: (companyName: string, siren?: string) => Promise<unknown>
    record: (companyName: string, outcome: 'verified' | 'unknown') => Promise<unknown>
  },
  opts: {
    /**
     * #2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE AVEC LA VÉRIFICATION.
     * Une lecture DÉJÀ FAITE par l'appelant (clé = `marketVerificationKey`),
     * jamais devinée ici. Absent ou libellé non trouvé ⇒ le lanceur ne reçoit
     * rien de plus (`undefined`, comportement inchangé).
     */
    knownSirens?: ReadonlyMap<string, string>
  } = {},
): Promise<LaunchResult[]> {
  const results: LaunchResult[] = []
  for (const companyName of companies) {
    let outcome: LaunchOutcome
    const siren = opts.knownSirens?.get(marketVerificationKey(companyName))
    try {
      await deps.start(companyName, siren)
      outcome = 'launched'
    } catch (error) {
      outcome = isUnmeasured(error) ? 'unknown' : 'failed'
    }
    if (outcome !== 'failed') {
      // Le reçu est la CONSERVATION ; s'il ne s'inscrit pas, le lancement n'en
      // est pas moins parti — le rapporter en échec mentirait dans l'autre sens.
      await deps.record(companyName, outcome === 'launched' ? 'verified' : 'unknown').catch(() => undefined)
    }
    results.push({ companyName, outcome })
  }
  return results
}
