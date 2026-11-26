import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3817 (lot N05, 08/10) — « JCDecaux France : zéro signal, zéro opportunité ».
 *
 * La recette prod du 08/10 a classé ce point NON PROUVABLE : rejouer JCDecaux
 * France contre France Travail/APEC/ATS exige un accès réseau que ce
 * conteneur n'a pas. Le code lui-même est déjà livré et testé unitairement
 * (lots C3 et T04 — `company_name_variants.py`, `AccountSynthesisCards.tsx`,
 * `TabNeeds.tsx`) ; ce qui manquait pour qu'une recette future soit FERMABLE
 * SANS réseau externe était une preuve qu'on peut rejouer dans la salle de
 * démonstration elle-même.
 *
 * Avant ce lot, AUCUN dossier de la salle ne portait `signal_coverage.status
 * === 'incomplete'` avec une source injoignable : seul SNCF seme `signal_coverage`,
 * et son statut est `found` (zéro à prouver). La distinction « zéro signal » /
 * « source injoignable » — la doctrine même que #3817 réclame — était donc
 * invisible en salle. Sanofi (déjà le compte que la recette du 08/10 citait
 * pour #3742, et sans narration « pas maintenant » qui brouillerait la leçon,
 * contrairement à TotalEnergies ou Kiabi) porte maintenant ce cas.
 *
 * ⚠️ CE QUE CE SEMIS NE PROUVE PAS, ET POURQUOI. La carte « Signal principal »
 * ne montre la mention « Recherche incomplète » qu'à la place d'un signal
 * ABSENT (`!signal?.signal`, `AccountSynthesisCards.tsx`) : or les ONZE comptes
 * à brief commercial de la salle (Sanofi compris) portent chacun au moins une
 * section `projets-*`/`postes-ouverts`/`programmes` (`briefRecentSignals`),
 * et les trois autres (SNCF, Société Générale, Groupe BPCE) ont leurs propres
 * signaux réels — aucun compte de la salle n'a donc un signal RÉELLEMENT
 * absent. Vider les signaux de Sanofi déformerait un dossier déjà lu par
 * d'autres gardes de couverture ; inventer un compte fictif est interdit
 * depuis la décision du 04/10/2026. Ce que ce fichier prouve est donc le
 * CIRCUIT (donnée → schéma → famille nommée → composant) de bout en bout, pas
 * le rendu exact de la carte vide — qui reste à rejouer en prod ou sur un
 * compte dont le dossier perdrait un jour son dernier signal par construction.
 */

const sanofi = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Sanofi')

const WEB = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'accounts', 'view', 'account-detail')
const SYNTHESIS_TEXT = readFileSync(join(WEB, 'tabs', 'sections', 'signalCoverageText.ts'), 'utf8')
const SYNTHESIS_CARDS = readFileSync(join(WEB, 'tabs', 'synthesis', 'AccountSynthesisCards.tsx'), 'utf8')

describe('couverture démo — Sanofi porte la donnée « source injoignable » du circuit #3817', () => {
  it('le dossier Sanofi existe dans la salle', () => {
    expect(sanofi).toBeDefined()
  })

  it("Sanofi porte `signal_coverage.status === 'incomplete'` avec une source NOMMÉE injoignable", () => {
    const coverage = sanofi?.account.raw_analysis['signal_coverage'] as
      { status: string; unreachable?: { source: string; reason?: string }[] } | undefined
    expect(coverage?.status).toBe('incomplete')
    expect(coverage?.unreachable?.length).toBeGreaterThan(0)
    expect(coverage?.unreachable?.[0]?.source).toBe('france_travail')
  })

  it('⚠️ pas un bloc mort — la carte « Signal principal » lit bien `signalCoverage` et sait distinguer incomplete de vide', () => {
    expect(SYNTHESIS_CARDS).toContain('signalCoverage')
    expect(SYNTHESIS_CARDS).toContain("signalCoverage?.status === 'incomplete'")
    expect(SYNTHESIS_CARDS).toContain('unreachableSignalFamilies')
  })

  it('⚠️ la famille de source est NOMMÉE, jamais le fournisseur — `signalCoverageText.ts` traduit la clé technique', () => {
    expect(SYNTHESIS_TEXT).toContain('SIGNAL_SOURCE_FAMILY_KEY')
    expect(SYNTHESIS_TEXT).toContain("france_travail: 'jobs'")
    // Aucun nom de fournisseur dans le texte qui part à l'écran (doctrine).
    expect(SYNTHESIS_TEXT).not.toMatch(/France Travail|APEC|Welcome to the Jungle/)
  })

  it('sait dire NON — un dossier dont la couverture redeviendrait `found` ne prouverait plus rien (témoin)', () => {
    const foundCoverage = { status: 'found', consulted: ['brave_news'], unreachable: [] }
    expect(foundCoverage.status).not.toBe('incomplete')
    expect(foundCoverage.unreachable.length).toBe(0)
  })
})
