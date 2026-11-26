// #3995 revient sur #3676.6, délibérément (décision Louis 10/10) : la liste montre TOUS les signaux, y compris
// ceux déjà en piste (mention « En piste »). Ce qui tient encore : compteurs/sources/hypothèses lisent tous
// les événements et « Ce que cela implique commercialement » reste dédoublonné (TabSignal).
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { WatchSignalTimeline } from './WatchSignalTimeline'

const noop = () => {}

const signal = (over: Partial<WatchSignal>): WatchSignal => ({
  id: 's1',
  category: 'historique',
  date: '2021-03-01',
  type: 'projet',
  signal: 'Refonte du SI décisionnel',
  source: 'lemonde.fr',
  sourceUrl: null,
  sourceKind: null,
  freshness: 'undated',
  temporalStatus: null,
  angles: [],
  actionGate: { allowed: true },
  tags: [],
  perimeter: 'ACME',
  ...over,
})

function renderTimeline(signals: WatchSignal[]) {
  return render(
    <WatchSignalTimeline
      signals={signals}
      activeCategory="all"
      narrowed={false}
      isPersisting={false}
      scenario="full"
      onAddToPlan={noop}
      onCreateAngle={noop}
    />,
  )
}

/**
 * #2127.8 — LA MÉMOIRE MARCHÉ ÉCLAIRE UN SIGNAL ACTUEL, ELLE NE LE REMPLACE PAS.
 *
 * Un signal de recrutement dit ce qui se passe AUJOURD'HUI ; les familles
 * d'expertise observées disent dans quel environnement ça tombe. La ligne vit
 * SOUS le signal, sur les seuls signaux d'emploi, et dit en toutes lettres
 * qu'elle éclaire sans prouver. Aucune famille nommée → rien d'écrit.
 */
describe('WatchSignalTimeline — contexte observé sous un signal actuel (#2127.8)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const CONTEXT = 'Contexte observé sur ce compte : Data / IA · Chef de projet — éclaire le signal, ne le prouve pas'

  function renderWithContext(signals: WatchSignal[], observedRoleFamilies?: string[]) {
    return render(
      <WatchSignalTimeline
        signals={signals}
        activeCategory="all"
        narrowed={false}
        isPersisting={false}
        scenario="full"
        onAddToPlan={noop}
        onCreateAngle={noop}
        observedRoleFamilies={observedRoleFamilies}
      />,
    )
  }

  it('un signal d’emploi porte les familles d’expertise observées, avec sa prudence', () => {
    renderWithContext(
      [signal({ category: 'recrutement', signal: 'Recrute 4 data engineers' })],
      ['Data / IA', 'Chef de projet'],
    )
    expect(screen.getByText(CONTEXT)).toBeInTheDocument()
  })

  it('un signal hors emploi ne porte rien — la famille de rôles n’éclaire pas une levée de fonds', () => {
    renderWithContext([signal({ category: 'historique' })], ['Data / IA', 'Chef de projet'])
    expect(screen.queryByText(/Contexte observé/)).not.toBeInTheDocument()
  })

  it('aucune famille nommée (ou mémoire muette) : rien d’écrit, jamais « aucune »', () => {
    renderWithContext([signal({ category: 'recrutement' })], [])
    renderWithContext([signal({ id: 's2', category: 'recrutement' })])
    expect(screen.queryByText(/Contexte observé/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/aucune famille/i)
  })
})

/**
 * #2618.1 — « lire le tableau des signaux sans qu'il casse ». Le titre d'un
 * signal (`signal.signal`) est un texte LIBRE produit par l'analyse — sans
 * `break-words`, un jeton sans espace (une URL, un identifiant, un nom composé
 * collé) déborde de sa colonne (`grid-cols-[minmax(0,1fr)_auto]`) au lieu d'y
 * passer à la ligne : le même défaut que #1804 (MissionsTable.tsx) et #2619.1
 * (QualificationLeadsQueue.tsx), sur un troisième écran.
 */
