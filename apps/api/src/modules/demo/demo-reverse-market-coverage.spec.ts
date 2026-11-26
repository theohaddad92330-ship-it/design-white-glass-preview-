import { departmentsFromZones, reverseMarketUnavailability } from '../consultants/matching/reverse-market'
import { DEMO_REVERSE_MARKET_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_TERRITORY_SNAPSHOTS } from './demo-dataset'

/**
 * LA PROSPECTION INVERSÉE VERS LE MARCHÉ EST RÉELLEMENT MONTRÉE EN DÉMONSTRATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Cette garde affirmait le contraire jusqu'au 01/09 — « vide à dessein,
 * `territory_snapshots` n'est jamais semé ». C'était vrai, et un autre lot de
 * la même vague l'a rendu faux en semant des photos portant `source = 'demo'`,
 * séparées des relevés réels par cette colonne.
 *
 * Elle ne se contente donc plus de CONSTATER un état : elle vérifie que les
 * départements réellement semés (`DEMO_TERRITORY_SNAPSHOTS`) suffisent à
 * résoudre la zone d'un consultant du vivier. Le jour où quelqu'un retire les
 * photos du Rhône, ou la zone `'69'` de Camille, elle tombe — et c'est le seul
 * moyen de savoir qu'un écran de démonstration s'est vidé.
 *
 * Elle n'a pas de base Postgres : elle relit les MÊMES fonctions pures que le
 * serveur (`departmentsFromZones`, `reverseMarketUnavailability`, importées de
 * `reverse-market.ts`, jamais recopiées).
 */
describe('couverture de la prospection inversée vers le marché', () => {
  const camille = DEMO_CONSULTANTS.find(consultant => consultant.full_name === 'Camille Roussel')

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(DEMO_CONSULTANTS.length).toBeGreaterThan(0)
    expect(camille).toBeDefined()
  })

  it('Camille Roussel porte un VRAI code de département, pas seulement un libellé de région', () => {
    // 'IDF' reste sur la fiche (d'autres écrans le lisent) mais ne désigne
    // aucun département — c'est exactement pour ça que ce lot ajoute '69'.
    expect(camille!.zones).toContain('IDF')
    expect(camille!.zones).toContain('69')
  })

  it('sur une base FRAÎCHE (aucun relevé), le marché rend `zones_unresolved` — honnête, pas cassé', () => {
    const known: readonly string[] = [] // `SELECT DISTINCT department FROM territory_snapshots` sur une table vide.
    const { departments, unresolved } = departmentsFromZones(camille!.zones, known)
    expect(departments).toEqual([])
    expect(unresolved).toEqual(expect.arrayContaining(['IDF', '69']))
    const reason = reverseMarketUnavailability(camille!.zones, departments, camille!.stack, 0)
    expect(reason).toBe('zones_unresolved')
  })

  it('les départements RÉELLEMENT semés résolvent la zone de Camille', () => {
    // ⚠️ Pas une liste écrite à la main : ce que `knownDepartments('demo')`
    // lira en base après le semis. Une garde qui pose ses propres départements
    // se prouverait à elle-même, et resterait verte le jour où le semis change.
    const known = [...new Set(DEMO_TERRITORY_SNAPSHOTS.map(photo => photo.department))].sort()
    expect(known.length).toBeGreaterThan(0)
    expect(known).toContain('69')
    const { departments, unresolved } = departmentsFromZones(camille!.zones, known)
    expect(departments).toEqual(['69'])
    // 'IDF' reste non résolu MÊME quand la veille couvre des départements —
    // ce n'est toujours pas un département, et ne le devient jamais.
    expect(unresolved).toEqual(['IDF'])
    const reason = reverseMarketUnavailability(camille!.zones, departments, camille!.stack, 1)
    expect(reason).toBeNull()
  })

  it('ne devine JAMAIS un département depuis un nom de ville — la garde sait dire non', () => {
    // Preuve que la garde ne se contente pas de constater un succès : une
    // zone plausible mais fausse ('Lyon', jamais saisie ainsi sur une fiche
    // du jeu) doit rester non résolue même quand '69' est connu.
    const { departments, unresolved } = departmentsFromZones(['Lyon'], ['69'])
    expect(departments).toEqual([])
    expect(unresolved).toEqual(['Lyon'])
  })

  it('la capacité est classée « seedée », et la raison nomme le cloisonnement', () => {
    expect(DEMO_REVERSE_MARKET_COVERAGE.state).toBe('seede')
    expect(DEMO_REVERSE_MARKET_COVERAGE.reason.length).toBeGreaterThan(60)
    // Une entrée « seedée » sur une table PARTAGÉE ne vaut que si la raison dit
    // pourquoi un client ne verra pas le décor. Sans cette phrase, la bascule
    // serait indiscernable d'un contournement de l'interdit qu'elle remplace.
    expect(DEMO_REVERSE_MARKET_COVERAGE.reason).toContain('source')
    expect(DEMO_REVERSE_MARKET_COVERAGE.reason).toContain('isDemoWorkspace')
  })
})
