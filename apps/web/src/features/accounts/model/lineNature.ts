import type { WatchSignal } from './watch'
import { normalizeEventText } from './watchEvents'

/**
 * #3676.6 — LA NATURE DE CHAQUE LIGNE DE « SIGNAUX ET BESOINS », EN FRANÇAIS SIMPLE.
 *
 * Quatre natures, une par sorte de ligne de l'écran unique : demande confirmée
 * (projet `confirmed`), piste à explorer (file de qualification), signal récent,
 * historique. Les deux premières sont portées par leur bloc ; ce fichier porte
 * la dérivation des deux dernières et le rapprochement signal ↔ piste.
 *
 * ⚠️ Le statut de PREUVE n'est pas un statut commercial : la nature ne promeut
 * jamais un signal en piste ni en demande, elle dit seulement ce que la ligne EST.
 * ⚠️ Un signal NON DATÉ n'a AUCUNE nature : le dire « récent » serait lui inventer
 * une fraîcheur, le dire « historique » lui inventer un âge.
 */
export type LineNature = 'confirmedDemand' | 'leadToExplore' | 'recentSignal' | 'history' | 'siteInformation'

/**
 * #5004.2 — une vision / un article du site (stratégie, levée, nomination…) est une INFORMATION, jamais un besoin :
 * nouvelle valeur (ajout seulement), les quatre natures existantes ne la couvrent pas.
 */
export const SITE_INFORMATION_NATURE: LineNature = 'siteInformation'

export function signalNature(signal: Pick<WatchSignal, 'freshness' | 'temporalStatus'>): LineNature | null {
  if (signal.freshness === 'undated' || signal.temporalStatus === 'UNDATED') return null
  if (
    signal.freshness === 'archive' ||
    signal.temporalStatus === 'HISTORICAL' ||
    signal.temporalStatus === 'STALE' ||
    signal.temporalStatus === 'SUPERSEDED'
  ) {
    return 'history'
  }
  return 'recentSignal'
}

type LeadFact = { label: string; observed_on: string | null }

/**
 * Les libellés que disent DÉJÀ les pistes, sous leur forme normalisée (casse,
 * accents, espaces, tirets et ponctuation retirés — `normalizeEventText`).
 *
 * #3676 (réfuté en prod le 07/10 : « feuille de route … 2026-2029 » ×3 — piste,
 * signal récent, synthèse) — la clé ne comprend PLUS la date. La date de la piste
 * est celle de la DÉTECTION (02/10), celle du signal est celle du fait publié
 * (21/09) : exiger le même jour ne rapprochait jamais le même fait. Le libellé
 * normalisé seul le rapproche ; la piste est la forme actionnable du fait.
 */
function leadLabelKeys(facts: readonly LeadFact[]): Set<string> {
  return new Set(facts.map(fact => normalizeEventText(fact.label)).filter(text => text.length > 0))
}

/**
 * Un fait que dit déjà une piste (même libellé normalisé) ne reste pas une
 * seconde ligne dans la liste des signaux. Un libellé vide ne se rapproche de rien.
 */
export function signalsNotCoveredByLeads(signals: WatchSignal[], facts: readonly LeadFact[]): WatchSignal[] {
  if (facts.length === 0) return signals
  const covered = leadLabelKeys(facts)
  return signals.filter(signal => {
    const text = normalizeEventText(signal.signal)
    return !text || !covered.has(text)
  })
}