describe('WatchSignalTimeline — un titre sans espace ne déborde pas de sa colonne (#2618.1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le titre du signal porte `break-words`, pour passer à la ligne plutôt que déborder', () => {
    renderTimeline([
      signal({
        signal: 'https://www.exemple-tres-long-sans-aucun-espace-pour-casser-la-colonne.example.com/dossier',
      }),
    ])
    const titre = screen.getByRole('heading', { level: 3 })
    expect(titre.className).toContain('break-words')
  })
})

describe('WatchSignalTimeline freshness', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('badges an archive signal so a stale event is not read as a live trigger', () => {
    renderTimeline([signal({ freshness: 'archive' })])
    expect(screen.getByText('Archivé')).toBeInTheDocument()
  })

  it('#3676.6 — un signal courant se dit « Signal récent », un non daté ne se dit rien, une archive garde son badge', () => {
    renderTimeline([
      signal({ id: 'r', freshness: 'current', temporalStatus: 'RECENT', date: '2026-06-01' }),
      signal({ id: 'u', freshness: 'undated', temporalStatus: 'UNDATED', date: '' }),
      signal({ id: 'a', freshness: 'archive', temporalStatus: 'STALE' }),
    ])
    const natures = screen.getAllByTestId('line-nature')
    expect(natures).toHaveLength(1)
    expect(natures[0]).toHaveTextContent('Signal récent')
  })

  it('does not badge a current signal as archived', () => {
    renderTimeline([signal({ id: 's2', freshness: 'current', date: '2026-06-01' })])
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument()
  })

  it('does not badge an undated signal as archived (never invents freshness)', () => {
    renderTimeline([signal({ id: 's3', freshness: 'undated', date: '' })])
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument()
  })

  // #3206.3 (épopée #3240) — HISTORICAL (une nomination périmée reste un état
  // passé utile) se distingue de STALE (une offre d'emploi périmée) : le même
  // seuil d'âge ne mérite pas le même libellé.
  it('badges a HISTORICAL archive distinctly from a plain STALE archive', () => {
    renderTimeline([signal({ id: 's4', freshness: 'archive', temporalStatus: 'HISTORICAL' })])
    expect(screen.getByText('Historique')).toBeInTheDocument()
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument()
  })

  it('keeps the plain archive label when temporalStatus is STALE or unavailable', () => {
    renderTimeline([signal({ id: 's5', freshness: 'archive', temporalStatus: 'STALE' })])
    expect(screen.getByText('Archivé')).toBeInTheDocument()
  })
})

/**
 * Trouvé en recette live le 27/08 : l'entête de la veille écrivait
 * « 6 signals détectés » — le pluriel ANGLAIS au milieu d'une interface
 * française. La parité FR/EN ne pouvait pas l'attraper : les deux langues
 * avaient bien leur clé, seul le mot français était faux.
 */
describe('WatchSignalTimeline — le compte des signaux est en français', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('accorde « signaux » au pluriel, jamais « signals »', () => {
    renderTimeline([signal({ id: 'a' }), signal({ id: 'b' })])
    expect(screen.getByText('2 signaux détectés')).toBeInTheDocument()
  })

  it('garde le singulier quand il n’y en a qu’un', () => {
    renderTimeline([signal({ id: 'a' })])
    expect(screen.getByText('1 signal détecté')).toBeInTheDocument()
  })
})

/**
 * #2119.3 — LA SOURCE DEVIENT UN LIEN QUAND ELLE EN EST UN, ET JAMAIS SINON.
 *
 * Le retour demande « une source cliquable ». Le contrat n'a aucun champ d'URL :
 * `recentSignalSchema` porte un NOM lisible (« Les Échos ») et un jeton de
 * scrape. Fabriquer un lien depuis un nom de média serait une donnée inventée —
 * cliquable, donc crue. Ces deux tests tiennent les deux moitiés, et le second
 * est celui qui sait dire NON.
 */
