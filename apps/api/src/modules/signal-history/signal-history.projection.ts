import { readRecentSignals, type SignalImportance, signalImportance } from '@bellum/contracts'

/**
 * Projection déterministe d'un blob `accounts.recent_signals` vers les lignes de
 * `signal_history` (restitution V2 §11). Fonctions pures : la matérialisation et
 * la lecture partagent EXACTEMENT la même notion d'identité, donc re-matérialiser
 * deux fois le même blob ne peut rien dupliquer.
 */

type SignalHistoryRecord = {
  /** Identité dans le compte : libellé normalisé. */
  key: string
  label: string
  type: string | null
  source: string | null
  date: string | null
  freshness: string | null
  /** Pondération DÉRIVÉE (V2 §20) des règles déjà en vigueur — `null` quand rien
   *  ne situe le signal dans le temps. Voir `signalImportance`. */
  importance: SignalImportance | null
}

/**
 * Identité d'un signal : son libellé normalisé (minuscules, espaces compactés).
 *
 * Volontairement SANS la date ni la source — contrairement à `signalKeys` de la
 * veille quotidienne, qui les inclut pour ne pas re-notifier. Ici l'objet est
 * inverse : si la même nouvelle revient avec une date corrigée ou une autre
 * source, c'est un CHANGEMENT du même signal, pas un signal neuf (sinon la date
 * de première détection repartirait de zéro à chaque reformulation).
 */
export function signalHistoryKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Les signaux historisables d'un blob, dédupliqués par identité (le premier
 * gagne : `recent_signals` est trié du plus pertinent au moins pertinent) et
 * dans l'ordre du blob. Un élément sans libellé n'est pas affichable, donc pas
 * historisé. Aucune valeur inventée : un champ absent reste `null`.
 */
export function projectSignalHistory(recentSignals: unknown, nowMs: number = Date.now()): SignalHistoryRecord[] {
  // #3928.a — le lecteur UNIQUE de `recent_signals` (libellé, champs) ; seule
  // l'IDENTITÉ reste propre à l'historique (libellé normalisé, sans la source).
  const seen = new Set<string>()
  const records: SignalHistoryRecord[] = []
  for (const signal of readRecentSignals(recentSignals)) {
    const key = signalHistoryKey(signal.label)
    if (key.length === 0 || seen.has(key)) continue
    seen.add(key)
    const { label, type, source, date, freshness } = signal
    records.push({
      key,
      label,
      type,
      source,
      date,
      freshness,
      // Dérivée des règles EXISTANTES (archive partagée Cockpit/Veille + « un
      // signal sans source n'est pas une preuve »). `null` = rien à pondérer.
      importance: signalImportance({ freshness, date, source }, nowMs),
    })
  }
  return records
}

/**
 * #2107.33 — la lecture commerciale (« pourquoi cela concerne cette ESN ») d'un
 * signal historisé, retrouvée sur le blob `accounts.recent_signals` par la MÊME
 * identité que {@link signalHistoryKey} — jamais une seconde clé de rapprochement,
 * qui diverge le jour où un libellé se reformule.
 *
 * `sales_implication` ne vit QUE sur le blob (l'IA le réécrit à chaque analyse) ;
 * `signal_history` n'en garde aucune trace, donc rien à lire côté table. Les
 * deux orthographes (`salesImplication`/`sales_implication`) sont lues par le
 * lecteur unique `readRecentSignals` (`@bellum/contracts`, #3928.a).
 */
export function salesImplicationForLabel(recentSignals: unknown, label: string): string | null {
  const targetKey = signalHistoryKey(label)
  // #3928.a — même lecteur, donc même libellé et mêmes deux orthographes.
  const match = readRecentSignals(recentSignals).find(signal => signalHistoryKey(signal.label) === targetKey)
  return match?.sales_implication ?? null
}

/**
 * Le lien vers la page d'ORIGINE du signal de ce libellé (`source_url`, #3922), rapparié par identité comme
 * {@link salesImplicationForLabel}. `null` quand le signal n'a pas d'URL http(s) vérifiable : jamais un lien deviné.
 */
export function sourceLinkForLabel(recentSignals: unknown, label: string): { url: string; kind: string } | null {
  const targetKey = signalHistoryKey(label)
  const match = readRecentSignals(recentSignals).find(signal => signalHistoryKey(signal.label) === targetKey)
  return match?.source_url && match.source_kind ? { url: match.source_url, kind: match.source_kind } : null
}

/**
 * Théo L1 — sélecteur avancé — CE QUE LE SERVEUR RELIT D'UNE OFFRE D'EMPLOI.
 *
 * La ligne d'historique de signal (`signal_history`, bornée à l'espace par
 * `SignalHistoryService.readJobOffer`) et, de son compte, ce que le dossier
 * porte déjà : le nom, le site, le blob des signaux et les offres collectées.
 * Rien n'est recalculé et aucun appel n'est fait.
 */
export type JobOfferHistoryRow = {
  label: string
  signal_key: string
  signal_date: string | null
  status: string | null
  resolved_at: Date | string | null
  company_name: string | null
  website: string | null
  recent_signals: unknown
  job_signals: unknown
}
