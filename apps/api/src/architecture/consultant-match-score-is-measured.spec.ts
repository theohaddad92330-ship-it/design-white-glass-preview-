import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-230 — le score du matching consultant ne se replie plus sur `0` quand
 * rien n'est évaluable (D871).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────
 * `matchConsultant` (`consultant-matching.ts`) divisait par `denominator` et
 * repliait sur `0` quand aucun critère n'était évaluable — juste au calcul
 * (`0/0` n'existe pas), faux à l'affichage : ce `0` se lit comme la pire
 * note, jamais comme une absence de note. La garde d'affichage web
 * (`apps/web/src/architecture/display-primitives.test.ts`, GA-18/GA-19) ne
 * pouvait pas l'attraper : son corpus s'arrête à `apps/web`, et ce calcul vit
 * côté API.
 *
 * Le cas qui se produit vraiment est pire que le dénominateur nul : un
 * profil NON bloqué (dispo connue, stack non vide) peut n'avoir qu'UN SEUL
 * critère évaluable — la disponibilité — dès que le besoin n'exprime aucun
 * terme exploitable. L'ancien calcul rendait alors 100/100 sur ce seul axe,
 * un score tout aussi mensonger qu'un faux zéro. `MIN_AXES_FOR_SCORE`
 * (`packages/contracts/src/schemas/mission-scores.ts`) existait déjà pour
 * exactement ce cas, exposé par `matchScoreIsMeasured`
 * (`packages/contracts/src/schemas/match.ts`) — cette garde vérifie qu'il est
 * bien RÉUTILISÉ ici, et pas réécrit en un second seuil (GA-26 : un réglage
 * vit à un seul endroit).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE SOURCE, PAS SEULEMENT UN TEST DE COMPORTEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * `consultant-matching.spec.ts` prouve déjà le COMPORTEMENT (score null,
 * exclu du push, classé derrière). Cette garde protège la FORME du calcul :
 * elle empêche qu'un futur commit réintroduise le motif fautif sous une
 * variante — un second `? 0 :`, un second seuil codé en dur — même si les
 * tests de comportement existants n'ont pas anticipé cette variante précise.
 */
const SOURCE_PATH = join(__dirname, '..', 'modules', 'consultants', 'consultant-matching.ts')

/** Le motif exact qui a produit le défaut : repli sur `0` quand le
 *  dénominateur est nul, au lieu d'un score `null` (« non mesuré »). */
function hasBareZeroFallback(source: string): boolean {
  return /denominator\s*===\s*0\s*\?\s*0\s*:/.test(source)
}

describe('GA-230 — le faux zéro du matching consultant ne revient pas', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8')

  it('lit bien le fichier protégé — un chemin devenu faux rendrait un corpus vide', () => {
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain('export function matchConsultant')
  })

  it('sait dire NON — reconnaît le motif fautif là où il est, pas ailleurs', () => {
    // Le motif RÉEL de la version fautive (avant D871), reproduit ici en
    // texte plutôt qu'en code : la garde doit le reconnaître même hors de ce
    // fichier, sinon elle ne détecte qu'un fantôme de sa propre regex.
    const buggy = 'const score = denominator === 0 ? 0 : Math.round((points * 100) / denominator)'
    expect(hasBareZeroFallback(buggy)).toBe(true)

    // …et elle ne s'affole pas sur un `denominator === 0` qui ne replie PAS
    // sur zéro — sinon la garde finirait par interdire jusqu'au nom de la
    // variable.
    const fine = 'if (denominator === 0) return null'
    expect(hasBareZeroFallback(fine)).toBe(false)

    // Le fichier réel, aujourd'hui, ne porte plus le motif fautif.
    expect(hasBareZeroFallback(source)).toBe(false)
  })

  it('calcule le score via `matchScoreIsMeasured` — pas un second seuil (GA-26)', () => {
    expect(source).toMatch(/matchScoreIsMeasured\(/)
    // Aucune redéfinition locale d'un seuil d'axes minimum : le seuil vit
    // dans `packages/contracts/src/schemas/mission-scores.ts`, nulle part
    // ailleurs.
    expect(source).not.toMatch(/MIN_AXES_FOR_SCORE\s*=\s*\d/)
  })

  it('un score `null` ne se pousse jamais au client — `selectPush` l’exclut explicitement', () => {
    expect(source).toMatch(/match\.score\s*!==\s*null/)
  })
})
