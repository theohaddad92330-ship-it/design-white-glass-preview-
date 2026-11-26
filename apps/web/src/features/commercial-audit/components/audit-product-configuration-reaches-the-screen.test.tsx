import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProfileContext } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { buildCommercialAuditContext } from '../lib/build-audit'
import { AuditPlanAndMilestones } from './AuditPlanAndMilestones'

/**
 * #2068.24 / #2068.26 / #2068.27 — LE TEST QUI AURAIT ATTRAPÉ LE DÉFAUT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL PART D'UN PROFIL, ET JAMAIS D'UN `productConfiguration` POSÉ
 * À LA MAIN
 * ─────────────────────────────────────────────────────────────────────────
 * `AuditPlanAndMilestones.test.tsx` passe DÉJÀ un `AuditProductAreaConfiguration[]`
 * écrit dans le fichier de test, et il est VERT depuis le 19/09/2026 — alors
 * que `buildCommercialAuditContext` écrivait `productConfiguration: null` en
 * dur : aucun espace réel n'a jamais vu cette section remplie. Un test qui
 * pose la valeur qu'il vérifie ne prouve rien du chemin qui la produit.
 *
 * Celui-ci part donc d'un `ProfileContext` — la SEULE entrée qu'un espace
 * réel apporte — le fait traverser la dérivation de production
 * (`buildCommercialAuditContext`), et lit l'ÉCRAN. Il est ROUGE tant que trois
 * aires promises (« Scoring », « Carte d'influence », « Messages ») ne sortent
 * d'aucune donnée : `ACTION_TARGET_DOMAIN` ne mène à aucune des trois, et leur
 * seul autre porteur était ce `null`.
 */

const COMPLETE: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque', 'Industrie'],
    decisionLevel: 'director',
    entryStrategy: 'bottomUp',
  },
  analysisParameters: {
    braveQueriesCount: 12,
    firecrawlPagesCount: 6,
    contactsTarget: 40,
    analysisDepth: 'standard',
    maxTokensResearch: 12000,
    focusAreas: ['Cloud & infrastructure', 'Cybersécurité'],
  },
  messagingStyle: {
    tone: 'directExpert',
    messageLength: 'concise',
    valuePropositionAngle: 'Trois domaines de référence, une preuve vérifiable sur chacun.',
    differentiationPoints: ['Une référence CV réelle par domaine'],
    avoid: ['Ne pas citer de tarif avant le premier échange'],
  },
  welcomeSummary: {
    profileRecap: 'Boutique experte sur trois domaines.',
    searchesPersonalization: 'Je cherche des ETI sur tes deux secteurs.',
    contactsPersonalization: 'Je remonte jusqu’aux directeurs, pas seulement aux opérationnels.',
    messagesPersonalization: 'J’écris court et direct, avec une preuve par domaine.',
    scoringPersonalization: 'Je fais remonter les comptes de tes deux secteurs prioritaires.',
    firstAnalysisSuggestions: [],
  },
}

describe('#2068.24/.26/.27 — les trois aires produit arrivent à l’écran depuis un profil MESURÉ', () => {
  it('rend « Scoring », « Carte d’influence » et « Messages » quand le profil les renseigne', async () => {
    const context = buildCommercialAuditContext(COMPLETE, [])
    renderWithRouter(
      <AuditPlanAndMilestones
        thirtyDayPlan={context.thirtyDayPlan}
        milestones={context.milestones}
        productConfiguration={context.productConfiguration}
      />,
    )

    // #2068.24 — un espace dont le barème de priorité est réglé le voit ici.
    expect(await screen.findByText('Scoring')).toBeInTheDocument()
    // #2068.26 — l'étage que la carte d'influence doit atteindre.
    expect(screen.getByText("Carte d'influence")).toBeInTheDocument()
    // #2068.27 — l'angle avec lequel un message se prépare.
    expect(screen.getByText('Messages')).toBeInTheDocument()

    // Les valeurs sont celles du PROFIL, jamais un libellé de remplissage, et
    // chacune remonte à l'énoncé VALIDÉ dont elle sort (#2068.33).
    expect(screen.getByText(/Banque · Industrie/)).toBeInTheDocument()
    expect(
      screen.getAllByText(/Je fais remonter les comptes de tes deux secteurs prioritaires\./).length,
    ).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON — un profil sans aucun de ces blocs ne rend AUCUNE des trois aires', async () => {
    const bare: ProfileContext = { esnArchetype: 'soloHunter', sellingPosture: 'volumeFlexible' }
    const context = buildCommercialAuditContext(bare, [])
    expect(context.productConfiguration).toBeNull()
    renderWithRouter(
      <AuditPlanAndMilestones
        thirtyDayPlan={context.thirtyDayPlan}
        milestones={context.milestones}
        productConfiguration={context.productConfiguration}
      />,
    )

    // Aucune ligne inventée : aucun bloc source lu, l'écran NOMME « non
    // mesuré » — jamais une aire vide pour remplir la section.
    expect(await screen.findByText(/aucune configuration effective/)).toBeInTheDocument()
    expect(screen.queryByText('Scoring')).not.toBeInTheDocument()
    expect(screen.queryByText("Carte d'influence")).not.toBeInTheDocument()
    expect(screen.queryByText('Messages')).not.toBeInTheDocument()
  })

  it('un réglage renseigné SANS énoncé validé ne fait aucune ligne — jamais dégradé en « non réglé » (#2068.33)', async () => {
    const { welcomeSummary: _dropped, ...withoutStatements } = COMPLETE
    const context = buildCommercialAuditContext(withoutStatements, [])
    // Les blocs source ont été LUS et ne nomment aucune aire : `[]`, pas
    // `null` — « mesuré, vide » n'est pas « non mesuré ».
    expect(context.productConfiguration).toEqual([])
    renderWithRouter(
      <AuditPlanAndMilestones
        thirtyDayPlan={context.thirtyDayPlan}
        milestones={context.milestones}
        productConfiguration={context.productConfiguration}
      />,
    )

    expect(await screen.findByText(/Aucune aire produit/)).toBeInTheDocument()
    expect(screen.queryByText('Scoring')).not.toBeInTheDocument()
    // Et surtout : le réglage RENSEIGNÉ n'est pas affiché « non réglé ».
    expect(screen.queryByText(/non réglé/)).not.toBeInTheDocument()
  })

  it('un réglage NON renseigné se nomme, il ne vaut jamais « 0 » (GA-18/GA-19)', async () => {
    const context = buildCommercialAuditContext(
      {
        ...COMPLETE,
        // Le barème n'a aucun thème prioritaire : il classe à plat sur ce
        // point — c'est un fait MESURÉ, pas une absence de mesure.
        analysisParameters: { ...COMPLETE.analysisParameters!, focusAreas: [] },
      },
      [],
    )
    renderWithRouter(
      <AuditPlanAndMilestones
        thirtyDayPlan={context.thirtyDayPlan}
        milestones={context.milestones}
        productConfiguration={context.productConfiguration}
      />,
    )

    expect(await screen.findByText('Scoring')).toBeInTheDocument()
    const scoring = screen.getByText(/Thèmes prioritaires/)
    expect(scoring.textContent).not.toMatch(/\b0\b/)
    // « non réglé » et « non mesuré » ne sont PAS le même fait : le bloc a été
    // lu, il ne nomme rien (GA-18 / GA-19, garde
    // `a-measured-zero-is-not-an-unknown.test.ts`).
    expect(scoring.textContent).toMatch(/non réglé/)
    expect(scoring.textContent).not.toMatch(/non mesuré/)
  })
})
