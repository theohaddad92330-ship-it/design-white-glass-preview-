import { describe, expect, it } from 'vitest'
import { HYGIENE_THRESHOLDS } from './data-hygiene.js'
import {
  KPI_TARGETS,
  KPI_TARGET_DIRECTIONS,
  KPI_TARGET_MEASURES,
  KPI_TARGET_UNITS,
  compareToTarget,
  kpiTarget,
  kpiTargetSchema,
} from './kpi-targets.js'
import { MANAGER_KPIS } from './manager-kpi.js'

/**
 * Les cibles chiffrées des indicateurs (PDF 5 §13.3), et ce qu'elles gardent.
 *
 * Trois choses se vérifient ici, dans cet ordre d'importance :
 *
 *  1. **Une cible dit son SENS.** « DSO < 65 j » et « CRA > 85 % » se colorent
 *     dans deux directions opposées. Un écran qui colore au hasard du signe est
 *     pire que pas de couleur du tout.
 *  2. **Une valeur absente n'est jamais HORS CIBLE.** C'est le piège central :
 *     un DSO qu'on ne sait pas calculer ne vaut pas 0 jour, et 0 jour serait
 *     « on est payé le jour même », le meilleur résultat possible. `null` rend
 *     `unmeasured`, jamais `on_target` ni `off_target`.
 *  3. **Le nombre vit à UN seul endroit** (GA-26). La prose du seuil, dans le
 *     dictionnaire, ne doit pas énoncer un AUTRE nombre pour la même question —
 *     c'est ainsi que « > 85 % » de la source est devenu « sous 90 % » dans le
 *     catalogue sans que personne ne le voie.
 */

/** Une garde qui parcourt une liste vide passe au vert sans rien vérifier. */
describe('les cibles — la garde lit quelque chose', () => {
  it('lit un corpus non vide', () => {
    expect(KPI_TARGETS.length).toBeGreaterThan(0)
    expect(MANAGER_KPIS.length).toBeGreaterThan(0)
    expect(KPI_TARGET_DIRECTIONS.length).toBe(4)
    expect(KPI_TARGET_UNITS.length).toBeGreaterThan(0)
    expect(KPI_TARGET_MEASURES.length).toBe(2)
  })

  it('porte les DIX cibles chiffrées de la source, aucune de plus', () => {
    // Le compte est un ARGUMENT : le PDF 5 §13.3 énumère dix-sept indicateurs et
    // n'en chiffre que DIX. Les sept autres n'ont pas de cible, et leur en
    // inventer une serait une opinion déguisée en source.
    //
    expect(KPI_TARGETS).toHaveLength(10)
    // Et les DEUX familles sont représentées : huit qui parlent de l'ESN, deux
    // qui parlent de ce qu'on ignore d'elle.
    expect(KPI_TARGETS.filter(target => target.measures === 'completeness')).toHaveLength(2)
    expect(KPI_TARGETS.filter(target => target.measures === 'performance')).toHaveLength(8)
  })

  it('la cible des CRA porte sur la PONCTUALITÉ, pas sur l’état à la clôture', () => {
    // Le dictionnaire porte deux indicateurs voisins. « Avant J+5 » est la
    // mesure que la source chiffre ; « à la clôture » est un état à un instant,
    // et lui coller les 85 % afficherait du vert sur un mois où tout est arrivé
    // le 28 — trois semaines trop tard pour facturer.
    expect(kpiTarget('timesheets_on_time')?.bound).toBe(85)
    expect(kpiTarget('timesheets_received')).toBeNull()
  })

  it('les deux cibles qui existaient déjà ailleurs sont RÉFÉRENCÉES, pas recopiées', () => {
    // GA-26. `HYGIENE_THRESHOLDS` portait déjà « marge non mesurée < 10 % »
    // (sous le nom `missions_without_cost`) et « missions sans date de fin :
    // 0 ». Si quelqu'un re-code le nombre en dur ici, ce test survit ; s'il
    // déplace la limite d'hygiène sans que la cible suive, il tombe — et c'est
    // précisément la divergence qu'on veut rendre impossible.
    expect(kpiTarget('unmeasured_margin')?.bound).toBe(HYGIENE_THRESHOLDS.missions_without_cost.limit * 100)
    expect(kpiTarget('missions_without_end_date')?.bound).toBe(HYGIENE_THRESHOLDS.missions_without_end_date.limit)
  })
})

