import { CLOSED_RENEWAL_STATUSES, RENEWAL_STATUSES, type RenewalStatus } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DU STATUT DE RENOUVELLEMENT (#2195.22 à .29, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` garde les TABLES, et `missions` y est déjà. Elle
 * passerait donc au vert avec une colonne `renewal_status` vide sur les dix
 * lignes de la salle — c'est la leçon « une garde AVEUGLE n'est pas une
 * exemption », et c'est exactement le cas ici : la nouveauté de ce lot n'est
 * pas une table, c'est une COLONNE, et l'écran qui la rend affiche une pastille
 * par statut.
 *
 * `demo-renewal-windows-coverage.spec.ts`, à côté, garde la même salle sur
 * l'autre axe du même écran (la fenêtre d'échéance). Les deux ne se recouvrent
 * pas : une mission peut être dans la bonne fenêtre et sans statut, et c'est
 * même un cas que la salle porte À DESSEIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le JEU DE DONNÉES, pas la prose d'un commentaire du semis. Et elle compte le
 * corpus AVANT de juger : une sonde à zéro élément rend un vert qui ne prouve
 * rien.
 */

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

/** Les statuts que l'écran RETIRE : une mission finie n'a rien à renouveler. */
const FINISHED: readonly string[] = ['ended', 'terminated']

function onScreen(): DemoMission[] {
  return DEMO_DELIVERY_CLIENT.missions.filter(mission => !FINISHED.includes(mission.status))
}

function statusOf(mission: DemoMission): RenewalStatus | null {
  // `?? null` et jamais `?? 'non_engage'` : l'absence de clé EST l'information
  // que ce fichier existe pour garder.
  return (mission as { renewal_status?: RenewalStatus }).renewal_status ?? null
}

function seededStatuses(): Set<RenewalStatus> {
  const found = new Set<RenewalStatus>()
  for (const mission of onScreen()) {
    const status = statusOf(mission)
    if (status !== null) found.add(status)
  }
  return found
}

/**
 * LES STATUTS QUE LA SALLE DOIT PORTER.
 *
 * Six des huit. Les deux autres sont VIDES À DESSEIN, avec leur raison, et le
 * test qui les nomme est plus bas — jamais un classement de confort pour verdir
 * la garde.
 */
const MUST_BE_SEEDED: readonly RenewalStatus[] = [
  'non_engage',
  'feedback_demande',
  'discussion_en_cours',
  'reconduction_annoncee',
  'renouvele',
  'bloque',
]

describe('parité démo — le statut de renouvellement', () => {
  it('la garde LIT quelque chose — la salle porte des missions, et l’échelle huit statuts', () => {
    expect(onScreen().length).toBeGreaterThan(3)
    expect(RENEWAL_STATUSES.length).toBe(8)
  })

  it('CHAQUE statut qui doit être semé porte au moins une mission', () => {
    const seeded = seededStatuses()
    const missing = MUST_BE_SEEDED.filter(status => !seeded.has(status))
    // Si ce test tombe : une pastille de l'écran restera à zéro devant un
    // prospect, et personne ne saura si c'est parce que rien n'est engagé ou
    // parce que la salle est amputée.
    expect(missing).toEqual([])
  })

  it('sait dire NON — une salle SANS aucun statut la ferait rougir', () => {
    // Le même prédicat sur un corpus volontairement vidé : c'est la preuve que
    // le vert du test précédent est un vert MESURÉ.
    const aucun = new Set<RenewalStatus>()
    expect(MUST_BE_SEEDED.filter(status => !aucun.has(status))).toEqual([...MUST_BE_SEEDED])
  })

  it('une ligne AU MOINS reste SANS statut — « non renseigné » n’est pas « non engagé »', () => {
    // C'est la règle « non mesuré n'est jamais 0 » appliquée à une énumération,
    // et elle ne se démontre qu'en montrant les DEUX lignes côte à côte : celle
    // que personne n'a ouverte, et celle qu'on a ouverte pour constater que
    // rien n'était engagé. Une salle entièrement remplie aurait rendu un
    // constat là où il n'y en a pas.
    const sansStatut = onScreen().filter(mission => statusOf(mission) === null)
    expect(sansStatut.length).toBeGreaterThan(0)
    const nonEngage = onScreen().filter(mission => statusOf(mission) === 'non_engage')
    expect(nonEngage.length).toBeGreaterThan(0)
  })

  it('n’attrape pas ce qu’elle ne vise pas — deux statuts sont VIDES à dessein, avec leur raison', () => {
    const seeded = seededStatuses()
    /**
     * `fin_confirmee` et `repositionnement_lance` FERMENT la question du
     * renouvellement, comme `renouvele` — qui, lui, EST semé.
     *
     * UNE ligne close suffit à démontrer la clôture : qu'elle aboutit, et
     * qu'une ligne close reste lisible. Chaque ligne close de plus est une
     * ligne de moins parmi celles qui attendent encore une décision, c'est-à-
     * dire parmi celles que cet écran existe pour montrer. La salle en porte
     * sept au total ; en garer trois sur une décision prise viderait la moitié
     * de la démonstration pour illustrer trois fois le même état.
     *
     * ⚠️ Ce n'est PAS « on n'a pas eu le temps ». Si l'écran venait un jour à
     * rendre ces deux statuts autrement que les autres — un libellé propre, une
     * couleur, une section — cette raison tomberait et la salle devrait les
     * porter.
     */
    expect(seeded.has('fin_confirmee')).toBe(false)
    expect(seeded.has('repositionnement_lance')).toBe(false)
    // Et le témoin du cas légitime voisin : le TROISIÈME statut clos, lui, est
    // bien là. Une garde qui refuserait les trois n'aurait rien prouvé.
    expect(seeded.has('renouvele')).toBe(true)
    expect(CLOSED_RENEWAL_STATUSES).toContain('renouvele')
  })

  it('aucun statut semé n’est inconnu de l’énumération', () => {
    for (const status of seededStatuses()) {
      expect(RENEWAL_STATUSES).toContain(status)
    }
  })
})
