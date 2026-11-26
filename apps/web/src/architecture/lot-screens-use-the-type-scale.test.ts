/**
 * #4332.1 — TITRES, CHIFFRES, ESPACES : UNE ÉCHELLE, ÉCRITE À UN SEUL ENDROIT.
 *
 * Mesuré le 19/10/2026 sur les écrans de la refonte (Tableau de bord, Cockpit,
 * Messagerie) : le titre de page valait `text-2xl font-bold` sur `/dashboard`
 * et `size="lg"` sur `/mailbox` ; un chiffre clé valait `text-2xl`, `xl` ou
 * `lg` selon la carte. GA-31 tient le PLANCHER et les barreaux Tailwind ; il
 * ne dit pas QUEL barreau porte quel rôle. C'est `TYPE_SCALE`
 * (`packages/ui/src/type-scale.ts`) qui le dit : titre de page, titre de
 * section, chiffre clé, texte, libellé.
 *
 * CE QUE LA GARDE REFUSE
 * Dans les écrans de cette refonte, une taille AU-DESSUS du texte courant
 * (`text-base` et plus, ou `<Text size="base|lg|xl|…">`) écrite à la main au
 * lieu de venir de `TYPE_SCALE`. `text-sm` / `text-xs` (texte et libellé)
 * restent libres : ce sont les deux barreaux du corps.
 *
 * CE QU'ELLE NE VISE PAS
 * Les écrans hors refonte (leur passage à l'échelle est un autre lot) et les
 * commentaires qui CITENT une ancienne taille.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TYPE_SCALE } from '@bellum/ui'

const WEB_SRC = fileURLToPath(new URL('../', import.meta.url))

/** Les écrans de la refonte du 19/10 (lot PLATEFORME-B). Une page qui passe à l'échelle s'ajoute ici. */
const ECRANS = [
  'features/dashboard/view/DashboardContent.tsx',
  'features/dashboard/components/personal/PersonalCockpit.tsx',
  'features/dashboard/components/personal/CockpitGuidedSteps.tsx',
  'features/dashboard/components/personal/PersonalCockpitHeader.tsx',
  'features/dashboard/components/personal/PersonalKpiRow.tsx',
  'features/dashboard/components/personal/TrajectoryVerdict.tsx',
  'features/dashboard/components/perspective/CommercialObjectivesCard.tsx',
  'features/pilotage/view/PilotageAccroche.tsx',
  'features/pilotage/view/WeekDeltaStrip.tsx',
  'features/mailbox/view/MailboxPage.tsx',
]

const HORS_ECHELLE = [/\btext-(?:base|lg|xl|[2-9]xl)\b/, /<Text\b[^>]*\bsize="(?:base|lg|xl|[2-9]xl)"/]

function sansCommentaires(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

function tailleHorsEchelle(source: string): string | null {
  const code = sansCommentaires(source)
  for (const motif of HORS_ECHELLE) {
    const trouve = code.match(motif)
    if (trouve) return trouve[0]
  }
  return null
}

describe('#4332.1 — les écrans de la refonte prennent leurs tailles dans TYPE_SCALE', () => {
  it('l’échelle nomme ses rôles, et chacun tient sur les barreaux Tailwind (GA-31)', () => {
    expect(Object.keys(TYPE_SCALE).sort()).toEqual(['body', 'keyFigure', 'label', 'pageTitle', 'sectionTitle'])
    for (const classes of Object.values(TYPE_SCALE)) expect(classes).toMatch(/\btext-(?:xs|sm|base|lg|xl)\b/)
  })

  it('aucune taille au-dessus du corps écrite à la main', () => {
    const fautifs = ECRANS.flatMap(chemin => {
      const taille = tailleHorsEchelle(readFileSync(join(WEB_SRC, chemin), 'utf8'))
      return taille ? [`${chemin} → ${taille}`] : []
    })
    expect(fautifs).toEqual([])
  })

  it('dit NON à une taille à la main, et laisse passer le corps et les commentaires', () => {
    expect(tailleHorsEchelle('<h1 className="text-2xl font-bold">x</h1>')).toBe('text-2xl')
    expect(tailleHorsEchelle('<Text element="h1" size="lg">x</Text>')).not.toBeNull()
    expect(tailleHorsEchelle('<h1 className={TYPE_SCALE.pageTitle}>x</h1>')).toBeNull()
    expect(tailleHorsEchelle('<p className="text-sm">x</p><span className="text-xs">y</span>')).toBeNull()
    expect(tailleHorsEchelle('// ancien : text-2xl\n<p className="text-sm">x</p>')).toBeNull()
  })
})