describe('les cibles — forme et provenance', () => {
  it('chaque cible passe son schéma', () => {
    for (const target of KPI_TARGETS) {
      const parsed = kpiTargetSchema.safeParse(target)
      expect(parsed.success, `${target.kpi}: ${parsed.success ? '' : parsed.error.message}`).toBe(true)
    }
  })

  it('chaque cible désigne une clé qui existe au dictionnaire', () => {
    // Sans ce lien, une cible peut survivre au renommage de l'indicateur
    // qu'elle vise : elle s'affiche alors nulle part, et personne ne le sait.
    const keys = new Set(MANAGER_KPIS.map(kpi => kpi.key))
    const orphans = KPI_TARGETS.filter(target => !keys.has(target.kpi)).map(target => target.kpi)
    expect(orphans).toEqual([])
  })

  it('aucun indicateur ne porte deux cibles', () => {
    const keys = KPI_TARGETS.map(target => target.kpi)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('chaque cible cite sa source', () => {
    // « Un seuil dont on a perdu le repère redevient une opinion. »
    for (const target of KPI_TARGETS) {
      expect(target.source.length, target.kpi).toBeGreaterThan(8)
    }
  })

  it('les deux cibles de COMPLÉTUDE sont nommées comme telles', () => {
    // Elles ne mesurent pas la performance de l'ESN : elles mesurent notre
    // propre ignorance. « Marge non mesurée < 10 % » ne dit pas qu'on gagne de
    // l'argent, il dit qu'on sait de quoi on parle. L'écran doit le distinguer.
    const completeness = KPI_TARGETS.filter(target => target.measures === 'completeness').map(target => target.kpi)
    expect(completeness.sort()).toEqual(['unmeasured_margin', 'unmeasurable_missions'].sort())
  })
})

describe('kpiTarget — la résolution', () => {
  it('rend la cible d’un indicateur qui en porte une', () => {
    expect(kpiTarget('dso_days')?.bound).toBe(65)
    expect(kpiTarget('dso_days')?.direction).toBe('below')
  })

  it('rend `null` — et non une cible inventée — pour un indicateur sans cible', () => {
    expect(kpiTarget('missions_active')).toBeNull()
    expect(kpiTarget('cet_indicateur_nexiste_pas')).toBeNull()
  })
})

describe('compareToTarget — une absence n’est jamais un échec', () => {
  const below = kpiTarget('dso_days')!
  const above = kpiTarget('timesheets_on_time')!
  const band = kpiTarget('gross_margin')!
  const zero = kpiTarget('missions_without_end_date')!

  it('`null` rend « non mesuré », jamais « hors cible »', () => {
    // LE test du lot. Un DSO non mesurable comparé à « < 65 j » comme s'il
    // valait 0 s'afficherait VERT : « on est payé le jour même ». Le pire
    // mensonge possible sur cet écran.
    for (const target of KPI_TARGETS) {
      expect(compareToTarget(null, target), target.kpi).toBe('unmeasured')
      expect(compareToTarget(undefined, target), target.kpi).toBe('unmeasured')
    }
  })

  it('un nombre illisible rend « non mesuré » lui aussi', () => {
    expect(compareToTarget(Number.NaN, below)).toBe('unmeasured')
    expect(compareToTarget(Number.POSITIVE_INFINITY, below)).toBe('unmeasured')
  })

  it('« moins est mieux » — strictement sous la borne', () => {
    expect(compareToTarget(52, below)).toBe('on_target')
    expect(compareToTarget(71, below)).toBe('off_target')
    // La source écrit « < 65 j », pas « ≤ ». 65 est le repère de marché, pas la
    // cible : l'atteindre, c'est faire comme tout le monde.
    expect(compareToTarget(65, below)).toBe('off_target')
    // Et 0 est une VRAIE valeur ici, du bon côté : payé le jour même.
    expect(compareToTarget(0, below)).toBe('on_target')
  })

  it('« plus est mieux » — strictement au-dessus de la borne', () => {
    expect(compareToTarget(91, above)).toBe('on_target')
    expect(compareToTarget(72, above)).toBe('off_target')
    expect(compareToTarget(85, above)).toBe('off_target')
    // Le zéro qui ment dans l'autre sens : 0 % de CRA reçus est un VRAI zéro,
    // et il est hors cible. C'est pourquoi `null` doit être un état à part.
    expect(compareToTarget(0, above)).toBe('off_target')
  })

  it('une bande — les deux bornes comprises', () => {
    expect(band.upperBound).toBe(40)
    expect(compareToTarget(31, band)).toBe('on_target')
    expect(compareToTarget(25, band)).toBe('on_target')
    expect(compareToTarget(40, band)).toBe('on_target')
    expect(compareToTarget(18, band)).toBe('off_target')
    // Au-dessus de la bande AUSSI : une marge de 62 % sur une mission de régie
    // ne se félicite pas, elle se vérifie — presque toujours un coût non saisi.
    expect(compareToTarget(62, band)).toBe('off_target')
  })

  it('une cible à zéro — zéro exactement, et rien d’autre', () => {
    expect(zero.bound).toBe(0)
    expect(compareToTarget(0, zero)).toBe('on_target')
    expect(compareToTarget(1, zero)).toBe('off_target')
    // Un compte négatif n'est pas « mieux que zéro » : c'est une lecture ratée.
    expect(compareToTarget(-3, zero)).toBe('unmeasured')
  })
})

/**
 * GA — la prose du dictionnaire ne contredit pas la cible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE A TROUVÉ EN NAISSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois seuils du dictionnaire énonçaient un nombre DIFFÉRENT de celui de la
 * source, et personne ne pouvait le voir parce que la source n'était écrite
 * nulle part dans le code :
 *
 *  · `timesheets_on_time` et `timesheets_received` — « Sous 90 % » là où la
 *    source dit « CRA reçus avant J+5 > 85 % » ;
 *  · `unmeasured_margin` — « Au-delà de 20 % » là où la source dit « marge non
 *    mesurée < 10 % ». Le 20 % existe bien dans la source, mais il appartient à
 *    un AUTRE indicateur (« missions non mesurables < 20 % »). Deux cibles
 *    fusionnées en une seule, c'est-à-dire une cible perdue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT ELLE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle extrait de la prose les nombres en POURCENTAGE et en JOURS — les deux
 * unités où une confusion se paie — et exige que chacun soit soit une borne de
 * la cible, soit une exception NOMMÉE avec sa raison. « 10 factures payées »
 * n'est ni l'un ni l'autre : ce n'est ni un pourcentage ni un nombre de jours,
 * et la garde ne le voit pas, ce qui est juste.
 */
const PERCENT_IN_PROSE = /(\d+(?:[.,]\d+)?)\s*%/g
const DAYS_IN_PROSE = /(\d+(?:[.,]\d+)?)\s*(?:j\b|jours?\b)/g

/**
 * Les nombres qui ont le droit de vivre dans la prose SANS être la cible.
 *
 * Chacun est un objet DIFFÉRENT de la cible, pas une tolérance : les mélanger
 * ferait de cette garde une décoration.
 */
const PROSE_EXCEPTIONS: readonly { kpi: string; number: number; unit: 'percent' | 'days'; why: string }[] = [
  {
    kpi: 'bench_rate',
    number: 15,
    unit: 'percent',
    why: "15 % est le niveau CRITIQUE, la cible est « bien piloté < 5 % ». Deux paliers, deux gestes : à 5 % on regarde, à 15 % on arrête d'embaucher.",
  },
  {
    kpi: 'bench_duration_days',
    number: 30,
    unit: 'days',
    why: 'La routine MIS-11 du PDF 5 §12 se déclenche à 30 jours sur UNE personne ; la cible du §13.3 porte sur la DURÉE MOYENNE et vaut 41 jours. Deux nombres, deux objets — le second est le repère de marché (« intercontrat moyen 11,4 % pour 41 jours »).',
  },
]

function numbersIn(prose: string, pattern: RegExp): number[] {
  // ⚠️ `RegExp.test`/`exec` avec le drapeau `g` est STATEFUL : une expression
  // partagée entre deux appels reprend là où elle s'était arrêtée. On la
  // reconstruit à chaque lecture — le défaut a déjà été payé dans ce dépôt.
  const fresh = new RegExp(pattern.source, 'g')
  return [...prose.matchAll(fresh)].map(match => Number(match[1].replace(',', '.')))
}

describe('GA — la prose du dictionnaire ne contredit jamais la cible', () => {
  it('lit vraiment les seuils du dictionnaire', () => {
    const targeted = MANAGER_KPIS.filter(kpi => kpi.threshold.length > 0)
    expect(targeted.length).toBe(MANAGER_KPIS.length)
    // Et elle lit au moins une prose qui PORTE un pourcentage, sans quoi
    // l'extracteur pourrait être cassé sans que rien ne le dise.
    const withPercent = MANAGER_KPIS.filter(kpi => numbersIn(kpi.threshold, PERCENT_IN_PROSE).length > 0)
    expect(withPercent.length).toBeGreaterThan(3)
  })

  it('aucun nombre de la prose ne contredit la cible de son indicateur', () => {
    const offenders: string[] = []
    for (const target of KPI_TARGETS) {
      const kpi = MANAGER_KPIS.find(entry => entry.key === target.kpi)
      if (!kpi) continue
      const bounds = new Set([target.bound, ...(target.upperBound === null ? [] : [target.upperBound])])
      const units = [
        { unit: 'percent' as const, found: numbersIn(kpi.threshold, PERCENT_IN_PROSE) },
        { unit: 'days' as const, found: numbersIn(kpi.threshold, DAYS_IN_PROSE) },
      ]
      for (const { unit, found } of units) {
        for (const value of found) {
          // Un nombre d'une autre unité que celle de la cible ne la contredit
          // pas : « 30 jours » sous une cible en pourcentage parle d'autre chose.
          if (unit !== target.unit) continue
          if (bounds.has(value)) continue
          const excused = PROSE_EXCEPTIONS.some(
            exception => exception.kpi === target.kpi && exception.number === value && exception.unit === unit,
          )
          if (!excused) offenders.push(`${target.kpi}: la prose dit ${value} ${unit}, la cible dit ${[...bounds]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('chaque exception porte sa raison, et vise un indicateur qui a une cible', () => {
    const targeted = new Set(KPI_TARGETS.map(target => target.kpi))
    for (const exception of PROSE_EXCEPTIONS) {
      expect(targeted.has(exception.kpi), exception.kpi).toBe(true)
      expect(exception.why.length, exception.kpi).toBeGreaterThan(60)
    }
  })
})
