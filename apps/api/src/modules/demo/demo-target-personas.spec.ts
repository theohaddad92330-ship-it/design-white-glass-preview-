import { ESN_TARGET_LEVELS } from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from '../contacts/contact-ranking'
import { prepareTargetPersonas } from '../contacts/target-persona-match'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_TARGET_PERSONAS } from './demo-dataset'
import { demoCompletenessProbes } from './demo-reset.service'

/**
 * #3754.6 — parité démo : les postes cibles de l'ESN sont semés, et un compte de
 * la salle montre l'ordre ET la raison (« Niveau 1 pour vous — signataire »).
 */
describe('postes cibles de l’ESN en démo (#3754.6)', () => {
  it('chaque poste a un intitulé et un niveau 1-4', () => {
    expect(DEMO_TARGET_PERSONAS.length).toBeGreaterThanOrEqual(8)
    for (const persona of DEMO_TARGET_PERSONAS) {
      expect(persona.title.trim()).not.toBe('')
      expect(ESN_TARGET_LEVELS as readonly number[]).toContain(persona.decision_level)
    }
  })

  it('l’écran de Société Générale (chemin recommandé) montre plusieurs niveaux et un contact sans niveau', () => {
    // #3754.6 — le MÊME chemin que l'écran : les contacts réellement semés (liste écrite + densité + brief,
    // `DEMO_DOSSIERS` les a déjà fusionnés) passent par `rankAccountContacts`, qui applique `applyTargetLevels`
    // puis garde les 10 premiers. Calculer sur la liste brute laissait passer « 10/10 Niveau 1 ».
    const prepared = prepareTargetPersonas(DEMO_TARGET_PERSONAS)
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    expect(sg).toBeDefined()
    const rows: RankableContactRow[] = sg!.contacts.map((contact, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      title: contact.title,
      entity: contact.entity,
      decision_role: contact.decision_role,
      email: contact.email,
      email_verified: null,
      phone: contact.phone ?? null,
      linkedin_url: null,
      source: null,
      user_status: null,
      email_sent_at: null,
      last_enrichment_at: null,
      priority: contact.priority,
      demo_seed_first_door: true,
    }))
    const { ranked } = rankAccountContacts(rows, sg!.account.raw_analysis as Record<string, unknown>, {}, 10, prepared)
    expect(ranked.length).toBeGreaterThanOrEqual(8)
    const levels = ranked.map(entry => ('esn_target_level' in entry ? entry.esn_target_level : null))
    const matched = levels.filter((level): level is NonNullable<typeof level> => level != null)
    expect(matched.length).toBeGreaterThanOrEqual(3)
    // Au moins 3 niveaux DISTINCTS : l'ordre se voit, ce n'est pas « tout niveau 1 ».
    expect(new Set(matched).size).toBeGreaterThanOrEqual(3)
    expect(Math.min(...matched)).toBe(1)
    // Et au moins un contact reste sans niveau : on n'affiche pas ce qu'on n'a pas.
    expect(levels.some(level => level == null)).toBe(true)
  })

  it('esn_target_personas est déclarée SEEDÉE et sondée par la complétude de la salle', () => {
    expect(DEMO_SEEDED_TABLES as readonly string[]).toContain('esn_target_personas')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('esn_target_personas')
    expect(demoCompletenessProbes().find(p => p.table === 'esn_target_personas')).toEqual({
      table: 'esn_target_personas',
      where: 'workspace_id = $1',
    })
  })
})
