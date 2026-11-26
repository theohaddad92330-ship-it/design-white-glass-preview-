import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach } from 'vitest'
import { i18n } from '@/i18n'
import { CandidateScore } from './CandidateScore'

vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: () => ({ data: undefined }),
}))

/**
 * Le défaut vécu par l'utilisateur : « chaque entreprise trouvée revient à
 * 0/100 ». La cause était en amont (le chemin Signaux ne calculait aucun score
 * et l'UI comblait l'absence par un 0), mais c'est ICI que le mensonge devenait
 * visible. Ce fichier verrouille la règle d'affichage : on ne rend un chiffre
 * que quand il y a eu une mesure, et on nomme ce qui n'a pas pu être mesuré.
 */
describe('CandidateScore', () => {
  const factor = { label: 'Signaux datés (2)', points: 18, evidence: 'AO IT publié (2026-06-01)' }

  it('shows the score against the criteria actually measured, not always /100', () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={['age']} factors={[factor]} />)
    expect(screen.getByText('45/75')).toBeInTheDocument()
  })

  it('renders a plain /100 when every criterion could be measured', () => {
    render(<CandidateScore score={82} scoreMax={100} unmeasured={[]} factors={[factor]} />)
    expect(screen.getByText('82/100')).toBeInTheDocument()
  })

  it('says the score is unavailable instead of showing 0 when nothing was measurable', () => {
    render(<CandidateScore score={null} scoreMax={null} unmeasured={['activity', 'age']} factors={[]} />)

    expect(screen.getByText(/indisponible/i)).toBeInTheDocument()
    // La régression exacte : « 0/100 » ne doit plus jamais apparaître pour une
    // absence de mesure — il se lirait « ce compte ne vaut rien ».
    expect(screen.queryByText('0/100')).not.toBeInTheDocument()
  })

  it('names the criteria it could not evaluate', async () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={['age']} factors={[factor]} />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText(/Non évalué faute de donnée/i)).toBeInTheDocument()
    expect(screen.getByText(/ancienneté/i)).toBeInTheDocument()
  })

  it('keeps every displayed point attached to its evidence', async () => {
    render(<CandidateScore score={18} scoreMax={45} unmeasured={[]} factors={[factor]} />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Signaux datés (2)')).toBeInTheDocument()
    expect(screen.getByText('AO IT publié (2026-06-01)')).toBeInTheDocument()
  })

  /**
   * #2740 — en production, ce libellé se compressait à ~56 px sur 3 lignes
   * derrière les badges voisins (déjà `shrink-0`) du bouton parent
   * `flex items-center gap-2`. Il ne doit ni rétrécir ni passer à la ligne.
   */
  it('#2740 — le lien « Voir le détail du score » ne rétrécit ni ne s’enroule', () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={['age']} factors={[factor]} />)

    const label = screen.getByText('Voir le détail du score')
    expect(label.className).toContain('shrink-0')
    expect(label.className).toContain('whitespace-nowrap')
  })
})

/**
 * Manque A du 30/08 : une classe d'accès (tome 3) sans stratégie n'est qu'un
 * badge. Les quatre phrases sont sourcées `agent_docs/recomptages/PDF-08.md`
 * (items #33-36, citant l.139/142/145/148 de la source) — jamais inventées ici.
 */
describe('CandidateScore — la stratégie par classe (§1.4 du tome 3)', () => {
  const factor = { label: 'Signaux datés (2)', points: 18, evidence: 'AO IT publié (2026-06-01)' }

  function barrierOf(access_class: 'A' | 'B' | 'C' | 'D') {
    return {
      score: 2,
      accessibility: 8,
      access_class,
      label: 'Ouvert probable',
      proxies: [],
      measurable: true,
      missing: [],
      corrections: [],
    }
  }

  it('affiche la stratégie A — direct, cycle court, le décideur est le prescripteur', async () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrierOf('A')} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/direct.*cycle court.*prescripteur/i)).toBeInTheDocument()
  })

  it('affiche la stratégie B — viser une BU, jamais le siège', async () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrierOf('B')} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/viser une bu.*jamais le siège/i)).toBeInTheDocument()
  })

  it('affiche la stratégie C — passer par un référencé, ou attendre la fenêtre', async () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrierOf('C')} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/référencé.*fenêtre/i)).toBeInTheDocument()
  })

  it('affiche la stratégie D — ne pas investir sans partenaire ou fenêtre datée', async () => {
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrierOf('D')} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/ne pas investir sans partenaire/i)).toBeInTheDocument()
  })

  it('ne montre aucune stratégie quand la barrière n’est pas estimable — non estimable n’est pas une classe', async () => {
    const barrier = {
      score: null,
      accessibility: null,
      access_class: null,
      label: null,
      proxies: [],
      measurable: false,
      missing: ['statut', 'effectif'],
      corrections: [],
    }
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrier} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.queryByText(/prescripteur/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/viser une bu/i)).not.toBeInTheDocument()
  })
})

