import { RENEWAL_WINDOWS, renewalWindow, type RenewalWindow } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DE L'ÉCRAN DE DÉCISION DE RENOUVELLEMENT (#2195, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, ALORS QUE `demo-coverage.spec.ts` EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` garde les TABLES : elle vérifie que `missions` est
 * semée. C'est nécessaire et insuffisant, et c'est la leçon « une garde AVEUGLE
 * n'est pas une exemption » — une table peut être pleine et l'écran rendre des
 * pastilles à ZÉRO, parce que son filtre porte sur une DÉRIVATION et non sur
 * l'existence des lignes.
 *
 * L'écran de #2195 a exactement ce piège. Il range chaque mission dans une
 * fenêtre calculée à partir de `ends_on`, et `GET /delivery/renewals` ne sert
 * PAS `far` : une mission semée « dans cent vingt jours » n'apparaît nulle part
 * sur cet écran. Avant ce lot, la salle d'exemple portait TROIS missions dans
 * ce cas, et quatre des six fenêtres que l'issue nomme s'ouvraient à zéro
 * devant un prospect.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE RECOMPTE, ELLE NE CROIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La fenêtre est recalculée avec {@link renewalWindow}, la fonction que le
 * serveur appelle — jamais sur la prose d'un commentaire du semis. « Un audit
 * documentaire n'est pas le code. »
 */

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

/** Les statuts que l'écran RETIRE : une mission finie n'a rien à renouveler. */
const FINISHED: readonly string[] = ['ended', 'terminated']

/** Le semis exprime les dates en JOURS relatifs ; l'écran raisonne en dates. */
function endsOn(mission: DemoMission): string | null {
  if (mission.ends_in_days === null) return null
  return new Date(Date.now() + mission.ends_in_days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Les missions que l'ÉCRAN rendra — le filtre du service PUIS celui de la page.
 *
 * ⚠️ Les deux, et pas seulement le premier : `renewalsToAct` rend aussi les
 * missions terminées qui traînent dans une fenêtre actionnable, et c'est la
 * PAGE qui les retire (`isFinishedMission`). Compter sur le seul filtre serveur
 * ferait croire la salle plus fournie qu'elle ne l'est à l'écran.
 */
function onScreen(): DemoMission[] {
  return DEMO_DELIVERY_CLIENT.missions.filter(mission => !FINISHED.includes(mission.status))
}

function windowsOnScreen(): Map<RenewalWindow, number> {
  const counts = new Map<RenewalWindow, number>()
  for (const mission of onScreen()) {
    const window = renewalWindow(endsOn(mission))
    counts.set(window, (counts.get(window) ?? 0) + 1)
  }
  return counts
}

/**
 * LES FENÊTRES QUE LA SALLE DOIT REMPLIR.
 *
 * Quatre des six que l'issue nomme. Les deux autres sont VIDES À DESSEIN, avec
 * leur raison, et le test qui les nomme est juste en dessous — jamais un
 * classement de confort pour verdir la garde.
 */
const MUST_BE_SEEDED: readonly RenewalWindow[] = ['j60', 'j45', 'j30', 'j15', 'unknown']

describe('parité démo — les fenêtres de renouvellement', () => {
  it('la garde LIT quelque chose — la salle porte des missions, et l’échelle sept fenêtres', () => {
    // Le compte du corpus AVANT le jugement : une sonde à zéro élément rendrait
    // un vert qui ne prouve rien.
    expect(onScreen().length).toBeGreaterThan(3)
    expect(RENEWAL_WINDOWS.length).toBe(8)
  })

  it('CHAQUE fenêtre qui doit être semée porte au moins une mission', () => {
    const counts = windowsOnScreen()
    const empty = MUST_BE_SEEDED.filter(window => (counts.get(window) ?? 0) === 0)
    // Si ce test tombe : une pastille de l'écran restera à zéro devant un
    // prospect, et personne ne saura si c'est parce que tout va bien ou parce
    // que la salle est amputée.
    expect(empty).toEqual([])
  })

  it('sait dire NON — une salle rangée entièrement dans « loin » la ferait rougir', () => {
    // Le même prédicat sur un corpus volontairement cassé : c'est la preuve que
    // le vert du test précédent est un vert MESURÉ.
    const allFarAway = new Map<RenewalWindow, number>([['far', onScreen().length]])
    expect(MUST_BE_SEEDED.filter(window => (allFarAway.get(window) ?? 0) === 0)).toEqual([...MUST_BE_SEEDED])
  })

  it('n’attrape pas ce qu’elle ne vise pas — deux fenêtres sont VIDES à dessein, avec leur raison', () => {
    const counts = windowsOnScreen()
    /**
     * `overdue` — TOUTES les missions déjà échues de la salle sont volontairement
     * CLOSES (`ended` / `terminated`) et bornées à plus de soixante et un jours :
     * `invoice-readiness.service` retient `ends_on >= <1er du mois précédent>`,
     * et une mission close plus près réapparaîtrait certains jours du mois comme
     * un faux bloqueur de facturation. Cette borne-là est plus ancienne et plus
     * coûteuse que la pastille : on ne la lève pas pour remplir un compteur.
     * L'écran affiche donc « 0 échue », qui est un zéro MESURÉ et une bonne
     * nouvelle — pas un trou.
     */
    expect(counts.get('overdue') ?? 0).toBe(0)
    /**
     * `imminent` (≤ 10 jours) — ce n'est PAS une des six fenêtres que l'issue
     * nomme : elle existait avant J-15 et lui survit parce qu'elles comptent des
     * populations disjointes. La salle porte une mission à douze jours, donc
     * dans J-15 ; en descendre une sous dix jours n'ajouterait aucune capacité
     * à montrer, et « aucune échéance imminente » est une phrase vraie.
     */
    expect(counts.get('imminent') ?? 0).toBe(0)
  })

  it('les fenêtres s’ADDITIONNENT jusqu’au total — aucune mission entre deux seaux', () => {
    const counts = windowsOnScreen()
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
    expect(total).toBe(onScreen().length)
  })
})
