import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DE LA FRISE DE PLANIFICATION (craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE À CÔTÉ DE `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `/missions/planification` n'ajoute AUCUNE table : elle lit `missions` et
 * `mission_assignments`, toutes deux déjà déclarées seedées. La garde par table
 * ne lui pose donc aucune question — et une frise vide en démonstration se
 * découvrirait en réunion, pas en CI. La maille manquante est ici.
 *
 * ⚠️ Une frise n'est pas remplie parce que la table l'est. Elle est remplie
 * quand des missions **recoupent la fenêtre affichée**, qui court du mois
 * précédent au surlendemain — soit environ [J-60, J+90] autour du jour où le
 * prospect ouvre le lien. Une salle dont toutes les missions se sont terminées
 * l'an dernier a une table pleine et un écran vide, et c'est exactement le
 * genre d'écart que « la table est seedée » ne voit pas.
 *
 * Les offsets du jeu sont RELATIFS au jour du semis (`started_days_ago`,
 * `ends_in_days`), donc ce raisonnement vaut quel que soit le jour d'ouverture.
 */

/** Les bornes de la fenêtre par défaut, en jours autour du semis.
 *
 *  La frise s'ouvre au 1er du mois PRÉCÉDENT et couvre quatre mois : le bord
 *  gauche est donc entre J-59 et J-28 selon le jour du mois, et le bord droit
 *  entre J+62 et J+92. On prend les bornes les plus DÉFAVORABLES — celles qui
 *  rendent la fenêtre la plus étroite — pour qu'un jour d'ouverture malchanceux
 *  ne fasse pas mentir la garde. */
const WINDOW_START_DAYS_AGO = 28
const WINDOW_END_DAYS_AHEAD = 62

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

/** Une mission est DESSINÉE si sa fenêtre recoupe celle de l'écran. Une fin
 *  absente ne ferme rien : elle court, donc elle recoupe. */
function isDrawn(mission: DemoMission): boolean {
  const startsAtOrBefore = -mission.started_days_ago <= WINDOW_END_DAYS_AHEAD
  const endsAtOrAfter = mission.ends_in_days === null || mission.ends_in_days >= -WINDOW_START_DAYS_AGO
  return startsAtOrBefore && endsAtOrAfter
}

/** Ce que la frise ne dessine pas : les missions terminées, écartées par défaut. */
const FINISHED = new Set(['ended', 'terminated'])

describe('parité démo — la frise de planification', () => {
  it('la garde LIT quelque chose — le jeu de données n’est pas vide', () => {
    // Le faux zéro silencieux : sur un jeu vide, tous les comptes ci-dessous
    // vaudraient 0 et seuls les seuils « au moins un » rougiraient.
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
    expect(DEMO_DELIVERY_CLIENT.missions.every(mission => typeof mission.label === 'string')).toBe(true)
  })

  it('la salle de démonstration a des barres à montrer, pas seulement une table pleine', () => {
    const drawn = DEMO_DELIVERY_CLIENT.missions.filter(mission => !FINISHED.has(mission.status) && isDrawn(mission))
    // Trois est le plancher en dessous duquel une frise ne ressemble plus à une
    // frise : deux barres se lisent comme deux lignes d'un tableau.
    expect(drawn.length).toBeGreaterThanOrEqual(3)
  })

  it('chaque mission dessinée porte QUELQU’UN — une barre anonyme ne dit pas qui est occupé', () => {
    // `mission_assignments` est écrite depuis le nom du consultant : une
    // mission sans consultant produirait une barre sans personne, sur l'écran
    // dont c'est précisément la question.
    const drawn = DEMO_DELIVERY_CLIENT.missions.filter(mission => !FINISHED.has(mission.status) && isDrawn(mission))
    expect(drawn.every(mission => typeof mission.consultant === 'string' && mission.consultant.length > 0)).toBe(true)
  })

  it('au moins une mission SANS DATE DE FIN est visible — c’est ce que l’écran démontre', () => {
    // ⚠️ La revendication propre de cet écran est qu'une fin absente ne se
    // dessine pas comme une fin : le bord est hachuré et nommé. Sans une seule
    // mission ouverte dans la salle, la démonstration ne montre jamais la
    // seule chose qui distingue cette frise d'un diagramme de Gantt ordinaire.
    const openEnded = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => mission.ends_in_days === null && !FINISHED.has(mission.status) && isDrawn(mission),
    )
    expect(openEnded.length).toBeGreaterThanOrEqual(1)
  })

  it('au moins une échéance TOMBE dans la fenêtre — sinon le compteur d’échéances est vide', () => {
    // Un compteur à zéro serait VRAI ici, et c'est bien le problème : le
    // prospect lirait « 0 échéance » et conclurait que l'écran ne sait pas les
    // voir. Le zéro juste et le zéro qui ment se ressemblent à l'écran.
    const ending = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        mission.ends_in_days !== null &&
        !FINISHED.has(mission.status) &&
        mission.ends_in_days >= -WINDOW_START_DAYS_AGO &&
        mission.ends_in_days <= WINDOW_END_DAYS_AHEAD,
    )
    expect(ending.length).toBeGreaterThanOrEqual(1)
  })

  it('sait dire NON — une mission hors fenêtre n’est pas comptée comme dessinée', () => {
    // La contrepartie obligatoire : sans elle, `isDrawn` pourrait rendre `true`
    // pour tout le monde et les quatre tests ci-dessus passeraient au vert sur
    // n'importe quel jeu de données.
    expect(isDrawn({ started_days_ago: 900, ends_in_days: -700 } as DemoMission)).toBe(false)
    expect(isDrawn({ started_days_ago: -400, ends_in_days: -300 } as DemoMission)).toBe(false)
    expect(isDrawn({ started_days_ago: 10, ends_in_days: null } as DemoMission)).toBe(true)
  })
})

/**
 * LE BADGE DE SURALLOCATION — #2989.2 (recette 26/09, « absent »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUNE MISSION NE CHANGE, ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `INSERT INTO mission_assignments` pose `load_percent: 100` sur CHAQUE
 * affectation, à dessein (`demo-seed.service.ts:4264`) : deux missions ACTIVES
 * en même temps pour la MÊME personne suffisent déjà à dépasser 100 %, sans
 * qu'aucune valeur n'ait besoin d'être inventée pour cette seule démonstration.
 * Yanis Berthier porte déjà cette paire — « Fiabilisation plateforme — renfort
 * exploitation » (J-24 → J+55) et « Refonte des applications voyageurs — forfait »
 * (J-40 → J+12), toutes deux `active` aujourd'hui — et ce test le PROUVE plutôt
 * que de le supposer : un jeu qui perdrait ce recoupement (l'une des deux
 * finie, ou l'une d'elles réaffectée) ferait ce test rouge, PAS la CI d'un
 * écran qui redeviendrait silencieusement vide en démonstration.
 */
describe('parité démo — le badge de surallocation (#2989.2)', () => {
  it('au moins une personne cumule plus de 100 % de charge aujourd’hui', () => {
    const activeToday = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        !FINISHED.has(mission.status) &&
        mission.started_days_ago >= 0 &&
        (mission.ends_in_days === null || mission.ends_in_days >= 0),
    )
    const activeMissionsByConsultant = new Map<string, number>()
    for (const mission of activeToday) {
      activeMissionsByConsultant.set(mission.consultant, (activeMissionsByConsultant.get(mission.consultant) ?? 0) + 1)
    }
    // Une seule affectation ACTIVE ne suffirait pas (100 % pile n'est pas une
    // surallocation, `planning-conflicts.ts`, `totalPercent > 100`) : il en
    // faut au moins DEUX, en même temps, pour la même personne.
    const overallocatedSomeone = [...activeMissionsByConsultant.values()].some(count => count * 100 > 100)
    expect(overallocatedSomeone).toBe(true)
  })
})
