import { classifyLeadEvidence, LEAD_DISMISS_REASONS, type LeadEvidenceLevel } from '@bellum/contracts'
import { DEMO_QUALIFICATION_LEADS_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_SG_COMPLETE_LEAD } from './demo-dataset'

/**
 * #2172 — LA PARITÉ DÉMO DE LA FILE « PISTES À QUALIFIER ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RECOMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La file se DÉRIVE des lignes d'intake du dossier : rien ne garantit qu'un
 * semis les produise, ni qu'il en produise de niveaux DIFFÉRENTS. Une salle qui
 * n'aurait que des signaux isolés montrerait une file qui a l'air d'avoir un
 * seul état, et les cinq niveaux — le cœur de l'écran — resteraient invisibles
 * en réunion.
 *
 * Elle recalcule donc les niveaux SUR LE JEU, avec la fonction du contrat et la
 * même règle de convergence que l'écran (des faits qui pointent vers le même
 * domaine d'offre). Elle sait dire non : retirer le domaine partagé des deux
 * signaux convergents, ou le semis d'écartement, la fait rougir.
 */

const signals = DEMO_DELIVERY_CLIENT.detectedSignals
const imported = DEMO_DELIVERY_CLIENT.importedProjects
/** Les lignes d'INTAKE de la salle — les seules qui entrent dans la file. */
const intake = [
  ...signals.map(signal => ({ kind: 'signal', stage: 'detected', domain: signal.primary_domain_code ?? null })),
  ...imported
    .filter(project => project.stage === 'detected' || project.stage === 'potential')
    .map(project => ({ kind: 'imported', stage: project.stage, domain: null })),
]

/** La même convergence que l'écran : un fait par ligne, plus celles qui
 *  pointent vers le MÊME domaine d'offre. */
function factCount(entry: (typeof intake)[number]): number {
  if (!entry.domain) return 1
  return intake.filter(other => other.domain === entry.domain).length
}

function levelsOfTheRoom(): LeadEvidenceLevel[] {
  return intake
    .map(entry =>
      classifyLeadEvidence({
        kind: entry.kind,
        stage: entry.stage,
        sourceFactCount: factCount(entry),
        expressed: false,
        proposedByCopilot: false,
      }),
    )
    .filter((level): level is LeadEvidenceLevel => level !== null)
}

describe('parité démo — la file « Pistes à qualifier » d’un dossier', () => {
  it('LIT un jeu réel — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(signals.length).toBeGreaterThan(0)
    expect(intake.length).toBeGreaterThanOrEqual(3)
    expect(DEMO_SEEDED_TABLES).toContain('opportunities')
    expect(DEMO_SEEDED_TABLES).toContain('qualification_lead_decisions')
  })

  it('porte au moins TROIS pistes, de TROIS niveaux de preuve différents', () => {
    const levels = levelsOfTheRoom()
    expect(levels.length).toBeGreaterThanOrEqual(3)
    expect(new Set(levels).size).toBeGreaterThanOrEqual(3)
  })

  it('montre la CONVERGENCE, qui ne se voit qu’à plusieurs faits sur un même domaine', () => {
    expect(levelsOfTheRoom()).toContain('converging_signals')
    expect(levelsOfTheRoom()).toContain('isolated_signal')
  })

  it('montre une piste ÉCARTÉE, avec son motif — l’état qu’on archive', () => {
    const dismissed = DEMO_DELIVERY_CLIENT.dismissedLead
    expect(dismissed).toBeDefined()
    expect(LEAD_DISMISS_REASONS).toContain(dismissed.reason)
    // Elle vise une ligne RÉELLE du semis, pas une clé inventée.
    expect(signals[dismissed.signalIndex]).toBeDefined()
  })

  it('#3679 — montre aussi une piste EN VEILLE, sur une ligne réelle distincte de l’écartée', () => {
    const snoozed = DEMO_DELIVERY_CLIENT.snoozedLead
    expect(snoozed.snoozedInDays).toBeGreaterThan(0)
    expect(signals[snoozed.signalIndex]).toBeDefined()
    expect(snoozed.signalIndex).not.toBe(DEMO_DELIVERY_CLIENT.dismissedLead.signalIndex)
  })

  it('#3679 — Société Générale porte une piste COMPLÈTE, sans aucun manque bloquant « Préparer l’approche »', () => {
    // Recette 08/10 : 41 pistes, toutes « Identifier le responsable » — aucune ne
    // portait `offer` (périmètre) ni `btmmp.management` (rôle). Posée sur SG, pas
    // SNCF (voir le docblock de `DEMO_SG_COMPLETE_LEAD` : SNCF a déjà deux affaires
    // ouvertes du même domaine, qui auraient détourné l'action vers « affaire
    // existante » via `existingOpportunityId`).
    const lead = DEMO_SG_COMPLETE_LEAD
    expect(lead.offer).toBeTruthy()
    expect(lead.management).toBeTruthy()
    expect(lead.primary_domain_code).toBe('esn_it')
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    expect(sg).toBeDefined()
    // Le rôle reprend MOT POUR MOT le titre d'un contact déjà seedé : jamais un
    // rôle sans personne en face pour le lire (`matchContactsForRole`).
    expect(sg!.contacts.some(contact => contact.title === lead.management)).toBe(true)
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_QUALIFICATION_LEADS_COVERAGE.state).toBe('seede')
    expect(DEMO_QUALIFICATION_LEADS_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
