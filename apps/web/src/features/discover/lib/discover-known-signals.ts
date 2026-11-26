import { discoverSignalTypeOfKind, type DiscoverCallListCompany, type SignalKind } from '@bellum/contracts'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'

/* ------------------------------------------------------------------ */
/*  #3819 (démo Ludovic 08/10) — LES SIGNAUX QUE L'ESPACE CONNAÎT DÉJÀ.  */
/*                                                                     */
/*  Recette prod 07/10 : 5 signaux sur 25 entreprises, tous « vie        */
/*  juridique » (greffe), alors que Laura, sur la même zone, citait     */
/*  l'appel d'offres de Schneider Dijon (02/10) et cinq signaux datés    */
/*  de Stellantis. Ces signaux vivent dans l'historique des comptes     */
/*  (`signal_history`), servis par `POST /contacts/call-list` avec les   */
/*  contacts : ils rejoignent ici la carte du candidat, datés et        */
/*  sourcés. Rien n'est deviné : un candidat qui n'est pas un compte de  */
/*  l'espace ne reçoit rien.                                            */
/* ------------------------------------------------------------------ */

/** Nature historisée → famille de signal de Découvrir (#4068 : la règle vit
 *  au contrat, `discoverSignalTypeOfKind`, que l'API lit aussi). */
export function knownSignalType(kind: SignalKind | null): DiscoverSignal['type'] {
  return discoverSignalTypeOfKind(kind)
}

/** Un signal commercial = tout signal daté qui n'est pas la vie juridique. */
export function hasCommercialSignal(candidate: Pick<DiscoverCandidate, 'signals'>): boolean {
  return candidate.signals.some(signal => signal.type !== 'legal')
}

function signalKey(signal: Pick<DiscoverSignal, 'type' | 'label' | 'date'>): string {
  return `${signal.type}|${signal.label.trim().toLowerCase()}|${signal.date}`
}

/**
 * Fusionne les signaux connus (et le compte rapproché) dans les candidats.
 * Un candidat sans rien de neuf est rendu TEL QUEL (même référence).
 */
export function mergeKnownSignals(
  candidates: readonly DiscoverCandidate[],
  known: ReadonlyMap<string, DiscoverCallListCompany>,
): DiscoverCandidate[] {
  return candidates.map(candidate => {
    const served = known.get(candidate.siren)
    if (!served) return candidate
    const seen = new Set(candidate.signals.map(signalKey))
    const added: DiscoverSignal[] = []
    for (const signal of served.signals) {
      const mapped: DiscoverSignal = {
        type: knownSignalType(signal.kind),
        label: signal.label,
        date: signal.date,
        // Lot M (recette 01/11) : `signal.source` est le NOM du fournisseur/site d'annonces — jamais montré
        // (doctrine « aucune source nommée ») ; il ne devient donc pas le `detail` de la carte.
        // #4045.1 — le lien de l'offre / de l'article, quand l'analyse en a un.
        ...(signal.url ? { url: signal.url } : {}),
        // #3928.1 — une date de détection n'est pas la date du signal.
        ...(signal.dateIsDetection ? { dateIsDetection: true } : {}),
        // #4068 — l'historique de l'espace ne périme pas sur la carte.
        fromSpace: true,
      }
      const key = signalKey(mapped)
      if (seen.has(key)) continue
      seen.add(key)
      added.push(mapped)
    }
    const accountId = candidate.accountId ?? served.accountId
    if (added.length === 0 && accountId === candidate.accountId) return candidate
    const signals = [...candidate.signals, ...added].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return { ...candidate, accountId, signals }
  })
}
