import { CLOSED_STAGES, isPipelineStage } from '@bellum/contracts'
import { DEMO_ACCOUNT_OPPORTUNITIES_TOP_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #2119.8 → #2119.13 — LA PARITÉ DÉMO DE LA TÊTE « OPPORTUNITÉS ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RECOMPTE, ET LE PIÈGE QU'ELLE VISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bloc n'ajoute aucune table : `demo-coverage.spec.ts` ne lui pose aucune
 * question. Et il se TAIT quand il n'a rien à mettre en tête — ce qui est la
 * bonne conduite à l'écran, et le pire des états en démonstration : un semis
 * qui ne porterait que des signaux ou que des affaires closes le rendrait
 * INVISIBLE en salle, et invisible ne se distingue pas de « pas livré ».
 *
 * Cette garde vérifie donc sur le JEU qu'au moins une ligne entre dans le top,
 * et que chaque axe que la salle PEUT remplir l'est. Elle sait dire non : vider
 * `pipelineProjects`, ou porter toutes les affaires à une étape close, la fait
 * rougir.
 */
const pipeline = DEMO_DELIVERY_CLIENT.pipelineProjects
const signals = DEMO_DELIVERY_CLIENT.detectedSignals

describe('parité démo — la tête « Opportunités » d’un dossier de compte', () => {
  it('LIT un jeu réel — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(Array.isArray(pipeline)).toBe(true)
    expect(pipeline.length).toBeGreaterThan(0)
    expect(DEMO_SEEDED_TABLES).toContain('opportunities')
    expect(DEMO_SEEDED_TABLES).toContain('tasks')
  })

  it('porte au moins une affaire qui ENTRE dans le top — sinon la tête est muette en salle', () => {
    // Les deux exclusions du bloc, appliquées au jeu : un `signal` n'y entre
    // pas, une affaire close non plus.
    const eligible = pipeline.filter(deal => !(CLOSED_STAGES as readonly string[]).includes(deal.stage))
    expect(eligible.length).toBeGreaterThanOrEqual(1)
  })

  it('atteint le HAUT de l’échelle de preuve — une étape du pipe vaut « besoin exprimé »', () => {
    // `explicitlyExpressed: isPipelineStage(stage)` : c'est le seul témoin d'une
    // parole sur une ligne, et c'est lui qui fait monter la carte au-dessus des
    // faits. Sans ça, la salle ne montrerait que le barreau bas.
    expect(pipeline.some(deal => isPipelineStage(deal.stage))).toBe(true)
  })

  it('montre les DEUX états du périmètre — un montant saisi, et une absence NOMMÉE', () => {
    // Mesuré sur le jeu, pas supposé : une affaire porte un montant, l'autre
    // n'en porte pas. C'est la salle idéale pour ce bloc — elle exerce la règle
    // dans ses deux sens. Une affaire sans montant affiche « Périmètre non
    // identifié », JAMAIS « 0,00 € », et c'est ce que ce jeu rend visible.
    const withAmount = pipeline.filter(deal => typeof deal.amount_cents === 'number')
    const withoutAmount = pipeline.filter(deal => typeof deal.amount_cents !== 'number')

    expect(withAmount.length).toBeGreaterThanOrEqual(1)
    expect(withoutAmount.length).toBeGreaterThanOrEqual(1)
    for (const deal of withAmount) expect(deal.amount_cents).toBeGreaterThan(0)
  })

  it('remplit l’OFFRE de chaque affaire — la carte nomme toujours ce qu’on rapproche', () => {
    for (const deal of pipeline) {
      expect(deal.primary_domain_code.length).toBeGreaterThan(0)
    }
  })

  it('remplit l’ACTION d’au moins une affaire — la carte porte « quoi faire »', () => {
    expect(pipeline.some(deal => Boolean(deal.nextAction))).toBe(true)
  })

  it('garde des SIGNAUX hors du top — ils ont leur place juste en dessous, pas en tête', () => {
    // Semés sans montant ni échéance, `kind: signal` : le bloc les écarte, et
    // c'est ce qui l'empêche de promettre du travail qui n'existe pas.
    expect(signals.length).toBeGreaterThanOrEqual(1)
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_ACCOUNT_OPPORTUNITIES_TOP_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_OPPORTUNITIES_TOP_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