describe('WatchSignalTimeline — la source cliquable (#2119.3)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('lie la source quand elle EST une URL, et l’ouvre sans poignée sur notre page', () => {
    renderTimeline([signal({ id: 's-url', source: 'https://www.legifrance.gouv.fr/jorf/id/ABC' })])
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://www.legifrance.gouv.fr/jorf/id/ABC')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('ne fabrique AUCUN lien depuis un nom de média — ni depuis un `javascript:`', () => {
    renderTimeline([signal({ id: 's-nom', source: 'Les Échos' })])
    expect(screen.queryByRole('link')).toBeNull()

    renderTimeline([signal({ id: 's-js', source: 'javascript:alert(1)' })])
    expect(screen.queryByRole('link')).toBeNull()
  })
})

/**
 * #2687 — « et donc ? ». Un signal daté et sourcé ne dit pas ce qu'il faut en
 * FAIRE ; l'analyse le disait déjà, sans que rien ne relie sa réponse au signal.
 * Maintenant que le lien existe, l'écran le montre — et se tait quand il n'y en
 * a pas, parce qu'on n'affiche pas ce qu'on n'a pas.
 */
describe('WatchSignalTimeline — ce que le signal mène à faire (#2687)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const ANGLE = {
    hypothesis: 'industrialise ses modèles ML',
    esnAngle: 'renfort MLOps sur la chaîne de déploiement',
    firstAction: 'cadrer le besoin avec le CDO',
  }

  it('affiche l’angle ESN, la première action, et l’hypothèse d’où ils viennent', () => {
    renderTimeline([signal({ id: 's-angle', angles: [ANGLE] })])
    expect(screen.getByText(ANGLE.esnAngle)).toBeInTheDocument()
    expect(screen.getByText(ANGLE.firstAction)).toBeInTheDocument()
    // L'hypothèse est nommée : un angle qu'on ne peut pas rattacher à un
    // raisonnement est une affirmation qu'on ne peut pas contester.
    expect(screen.getByText(new RegExp(ANGLE.hypothesis))).toBeInTheDocument()
  })

  it('affiche les DEUX angles quand deux hypothèses reposent sur le même signal', () => {
    renderTimeline([
      signal({
        id: 's-deux',
        angles: [ANGLE, { hypothesis: 'refond sa plateforme de données', esnAngle: 'renfort data engineering' }],
      }),
    ])
    expect(screen.getByText(ANGLE.esnAngle)).toBeInTheDocument()
    expect(screen.getByText('renfort data engineering')).toBeInTheDocument()
  })

  it('n’écrit RIEN — pas même « Aucun angle » — quand l’analyse n’en a rattaché aucun', () => {
    renderTimeline([signal({ id: 's-vide', angles: [] })])
    expect(screen.queryByText(/angle ESN/i)).toBeNull()
    expect(screen.queryByText(/première action/i)).toBeNull()
    expect(screen.queryByText(/aucun angle/i)).toBeNull()
  })

  it('n’écrit que ce qu’il a : une action sans angle ne fait pas de ligne « angle »', () => {
    renderTimeline([
      signal({ id: 's-action', angles: [{ hypothesis: 'gèle ses budgets', firstAction: 'vérifier le calendrier' }] }),
    ])
    expect(screen.getByText('vérifier le calendrier')).toBeInTheDocument()
    expect(screen.queryByText(/angle ESN/i)).toBeNull()
  })
})

/**
 * #2966 (#2119.22-25) — LE CONTRAT DE SIGNAL À QUATRE RÉPONSES.
 *
 * Où / pourquoi pour cette ESN / qui pourrait être concerné / action crédible
 * ou absence explicite — TOUJOURS répondues, « non mesuré » étant une réponse
 * aussi valide qu'un fait (doctrine, un axe non évaluable reste NOMMÉ).
 */
