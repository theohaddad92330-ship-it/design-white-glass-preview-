import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { computeCommercialMaturity } from '../lib/maturity-axes'
import { AuditMaturityAxes } from './AuditMaturityAxes'

/**
 * #2065.1-.18 — LE SCORE DE MATURITÉ TROUVE SON APPELANT.
 *
 * Le cas que ce fichier garde le plus fort : le corps du lot #2065 lisait déjà
 * `computeCommercialMaturity`, mais AUCUN écran ne le rendait — du code juste,
 * calculé, testé, que personne n'appelait. `computeCommercialMaturity(null)`
 * est le cas extrême mesuré (0 axe évaluable sur 12, `score: null`, `reason`
 * non nulle, douze axes `state: 'unknown'`) : il doit rendre les douze axes
 * NOMMÉS, jamais une moyenne, jamais un zéro.
 */
describe('AuditMaturityAxes — #2065', () => {
  it('sans profil (0 axe évaluable sur 13) : nomme les 13 axes, aucun score, aucun zéro', () => {
    const maturity = computeCommercialMaturity(null)
    expect(maturity.score).toBeNull()
    expect(maturity.axes).toHaveLength(13)

    render(<AuditMaturityAxes maturity={maturity} />)

    // La doctrine : « non mesuré » n'est jamais « 0 ». Zéro ne s'affiche nulle
    // part comme la note de maturité.
    expect(screen.queryByText('0/3')).not.toBeInTheDocument()
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()

    // Les treize axes restent NOMMÉS, y compris ceux qu'aucune source ne
    // mesure aujourd'hui.
    expect(screen.getByText("Clarté de l'offre")).toBeInTheDocument()
    expect(screen.getByText('Preuves')).toBeInTheDocument()
    expect(screen.getByText('Ciblage')).toBeInTheDocument()
    expect(screen.getByText('Accès')).toBeInTheDocument()
    expect(screen.getByText('Capacité commerciale')).toBeInTheDocument()
    expect(screen.getByText('Discipline du suivi')).toBeInTheDocument()
    expect(screen.getByText('Qualification client')).toBeInTheDocument()
    expect(screen.getByText('Sécurisation candidat')).toBeInTheDocument()
    expect(screen.getByText('Data et outils')).toBeInTheDocument()
    expect(screen.getByText('Mesure')).toBeInTheDocument()
    expect(screen.getByText('Capitalisation')).toBeInTheDocument()
    expect(screen.getByText('Alignement équipe')).toBeInTheDocument()
    expect(screen.getByText('Réseau')).toBeInTheDocument()

    // La raison du score absent est dite, jamais tue.
    expect(screen.getByText(/moins de 3 axes évalués — sous ce seuil, un score global mesurerait/)).toBeInTheDocument()

    // Chaque axe inconnu porte son état nommé, pas un silence.
    expect(screen.getAllByText('Inconnu').length).toBe(13)
  })

  it('#2860 (#2045.12-.14) — réseau déclaré à l’onboarding : existant, exploitable, portes à requalifier', () => {
    const measured = computeCommercialMaturity(null, {
      former_clients_count_band: '6-15',
      former_colleagues_count_band: '0',
      partners_count_band: null,
      referrers_count_band: undefined,
      warm_relations_count_band: '1-5',
    })
    const network = measured.axes.find(axis => axis.id === 'network')
    expect(network?.state).toBe('measured')
    expect(network?.evidence).toContain('1 porte(s) de réseau personnel déclarée(s) non vide(s)')
    expect(network?.evidence).toContain('Relations chaudes déclarées : 1-5')
    expect(network?.gaps?.some(gap => gap.includes('à requalifier'))).toBe(true)

    const unknown = computeCommercialMaturity(null, null).axes.find(axis => axis.id === 'network')
    expect(unknown?.state).toBe('unknown')
    expect(unknown?.score).toBeNull()
  })

  it('au clic sur un axe inconnu, révèle le fait précis qui manque pour le mesurer', async () => {
    const user = userEvent.setup()
    const maturity = computeCommercialMaturity(null)
    render(<AuditMaturityAxes maturity={maturity} />)

    const button = screen.getByRole('button', { name: /Clarté de l'offre/ })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')

    await user.click(button)
    expect(screen.getByText('Aucun style de messagerie configuré')).toBeInTheDocument()
  })

  it('avec un profil complet, rend un score global et le niveau de chaque axe mesuré', () => {
    const maturity = computeCommercialMaturity({
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: {
        size: 'eti',
        sectorsPriority: ['Banque', 'Assurance'],
        decisionLevel: 'director',
        entryStrategy: 'multiThread',
      },
      analysisParameters: {
        braveQueriesCount: 12,
        firecrawlPagesCount: 6,
        contactsTarget: 40,
        analysisDepth: 'deep',
        maxTokensResearch: 12000,
        focusAreas: ['Cloud', 'Data'],
      },
      messagingStyle: {
        tone: 'directExpert',
        messageLength: 'concise',
        valuePropositionAngle: 'Expertise cloud rare',
        differentiationPoints: ['Référence vérifiable', 'Consultants en CDI'],
        avoid: [],
      },
      coachingInsights: {
        mainWeakness: 'x',
        keyAdvice: 'y',
        cadenceRecommendation: { analysesPerWeek: 4, messagesPerDay: 6, followUpsPerWeek: 10 },
        kpiTargets: { accountsPerMonth: 10, rdvPerMonth: 5, conversionRateTarget: '10%' },
      },
    })
    expect(maturity.score).not.toBeNull()

    render(<AuditMaturityAxes maturity={maturity} />)
    expect(screen.getByText(new RegExp(`${maturity.score}/${maturity.max}`))).toBeInTheDocument()
    // Au moins un axe mesuré porte un niveau nommé, jamais un nombre nu.
    expect(screen.getAllByText(/Émergent|Structuré|Mature|Pas commencé/).length).toBeGreaterThan(0)
  })
})

/**
 * #2072.1 / #2072.2 / #2072.5 — ACTIFS, CONTRAINTES, CONFIANCE.
 *
 * Ce que ce fichier garde, et pourquoi il a fallu le garder : `AxisDetail`
 * rendait `evidence` et `gaps` en DEUX listes strictement identiques — même
 * taille, même couleur, aucun intitulé. Un lecteur ne pouvait pas distinguer
 * ce qui est EN PLACE de ce qui MANQUE : la matière des blocs « Actifs » et
 * « Contraintes » était à l'écran, illisible comme telle.
 *
 * Aucun bloc SÉPARÉ n'est ajouté (loi 4 du tome 7 : rien deux fois sous la
 * même forme) — ce sont les listes DÉJÀ rendues qui portent enfin leur nom.
 * La confiance, elle, est le champ RÉEL `axis.confidence` du moteur, rendu par
 * le composant qui sait déjà le dire en paliers nommés : jamais un
 * pourcentage, et `null` se dit « Non mesurée », pas le palier le plus faible.
 */
describe('AuditMaturityAxes — #2072.1 / .2 / .5', () => {
  const FULL_PROFILE: Parameters<typeof computeCommercialMaturity>[0] = {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'expertiseRare',
    idealAccountProfile: {
      size: 'eti',
      sectorsPriority: ['Banque'],
      decisionLevel: 'director',
      entryStrategy: 'multiThread',
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'concise',
      valuePropositionAngle: 'Expertise cloud rare',
      differentiationPoints: ['Référence vérifiable'],
      avoid: [],
    },
  }

  it('#2072.1 / .2 — nomme les ACTIFS et les CONTRAINTES au lieu de deux listes jumelles', async () => {
    const user = userEvent.setup()
    const maturity = computeCommercialMaturity(FULL_PROFILE)
    const axis = maturity.axes.find(a => a.id === 'offerClarity')
    // Le corpus n'est pas vide : sans preuve lue, ce test ne prouverait rien.
    expect(axis?.evidence?.length ?? 0).toBeGreaterThan(0)

    render(<AuditMaturityAxes maturity={maturity} />)
    await user.click(screen.getByRole('button', { name: /Clarté de l'offre/ }))

    expect(screen.getByText('Actifs')).toBeInTheDocument()
    if ((axis?.gaps?.length ?? 0) > 0) expect(screen.getByText('Contraintes')).toBeInTheDocument()
  })

  it('#2072.5 — un axe ouvert porte sa CONFIANCE, à paliers nommés, jamais un pourcentage', async () => {
    const user = userEvent.setup()
    const maturity = computeCommercialMaturity(FULL_PROFILE)
    render(<AuditMaturityAxes maturity={maturity} />)
    await user.click(screen.getByRole('button', { name: /Clarté de l'offre/ }))

    const badge = screen.getByLabelText(/^Confiance : /)
    expect(badge.textContent).toMatch(/^(Recoupé|Source unique|Déduit|Non mesurée)$/)
    expect(badge.textContent).not.toMatch(/%/)
  })

  it('#2072.5 — un axe que rien ne mesure dit « Non mesurée », jamais le palier le plus faible', async () => {
    const user = userEvent.setup()
    const maturity = computeCommercialMaturity(null)
    expect(maturity.axes.find(a => a.id === 'offerClarity')?.confidence).toBeNull()

    render(<AuditMaturityAxes maturity={maturity} />)
    await user.click(screen.getByRole('button', { name: /Clarté de l'offre/ }))

    expect(screen.getByLabelText('Confiance : Non mesurée')).toBeInTheDocument()
  })
})

/**
 * #2090.10 — LE GRAPHIQUE, PAS SEULEMENT DES CARTES DE TEXTE.
 *
 * Tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §6) : barres par
 * NIVEAU nommé (0-3), un axe = une barre, les axes non évaluables restent
 * listés À PART des barres — jamais une barre à zéro, qui se lirait comme un
 * fait mesuré. Et jamais une magnitude seule : chaque barre porte le nom du
 * palier, pas un nombre nu à côté.
 */
describe('AuditMaturityAxes — #2090.10 (graphique de maturité)', () => {
  const FULL_PROFILE: Parameters<typeof computeCommercialMaturity>[0] = {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'expertiseRare',
    idealAccountProfile: {
      size: 'eti',
      sectorsPriority: ['Banque', 'Assurance'],
      decisionLevel: 'director',
      entryStrategy: 'multiThread',
    },
    analysisParameters: {
      braveQueriesCount: 12,
      firecrawlPagesCount: 6,
      contactsTarget: 40,
      analysisDepth: 'deep',
      maxTokensResearch: 12000,
      focusAreas: ['Cloud', 'Data'],
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'concise',
      valuePropositionAngle: 'Expertise cloud rare',
      differentiationPoints: ['Référence vérifiable', 'Consultants en CDI'],
      avoid: [],
    },
    coachingInsights: {
      mainWeakness: 'x',
      keyAdvice: 'y',
      cadenceRecommendation: { analysesPerWeek: 4, messagesPerDay: 6, followUpsPerWeek: 10 },
      kpiTargets: { accountsPerMonth: 10, rdvPerMonth: 5, conversionRateTarget: '10%' },
    },
  }

  it('une barre par axe MESURÉ, nommée par son NIVEAU, jamais une magnitude nue', () => {
    const maturity = computeCommercialMaturity(FULL_PROFILE)
    const measured = maturity.axes.filter(axis => axis.score !== null)
    const notEvaluable = maturity.axes.filter(axis => axis.score === null)
    // Le corpus n'est pas dégénéré : les deux groupes sont non vides.
    expect(measured.length).toBeGreaterThan(0)
    expect(notEvaluable.length).toBeGreaterThan(0)

    render(<AuditMaturityAxes maturity={maturity} />)

    const chart = screen.getByTestId('maturity-bars-chart')
    const bars = within(chart).getAllByRole('img')
    expect(bars).toHaveLength(measured.length)

    bars.forEach(bar => {
      const label = bar.getAttribute('aria-label') ?? ''
      expect(label).toMatch(/Pas commencé|Émergent|Structuré|Mature/)
      // Jamais une magnitude seule : pas de fraction du type "2/3" sur la barre.
      expect(label).not.toMatch(/\d\s*\/\s*\d/)
    })

    // Les non-évaluables sont NOMMÉS, à part des barres — jamais une barre à zéro.
    notEvaluable.forEach(axis => {
      expect(within(chart).getByText(new RegExp(axis.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    })
  })

  it('sans aucun axe mesuré, aucun graphique ne se rend — rien à barrer', () => {
    const maturity = computeCommercialMaturity(null)
    render(<AuditMaturityAxes maturity={maturity} />)
    expect(screen.queryByTestId('maturity-bars-chart')).not.toBeInTheDocument()
  })
})
