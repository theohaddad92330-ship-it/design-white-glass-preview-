import { lauraPageContextSchema, type LauraPageContext } from '@bellum/contracts'

/**
 * #2123.56 — LE CONTEXTE DU DOSSIER QUI A OUVERT LAURA.
 *
 * Le panneau « Travailler ce compte avec Laura » passe à `/chat` la section
 * d'origine, le périmètre visé et les sources du dossier, en plus du compte et
 * de la question pré-remplie. Ce contexte part avec le tour, par le même canal
 * que la bulle (`pageContext`, rendu côté API par `renderLauraPageContext`, et
 * signalé au modèle comme un AFFICHAGE, pas une consigne).
 *
 * Deux règles, tenues ici et nulle part ailleurs :
 *  · le contexte ne parle que du compte en portée — la portée change, il reste
 *    derrière. Le prêter à un autre compte ferait répondre Laura sur le
 *    périmètre d'un dossier qui n'est plus à l'écran ;
 *  · un contexte illisible est ignoré EN ENTIER. Le reprendre à moitié
 *    reviendrait à deviner ce que le dossier disait.
 *
 * #3002 (#2206.45-.48, retour bêta du 25/09/2026) — TROISIÈME règle, ajoutée
 * ici : un contexte SANS compte (`entityId: null` — pilotage, briefing…)
 * n'est scopé à AUCUN dossier, donc rien ne peut le « prêter » au mauvais.
 * Il voyage TOUJOURS, `accountId` présent ou pas. C'était le maillon
 * manquant : `/pilotage` publie bien son contexte (`pilotageLauraContext`,
 * lu par la bulle en direct), mais la question posée depuis LÀ n'a pas de
 * compte à mettre en portée — la garde `!accountId` de la ligne d'avant le
 * jetait donc systématiquement dès que la conversation passait par une
 * navigation vers `/chat` (mobile, ou surcouche ouverte — voir `AskLaura.tsx`),
 * plutôt qu'à l'ouverture directe dans la bulle.
 */
export function entryPageContext(raw: unknown, accountId: string | null | undefined): LauraPageContext | null {
  if (raw === undefined || raw === null) return null
  let value: unknown = raw
  if (typeof raw === 'string') {
    // Une URL rechargée rend la valeur sous sa forme sérialisée.
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  const parsed = lauraPageContextSchema.safeParse(value)
  if (!parsed.success) return null
  if (parsed.data.entityId !== null && parsed.data.entityId !== accountId) return null
  return parsed.data
}