describe('WatchSignalTimeline — le contrat de signal à quatre réponses (#2966, #2119.22-25)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('répond « où » avec le périmètre déjà calculé par `watchData.ts`', () => {
    renderTimeline([signal({ perimeter: 'EDF Renouvelables' })])
    expect(screen.getByText('EDF Renouvelables')).toBeInTheDocument()
  })

  it('répond « pourquoi » quand l’analyse l’a dit, « non mesuré » sinon — jamais muet', () => {
    renderTimeline([signal({ id: 's-why', sales_implication: 'Ouvre un besoin de TMA.' })])
    expect(screen.getByText('Ouvre un besoin de TMA.')).toBeInTheDocument()

    renderTimeline([signal({ id: 's-why-2', sales_implication: undefined })])
    expect(screen.getAllByText('Non mesuré').length).toBeGreaterThan(0)
  })

  it('#3628 — « qui pourrait être concerné » sans valeur ne fait AUCUNE ligne (jamais « Non mesuré » ×N)', () => {
    renderTimeline([signal({ id: 's-who' })])
    expect(screen.queryByText(/Qui pourrait être concerné/i)).not.toBeInTheDocument()
  })

  it('dit « aucune action pour l’instant » quand l’analyse n’a rien recommandé', () => {
    renderTimeline([signal({ id: 's-no-action', sales_implication: undefined, angles: [] })])
    expect(screen.getByText('Aucune action pour l’instant')).toBeInTheDocument()
    // Les deux gestes restent disponibles : ce n'est pas une impasse.
    expect(screen.getByRole('button', { name: /créer un angle/i })).toBeInTheDocument()
  })

  it('ne dit PAS « aucune action » quand l’analyse a recommandé quelque chose', () => {
    renderTimeline([signal({ id: 's-has-action', sales_implication: 'Budget IT en hausse.' })])
    expect(screen.queryByText('Aucune action pour l’instant')).not.toBeInTheDocument()
  })

  // #2952 (#2305.43/.44/.45/.47/.48) — une recommandation qui ne passe pas le
  // gate d'action affiche le fallback explicite, pas un silence.
  it('dit « contexte à conserver » quand l’analyse recommande mais que le gate refuse', () => {
    renderTimeline([
      signal({
        id: 's-gated',
        sales_implication: 'Budget IT en hausse.',
        actionGate: { allowed: false, fallback: 'context_only' },
      }),
    ])
    expect(screen.getByText('Contexte à conserver, aucune action justifiée.')).toBeInTheDocument()
  })

  it('garde les deux gestes manuels disponibles même quand le gate refuse (#2119.25 — l’initiative reste au commercial)', () => {
    renderTimeline([
      signal({
        id: 's-gated-2',
        sales_implication: 'Budget IT en hausse.',
        actionGate: { allowed: false, fallback: 'context_only' },
      }),
    ])
    expect(screen.getByRole('button', { name: /créer un angle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ajouter au plan/i })).toBeInTheDocument()
  })
})

/**
 * #3995 revient sur #3676.6, délibérément (décision Louis 10/10 soir).
 *
 * Avant : un signal déjà présenté en piste était RETIRÉ de la liste, qui disait
 * « N signaux sont déjà présentés en pistes ci-dessus » — une carte presque toujours
 * vide qui renvoyait au-dessus (réfuté en prod sur Veolia, filtre Recrutements).
 * Maintenant : la liste montre TOUS les signaux du filtre ; un signal en piste porte
 * au plus une mention légère « En piste » sur sa ligne. Plus jamais de renvoi « ci-dessus ».
 *
 * Ce qui tient encore de #3676 : compteurs, sources et hypothèses lisent tous les
 * événements, et « Ce que cela implique commercialement » reste dédoublonné
 * (voir TabSignal : `buildInsights` ne lit que les signaux non portés par une piste).
 */