/**
 * Un libellé d'AFFICHAGE écrit hors du catalogue i18n est français pour
 * toujours (09/09) : le service IA parlait français dans sa charge utile, et
 * l'écran le rendait verbatim — en anglais, l'utilisateur lisait « Relation —
 * L'entrée n'est pas froide ».
 *
 * Le correctif ajoute `label_key`/`label_params`, STRICTEMENT ADDITIF. Ces
 * tests protègent les DEUX moitiés de la promesse :
 *
 * - un facteur qui les porte est TRADUIT (le correctif marche) ;
 * - un facteur qui ne les porte PAS reste un `label` affiché tel quel — c'est
 *   le repli qui rend inoffensive la fenêtre où le web est déployé et l'IA ne
 *   l'est pas encore : un candidat produit par l'ancien service ne doit ni
 *   planter l'écran, ni afficher une clé brute.
 */
describe('CandidateScore — repli label_key → label (fenêtre de déploiement)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })
  afterEach(cleanup)

  it('affiche le label brut quand label_key est absent — le cas « IA ancienne »', async () => {
    const factor = { label: 'Signaux datés (2)', points: 18, evidence: 'AO IT publié (2026-06-01)' }
    render(<CandidateScore score={18} scoreMax={20} unmeasured={[]} factors={[factor]} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Signaux datés (2)')).toBeInTheDocument()
  })

  it('préfère la traduction de label_key quand elle est là, en français', async () => {
    const factor = {
      label: 'Signaux datés (2)',
      points: 18,
      evidence: 'AO IT publié (2026-06-01)',
      label_key: 'factors.signalsDated',
      label_params: { count: 2 },
    }
    render(<CandidateScore score={18} scoreMax={20} unmeasured={[]} factors={[factor]} />)
    await userEvent.click(screen.getByRole('button'))
    // Même texte en français — la clé et le repli disent la même chose ici,
    // le test suivant prouve que ce n'est PLUS vrai en anglais.
    expect(screen.getByText('Signaux datés (2)')).toBeInTheDocument()
  })

  it('rend la traduction ANGLAISE de label_key — la preuve que ce n’est pas juste le repli', async () => {
    await i18n.changeLanguage('en')
    const factor = {
      label: 'Signaux datés (2)',
      points: 18,
      evidence: 'AO IT publié (2026-06-01)',
      label_key: 'factors.signalsDated',
      label_params: { count: 2 },
    }
    render(<CandidateScore score={18} scoreMax={20} unmeasured={[]} factors={[factor]} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Dated signals (2)')).toBeInTheDocument()
    // Le français d'origine n'apparaît nulle part : ce n'est pas un repli qui
    // a discrètement gagné, c'est la vraie traduction.
    expect(screen.queryByText('Signaux datés (2)')).not.toBeInTheDocument()
  })

  it('retombe sur le label français si la clé est inconnue du catalogue — jamais une clé brute à l’écran', async () => {
    await i18n.changeLanguage('en')
    const factor = {
      label: 'Un libellé jamais traduit',
      points: 3,
      evidence: 'preuve',
      label_key: 'factors.uneCleInconnue',
    }
    render(<CandidateScore score={3} scoreMax={10} unmeasured={[]} factors={[factor]} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Un libellé jamais traduit')).toBeInTheDocument()
    expect(screen.queryByText('factors.uneCleInconnue')).not.toBeInTheDocument()
  })

  it('traduit le libellé de classe de la barrière par son access_class, jamais le texte français brut', async () => {
    await i18n.changeLanguage('en')
    const factor = { label: 'Signaux datés (2)', points: 18, evidence: 'AO IT publié (2026-06-01)' }
    const barrier = {
      score: 6.1,
      accessibility: 3.9,
      access_class: 'A' as const,
      label: 'Ouvert probable',
      proxies: [],
      measurable: true,
      missing: [],
      corrections: [],
    }
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrier} />)
    expect(screen.getByText(/Likely open/)).toBeInTheDocument()
    expect(screen.queryByText(/Ouvert probable/)).not.toBeInTheDocument()
  })

  it('traduit une correction datée par son key, jamais le texte français brut', async () => {
    await i18n.changeLanguage('en')
    const factor = { label: 'Signaux datés (2)', points: 18, evidence: 'AO IT publié (2026-06-01)' }
    const barrier = {
      score: 6.1,
      accessibility: 3.9,
      access_class: 'A' as const,
      label: 'Ouvert probable',
      proxies: [],
      measurable: true,
      missing: [],
      corrections: [
        {
          key: 'echeance_proche',
          delta: -1.5,
          label: 'Le marché en place arrive à échéance',
          evidence: 'marché public en cours jusqu’au 2027-01-01',
        },
      ],
    }
    render(<CandidateScore score={45} scoreMax={75} unmeasured={[]} factors={[factor]} barrier={barrier} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/The current contract is coming up for renewal/)).toBeInTheDocument()
    expect(screen.queryByText(/Le marché en place arrive à échéance/)).not.toBeInTheDocument()
  })
})
