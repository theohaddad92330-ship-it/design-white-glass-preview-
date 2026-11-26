/**
 * #2214.16 (tranché sans Louis) — LES MOTS QUI CHANGENT LA DÉCISION, EN
 * SEMIBOLD, JAMAIS UN PARAGRAPHE ENTIER.
 *
 * L'issue #2214 (§ STYLE ÉDITORIAL / DESIGN VISUEL) demande que le corps
 * d'une bulle de guide puisse mettre en semibold les mots qui comptent, sans
 * jamais mettre tout un paragraphe en gras. Le corps d'un pas
 * (`GuideStep.bodyKey`) n'avait AUCUNE capacité de mise en forme — un texte
 * i18n brut, rendu tel quel (`GuideHost.tsx` : `body={t(step.bodyKey)}`).
 *
 * Cette fonction lit une syntaxe minimale, `**mot ou groupe**`, la MÊME
 * convention que le reste de ce dépôt utilise déjà dans ses propres
 * docblocks — jamais du HTML : un `dangerouslySetInnerHTML` sur un contenu
 * i18n ouvrirait une injection le jour où une chaîne traduite contiendrait,
 * par erreur de copier-coller, une balise. Chaque segment porte seulement
 * `text` et `emphasis` ; `GuideSpotlight` décide de la mise en forme.
 */
type GuideBodySegment = { text: string; emphasis: boolean }

const EMPHASIS_PATTERN = /\*\*(.+?)\*\*/g

export function parseGuideBodySegments(body: string): GuideBodySegment[] {
  const segments: GuideBodySegment[] = []
  let lastIndex = 0
  for (const match of body.matchAll(EMPHASIS_PATTERN)) {
    const start = match.index ?? 0
    if (start > lastIndex) segments.push({ text: body.slice(lastIndex, start), emphasis: false })
    segments.push({ text: match[1] ?? '', emphasis: true })
    lastIndex = start + match[0].length
  }
  if (lastIndex < body.length) segments.push({ text: body.slice(lastIndex), emphasis: false })
  return segments
}
