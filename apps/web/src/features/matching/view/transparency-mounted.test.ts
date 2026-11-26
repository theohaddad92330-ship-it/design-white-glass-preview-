import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Tout écran qui CLASSE des personnes porte le bandeau de transparence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UNE GARDE ET NON UNE PRÉFÉRENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tri, le classement et l'évaluation de candidats relèvent de l'Annexe III de
 * l'EU AI Act. ⚠️ La DATE d'entrée en vigueur est en CONFLIT : deux circulent —
 * 02/08/2026 et 02/12/2027 — et aucune des deux n'a été vérifiée contre le texte
 * du règlement. Cette garde ne dépend d'aucune : dire à quelqu'un qu'une machine
 * l'a classé se tient sans échéance. Le bandeau existe, il est non masquable
 * (pas de croix, pas de « ne plus afficher ») — et il n'était monté que sur UN
 * des trois écrans qui classent : celui des besoins ouverts.
 *
 * Le panneau du Vivier et le matching inverse classaient sans rien dire. C'est
 * le scénario n°2 du PDF 9 — « un candidat porte plainte pour discrimination
 * algorithmique » — sans la garde qui lui répond.
 *
 * ⚠️ La détection porte sur ce qu'un composant AFFICHE, pas sur son nom : un
 * écran qui rend un score de correspondance, un rang ou un bloc « écartés »
 * classe des personnes, quel que soit son fichier.
 */

const ROOTS = ['src/features/matching/view', 'src/features/consultants/view']
/** Ce qui trahit un rendu de CLASSEMENT de personnes. */
const RANKING_MARKERS = ['correspondenceScore', 'pushableScore', 'match.score', 'notEvaluable', 'borderline']

function files(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...files(full))
    else if (/\.tsx$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

describe('un écran qui classe des personnes le DIT', () => {
  const screens = ROOTS.flatMap(root => files(root)).map(path => ({
    path,
    source: readFileSync(path, 'utf8'),
  }))

  /** Les composants qui rendent un classement — pas ceux qui rendent une carte. */
  const ranking = screens.filter(
    screen =>
      RANKING_MARKERS.some(marker => screen.source.includes(marker)) &&
      // Une CARTE reçoit un résultat déjà classé : c'est son conteneur qui porte
      // le bandeau, pas elle. On reconnaît un conteneur au fait qu'il DÉCLENCHE
      // le classement ou en lit le run.
      (screen.source.includes('matchingApi') ||
        screen.source.includes('useConsultantMatch') ||
        screen.source.includes('run?.')),
  )

  it('chaque écran de classement monte le bandeau de transparence', () => {
    // ⚠️ `<TransparencyBanner` et non `TransparencyBanner` : un import qui reste
    // après le retrait du montage laisserait la garde au vert. C'est exactement
    // ce qui s'est passé à la première écriture de ce test — et c'est la leçon
    // de la carte de diagnostic manquante du 21/08 : vérifier la présence d'un
    // nom ne prouve pas qu'un composant est rendu.
    const silent = ranking.filter(screen => !screen.source.includes('<TransparencyBanner')).map(screen => screen.path)
    if (silent.length > 0) {
      throw new Error(
        [
          'Un écran classe des personnes sans afficher le bandeau de transparence.',
          'Le classement de candidats relève de l’Annexe III de l’EU AI Act : la',
          'transparence n’est pas une préférence d’interface.',
          '',
          ...silent.map(path => `  · ${path}`),
        ].join('\n'),
      )
    }
    expect(silent).toEqual([])
  })

  it('le bandeau reste NON masquable', () => {
    // Une croix, un « ne plus afficher » ou un `useState` de visibilité le
    // rendraient permanent en apparence seulement.
    // `aria-hidden` sur l'icône décorative est légitime : elle ne porte aucune
    // information, et un lecteur d'écran qui l'annonce ajoute du bruit. C'est
    // la VISIBILITÉ du bandeau qu'on garde, pas l'accessibilité de son icône.
    const banner = readFileSync('src/features/matching/view/TransparencyBanner.tsx', 'utf8').replaceAll(
      'aria-hidden',
      '',
    )
    for (const escape of ['onClose', 'dismiss', 'useState', 'hidden', 'collapsed']) {
      expect(banner.includes(escape), `le bandeau porte « ${escape} »`).toBe(false)
    }
  })

  it('la garde voit bien plusieurs écrans — sinon elle ne garde rien', () => {
    expect(ranking.length).toBeGreaterThanOrEqual(3)
  })
})
