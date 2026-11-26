import type { QualifiedHypothesis } from '@bellum/contracts'

/**
 * #2687 — CE QU'UN SIGNAL MÈNE À FAIRE, quand l'analyse l'a dit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Un commercial lit « Recrute 12 data engineers » dans la Veille et se demande
 * « et donc ? ». L'analyse répondait déjà — `qualified_hypotheses[].esn_angle`
 * porte l'offre à proposer, `first_action` la première action à tenter — mais
 * personne ne pouvait rattacher cette réponse au signal qui l'a déclenchée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL N'EXISTAIT AUCUN LIEN, ET CE N'EST PAS UN DÉTAIL
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant #2687, rien ne reliait une hypothèse à un signal :
 *
 *  · `based_on_signals` est du TEXTE LIBRE, et le prompt demande une
 *    reformulation — « les signaux concrets qui la fondent » — pas une
 *    citation. Les tests de l'IA le montrent : `["recrut. data", "plateforme"]`
 *    en face de signaux rédigés « fait précis et daté ».
 *  · le signal n'avait pas d'identifiant, l'hypothèse n'a ni type ni domaine
 *    commun avec lui, et les cardinalités diffèrent (l'analyse vise 6 signaux
 *    et 4 hypothèses) — donc pas d'ordre exploitable non plus.
 *
 * Apparier par proximité de texte ou par position aurait produit un
 * rapprochement inventé, et un rapprochement inventé est PIRE que l'absence :
 * il a l'air d'une réponse. Le lien est donc demandé au modèle
 * (`based_on_signal_ids` → `recent_signals[].id`), et ce module ne fait que le
 * SUIVRE. Il ne devine jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLUSIEURS HYPOTHÈSES SUR UN MÊME SIGNAL : ON N'EN CHOISIT AUCUNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un signal peut fonder deux hypothèses, avec deux angles différents. Les deux
 * sont vrais — c'est l'analyse qui les a rattachés, pas nous. En retenir un
 * seul (le premier, le plus long, le mieux noté…) serait exactement le choix
 * arbitraire que le reste de ce fichier refuse. On les rend donc TOUS, chacun
 * avec l'hypothèse dont il vient, pour que le lecteur puisse les contester.
 */
export type SignalAngle = {
  /** L'hypothèse d'où vient l'angle. Nommée : un angle sans son hypothèse est
   *  une affirmation qu'on ne peut pas discuter. */
  hypothesis: string
  /** L'offre / le renfort ESN à proposer. Absent quand l'analyse n'en a pas
   *  produit — jamais une phrase générique de remplissage. */
  esnAngle?: string
  /** La première action, qui TESTE l'hypothèse sans la présenter comme un
   *  fait. Absente quand l'analyse n'en a pas produit. */
  firstAction?: string
}

/**
 * Les angles que l'analyse rattache À CE SIGNAL, dans l'ordre où elle les a
 * écrits — on ne re-classe pas ce qu'on n'a pas jugé.
 *
 * Rend `[]` — jamais une ligne de remplissage — dans les cinq cas où on ne
 * SAIT pas : signal sans `id` (analyse antérieure au lien), aucune hypothèse,
 * aucune hypothèse citant cet `id`, hypothèse qui cite l'`id` mais n'a ni
 * angle ni action à en tirer, et hypothèse dont la confiance affichée n'est
 * pas fondée par assez de signaux cités (#2952, #2305.35).
 */
export function anglesForSignal(
  hypotheses: readonly QualifiedHypothesis[] | undefined,
  signalId: string | null | undefined,
): SignalAngle[] {
  const id = signalId?.trim()
  if (!id || !hypotheses?.length) return []

  return hypotheses.flatMap(hypothesis => {
    if (!citesSignal(hypothesis, id)) return []
    if (!citesEnoughFoundingSignals(hypothesis)) return []

    const esnAngle = trimmed(hypothesis.esn_angle)
    const firstAction = trimmed(hypothesis.first_action)
    // Une hypothèse qui repose sur ce signal mais n'en tire ni offre ni action
    // n'a rien à dire ICI. Afficher son intitulé seul remplirait la ligne sans
    // répondre à « et donc ? » — on n'affiche pas ce qu'on n'a pas.
    if (!esnAngle && !firstAction) return []

    return [
      {
        hypothesis: trimmed(hypothesis.hypothesis) ?? '',
        ...(esnAngle ? { esnAngle } : {}),
        ...(firstAction ? { firstAction } : {}),
      },
    ]
  })
}

/**
 * ⚠️ Sur `based_on_signal_ids` UNIQUEMENT.
 *
 * `based_on_signals` est juste à côté, se lit comme une liste de signaux, et
 * serait tentant en repli « pour les analyses anciennes ». C'est précisément le
 * repli deviné qu'on refuse : ce champ est une reformulation, un `includes()`
 * dessus rattacherait « recrutement » à tout signal dont le titre contient le
 * mot. Une analyse antérieure au lien n'a pas d'angle rattachable, et le dire
 * est la seule réponse honnête.
 */
function citesSignal(hypothesis: QualifiedHypothesis, id: string): boolean {
  return (hypothesis.based_on_signal_ids ?? []).some(cited => cited.trim() === id)
}

/**
 * #2952 (#2305.35) — « Un projet plausible doit citer les signaux qui le
 * fondent. » `confidence` EST cette échelle de convergence (1 signal →
 * `a_verifier`, 2 → `probable`, 3+ → `confirmee` — voir `research.ts`) : une
 * hypothèse qui s'affiche `confirmee` mais ne cite qu'un seul `based_on_signal_ids`
 * revendique une convergence qu'elle ne montre pas. On ne la corrige pas
 * (deviner le bon niveau serait inventer) : on refuse de l'afficher comme un
 * angle, exactement comme une hypothèse muette (ligne au-dessus).
 */
const MIN_CITED_SIGNALS_BY_CONFIDENCE: Readonly<Record<string, number>> = {
  a_verifier: 1,
  probable: 2,
  confirmee: 3,
}

export function citesEnoughFoundingSignals(hypothesis: QualifiedHypothesis): boolean {
  const confidence = trimmed(hypothesis.confidence)?.toLowerCase()
  const required = confidence ? MIN_CITED_SIGNALS_BY_CONFIDENCE[confidence] : undefined
  // Confiance absente ou inconnue : rien de chiffré à contester ici.
  if (!required) return true
  return (hypothesis.based_on_signal_ids ?? []).length >= required
}

function trimmed(value: string | null | undefined): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}