describe('WatchSignalTimeline — un signal en piste reste dans la liste (#3995)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  function renderList(signals: WatchSignal[], inLeadSignalIds?: ReadonlySet<string>, narrowed = false) {
    return render(
      <WatchSignalTimeline
        signals={signals}
        activeCategory="all"
        narrowed={narrowed}
        isPersisting={false}
        scenario="full"
        onAddToPlan={noop}
        onCreateAngle={noop}
        inLeadSignalIds={inLeadSignalIds}
      />,
    )
  }

  it('un signal en piste est LISTÉ, avec une mention légère « En piste »', () => {
    renderList([signal({ id: 'a' }), signal({ id: 'b', signal: 'Autre signal' })], new Set(['a']))
    expect(screen.getByText('Refonte du SI décisionnel')).toBeInTheDocument()
    expect(screen.getByText('Autre signal')).toBeInTheDocument()
    expect(screen.getAllByText('En piste')).toHaveLength(1)
    expect(screen.getByText('2 signaux détectés')).toBeInTheDocument()
  })

  it('sait dire NON : aucun signal en piste, aucune mention', () => {
    renderList([signal({ id: 'a' })], new Set())
    expect(screen.queryByText('En piste')).not.toBeInTheDocument()
  })

  it('jamais de renvoi « déjà présentés en pistes ci-dessus »', () => {
    renderList([signal({ id: 'a' })], new Set(['a']))
    expect(screen.queryByText(/déjà présentés? en pistes?/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ci-dessus/)).not.toBeInTheDocument()
  })

  it('vide réel : « Aucun signal détecté » ; vide filtré : le message de catégorie', () => {
    const { unmount } = renderList([])
    expect(screen.getByText('Aucun signal détecté')).toBeInTheDocument()
    unmount()
    renderList([], undefined, true)
    expect(screen.getByText('Aucun signal dans cette catégorie')).toBeInTheDocument()
  })
})

// #3922.3 — recette AE 09/10 : « 0 lien externe » sur la veille de SG, Sanofi, TF1.
describe('WatchSignalTimeline — chaque signal porte son lien, ou le dit (#3922.3)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rend la source cliquable (site d’origine + ↗) vers l’URL de l’annonce', () => {
    renderTimeline([
      signal({
        id: 'b',
        type: 'juridique',
        signal: 'Procédure de sauvegarde ouverte',
        source: 'BODACC',
        sourceUrl: 'https://www.bodacc.fr/pages/annonce?id=A1',
        sourceKind: 'bodacc',
      }),
    ])
    expect(screen.getByRole('link', { name: 'Ouvrir la source : bodacc.fr' })).toHaveAttribute(
      'href',
      'https://www.bodacc.fr/pages/annonce?id=A1',
    )
  })

  it('sait dire NON : sans URL, aucune ligne « Sans lien vérifiable » et aucun lien deviné', () => {
    renderTimeline([signal({ id: 'p', source: 'Communiqué de presse' })])
    expect(screen.queryByText('Sans lien vérifiable')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('collecte antérieure au lien : le rattrapage est NOMMÉ sous le signal', () => {
    render(
      <WatchSignalTimeline
        signals={[signal({ id: 'p' })]}
        activeCategory="all"
        narrowed={false}
        isPersisting={false}
        scenario="full"
        onAddToPlan={noop}
        onCreateAngle={noop}
        collectedBeforeLink
      />,
    )
    expect(screen.getByText(/collecte antérieure au lien source/i)).toBeInTheDocument()
  })
})

// #4307.3 — l'historique ENTIER d'un compte analysé se lit sans crédit : aucun plafond, aucun déblocage.
describe('WatchSignalTimeline — l’historique entier, sans crédit (#4307.3)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rend les 12 signaux, sans geste de déblocage ni mention de crédit', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      signal({ id: `s${i}`, signal: `Fait historique numéro ${i}`, date: `2024-0${(i % 9) + 1}-01` }),
    )
    renderTimeline(many)
    for (let i = 0; i < 12; i++) expect(screen.getByText(`Fait historique numéro ${i}`)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /débloquer/i })).not.toBeInTheDocument()
  })
})
