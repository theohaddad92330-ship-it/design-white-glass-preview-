import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #1319.2 — « on ne comprend pas ce que mesure le score, d'où viennent les
 * informations, ni sur quelle période elles sont calculées ».
 *
 * La décomposition existait déjà : la carte montre les axes et NOMME ceux qui
 * n'ont pas pu être évalués. Ce qui manquait est la FENÊTRE et la SOURCE.
 *
 * ⚠️ L'issue proposait la formule « Score calculé sur les 90 derniers jours ».
 * **C'est faux.** Le calcul lit `needsReceived12m`, `needsGiven12m` et le
 * ratio des missions menées à terme : la fenêtre est de DOUZE MOIS. Les
 * compteurs à 90 jours de la carte sont une autre ligne, qui mesure le flux
 * récent. Livrer le littéral aurait écrit une phrase fausse sous un chiffre —
 * exactement ce que la provenance est censée empêcher.
 */
const racine = dirname(fileURLToPath(import.meta.url))

describe('le score d’un partenaire dit sur quoi il est calculé', () => {
  const source = readFileSync(join(racine, 'PartnerPipeline.tsx'), 'utf8')
  const fr = JSON.parse(
    readFileSync(join(racine, '..', '..', '..', 'i18n', 'locales', 'fr', 'partnerPipeline.json'), 'utf8'),
  ) as { mine: Record<string, string> }

  it('a un corpus à lire', () => {
    expect(source).toContain('ScoreWithAxes')
  })

  it('affiche sa fenêtre juste sous la note', () => {
    expect(source).toContain('mine.scoreWindow')
  })

  it('dit que le score ne lit QUE de la donnée interne', () => {
    expect(source).toContain('mine.scoreInternalOnly')
  })

  it('annonce DOUZE mois, jamais 90 jours — c’est ce que le calcul lit', () => {
    expect(fr.mine.scoreWindow).toMatch(/douze/i)
    expect(fr.mine.scoreWindow).not.toMatch(/90|quatre-vingt-dix/i)
  })

  it('sait dire NON — la formule de l’issue serait refusée', () => {
    const litteral = 'Score calculé sur les 90 derniers jours à partir de tes échanges.'

    expect(/douze/i.test(litteral)).toBe(false)
  })
})
