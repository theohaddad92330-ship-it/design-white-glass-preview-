/**
 * #4543 — le LECTEUR UNIQUE des inconnues d'un brief (GA-26), celui de « Ce qu'on ne sait pas ».
 *
 * Recette 25/10 : le bloc affirmait « rien n'a été noté comme inconnu » pendant que la synthèse du même écran écrivait
 * « les achats et la concurrence restent inconnus ». Cause : `raw_analysis.unknowns` n'était alimenté par personne —
 * deux lectures d'un même fait, dont une vide. Ici, les inconnues se lisent dans ce que l'ANALYSE a relevé :
 *
 *  - celles posées explicitement (`unknowns`, chaînes) passent d'abord ;
 *  - puis ce que l'analyse n'a PAS relevé alors qu'elle a tourné : aucun concurrent, aucun marché d'achats ;
 *  - des sources injoignables sont COMPTÉES (« N sources n'ont pas répondu »), jamais nommées : nos fournisseurs ne se
 *    nomment pas.
 *
 * #4543.5 (Louis 01/11) — une catégorie vide se dit « Non renseigné(e) » (`unknownGaps` du namespace `brief`), jamais
 * « rien à signaler » : un tableau vide peut être un zéro mesuré ou une absence de collecte (GA-18 / GA-19).
 *
 * Un dossier jamais analysé ne devine rien (liste vide : le bloc dit « non renseigné »). Aucune lecture du texte de la
 * synthèse : on ne tire pas une liste structurée d'une phrase du modèle.
 */
type BriefGap = 'competitors' | 'purchasing' | 'sourcesUnreachable'
type BriefUnknown =
  { text: string; gap?: undefined; count?: undefined } | { gap: BriefGap; count?: number; text?: undefined }

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** L'analyse a tourné : ses clés de tête existent. Sinon on ne conclut RIEN sur ce qu'elle n'a pas relevé. */
function hasBeenAnalysed(raw: Record<string, unknown>): boolean {
  return 'priority_score' in raw || 'sources' in raw || 'signal_coverage' in raw
}

export function briefUnknowns(rawAnalysis: unknown): BriefUnknown[] {
  const raw = record(rawAnalysis)
  if (!raw) return []
  const out: BriefUnknown[] = []
  const stated = Array.isArray(raw['unknowns']) ? raw['unknowns'] : []
  for (const item of stated) {
    const text = typeof item === 'string' ? item.trim() : ''
    if (text && !out.some(u => u.text === text)) out.push({ text })
  }
  if (!hasBeenAnalysed(raw)) return out
  if (Array.isArray(raw['competitors']) && raw['competitors'].length === 0) out.push({ gap: 'competitors' })
  const thread = record(raw['purchasing_thread'])
  if (thread && Array.isArray(thread['items']) && thread['items'].length === 0) out.push({ gap: 'purchasing' })
  const unreachable = record(raw['signal_coverage'])?.['unreachable']
  if (Array.isArray(unreachable) && unreachable.length > 0)
    out.push({ gap: 'sourcesUnreachable', count: unreachable.length })
  return out
}
