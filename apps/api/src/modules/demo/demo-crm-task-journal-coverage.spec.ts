import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DOSSIERS, DEMO_USER_ACTIONS } from './demo-dataset'

/**
 * #2319.114 (#2985, lot h9 27/09/2026) — LE BOUTON DE CLÔTURE D'UNE TÂCHE CRM
 * CRÉÉE PAR BELLUMAI, ATTEIGNABLE DEPUIS LE JOURNAL D'ACTIVITÉ.
 *
 * `crmTaskClosable` (`ActionsService`) se calcule sur une ligne
 * `action_type: 'crm_task_created'` dont le fournisseur est `hubspot`, la
 * référence externe est posée, et ni `withdrawn_at` ni `closed_at` ne sont
 * présents. Sans une telle ligne dans `user_actions`, le bouton « Marquer la
 * tâche CRM comme faite » ne se montre jamais en salle — un écran livré mais
 * jamais atteignable se découvre en réunion, pas en CI.
 */
describe('#2319.114 (#2985) — une tâche CRM créée par BellumAI, atteignable dans le Journal', () => {
  const crmTask = DEMO_USER_ACTIONS.find(action => action.action_type === 'crm_task_created')

  it('une ligne existe, sur un compte RÉELLEMENT semé', () => {
    expect(crmTask).toBeDefined()
    const companies = DEMO_DOSSIERS.map(dossier => dossier.account.company_name)
    expect(companies).toContain(crmTask?.company)
  })

  it('porte exactement ce que `ActionsService` exige pour rendre le bouton de clôture', () => {
    expect(crmTask?.metadata['crm_provider']).toBe('hubspot')
    expect(typeof crmTask?.metadata['external_ref']).toBe('string')
    expect((crmTask?.metadata['external_ref'] as string).length).toBeGreaterThan(0)
    expect(crmTask?.metadata['withdrawn_at']).toBeUndefined()
    expect(crmTask?.metadata['closed_at']).toBeUndefined()
  })

  it('la référence externe est visiblement fictive — jamais un id d’un vrai CRM', () => {
    expect(crmTask?.metadata['external_ref']).toMatch(/^demo-/)
  })

  it('le semis ÉCRIT réellement la ligne', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_USER_ACTIONS')
  })
})
