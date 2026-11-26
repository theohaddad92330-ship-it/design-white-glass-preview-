import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accountAnalysisSchema, WORKSPACE_PROFILES } from '@bellum/contracts'
import { normalizeFullName } from '../contacts/contact-identity'
import { DEMO_FORFAIT_ROOM_COVERAGE, DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_FORFAIT_DOSSIERS, DEMO_FORFAIT_FRAMED_OPPORTUNITY, DEMO_FORFAIT_PROJECTS } from './demo-forfait-dataset'
import {
  DEMO_FORFAIT_SLOT_BASE,
  demoRoomVariantOf,
  demoSeedFingerprintFor,
  demoSlotIndexFor,
} from './demo-room-variant'
import { DEMO_SEED_FINGERPRINT } from './demo-seed-fingerprint'

/**
 * #4291 (lot J, décision Louis 21/10) — LE SECOND ESPACE DÉMO, au profil « forfait / conseil ».
 * Même pool, même reset, même semis : une variante paramétrée par le numéro de salle, jamais un second moteur.
 */
describe('démo forfait / conseil — la variante de salle (#4291 J.1)', () => {
  it('le numéro de salle dit la variante : 1..N staffing, au-delà de la base forfait', () => {
    expect(demoRoomVariantOf(1)).toBe('staffing')
    expect(demoRoomVariantOf(null)).toBe('staffing')
    expect(demoRoomVariantOf(undefined)).toBe('staffing')
    expect(demoRoomVariantOf(DEMO_FORFAIT_SLOT_BASE)).toBe('staffing')
    expect(demoRoomVariantOf(DEMO_FORFAIT_SLOT_BASE + 1)).toBe('forfait_conseil')
    expect(demoSlotIndexFor('forfait_conseil', 1)).toBe(DEMO_FORFAIT_SLOT_BASE + 1)
    expect(demoSlotIndexFor('staffing', 3)).toBe(3)
  })

  it('la variante est un profil d’espace livré (#4270), rien d’inventé', () => {
    expect(WORKSPACE_PROFILES).toContain('forfait_conseil')
  })

  it('la démo actuelle garde SON empreinte, à l’octet ; la variante forfait en a une autre', () => {
    expect(demoSeedFingerprintFor('staffing')).toBe(DEMO_SEED_FINGERPRINT)
    expect(demoSeedFingerprintFor('forfait_conseil')).not.toBe(DEMO_SEED_FINGERPRINT)
    expect(demoSeedFingerprintFor('forfait_conseil').length).toBeGreaterThan(0)
  })
})

describe('démo forfait / conseil — le jeu de données (#4291 J.1)', () => {
  it('des comptes FICTIFS, distincts de la démo staffing', () => {
    expect(DEMO_FORFAIT_DOSSIERS.length).toBeGreaterThanOrEqual(3)
    const staffing = new Set(DEMO_DOSSIERS.map(d => d.account.company_name))
    for (const dossier of DEMO_FORFAIT_DOSSIERS) {
      expect(staffing.has(dossier.account.company_name)).toBe(false)
      // Fictif : aucun identifiant de registre, un domaine réservé à l'exemple.
      expect(dossier.account.siren).toBeNull()
      expect(dossier.account.website).toMatch(/\.example\/?$/)
      expect(dossier.account.raw_analysis['demo_seed']).toBe(true)
    }
  })

  it('aucun compte mince : contacts, signaux datés, angles et plan sur chacun', () => {
    for (const dossier of DEMO_FORFAIT_DOSSIERS) {
      const name = dossier.account.company_name
      expect({ name, contacts: dossier.contacts.length >= 4 }).toEqual({ name, contacts: true })
      expect({ name, signals: dossier.account.recent_signals.length >= 2 }).toEqual({ name, signals: true })
      for (const signal of dossier.account.recent_signals) {
        expect({ name, date: /^\d{4}-\d{2}-\d{2}$/.test(String(signal.date)) }).toEqual({ name, date: true })
      }
      expect(dossier.attackAngles.length).toBeGreaterThanOrEqual(2)
      expect(dossier.attackAngles.filter(a => a.is_recommended)).toHaveLength(1)
      expect(dossier.actionPlan.weeks.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('des contacts aux NOMS COMPLETS, dont au moins un décideur par compte, sans doublon de nom', () => {
    for (const dossier of DEMO_FORFAIT_DOSSIERS) {
      const seen = new Set<string>()
      for (const contact of dossier.contacts) {
        expect(contact.full_name.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
        const key = normalizeFullName(contact.full_name)
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
      expect(dossier.contacts.some(c => c.decision_role === 'economic')).toBe(true)
    }
  })

  it('les valeurs écrites respectent les CHECK SQL (contacts, comptes)', () => {
    // contacts_decision_role_check (1782700000000-AddProcurementDecisionRole)
    const roles = [
      'technical',
      'economic',
      'procurement',
      'user',
      'champion',
      'sponsor',
      'operational',
      'purchasing',
      'influencer',
      'blocker',
      'unknown',
    ]
    // Les valeurs déjà écrites par le semis staffing (même colonne, même écrivain) : la variante n'en invente aucune.
    const used = (pick: (c: (typeof DEMO_DOSSIERS)[number]['contacts'][number]) => string | null) =>
      new Set(DEMO_DOSSIERS.flatMap(d => d.contacts.map(pick)))
    const seniorities = used(c => c.seniority)
    const lifecycles = used(c => c.lifecycle_state)
    const families = used(c => c.family)
    const statuses = new Set(DEMO_DOSSIERS.map(d => d.account.commercial_status))
    const sprints = new Set(DEMO_DOSSIERS.map(d => d.account.sprint))
    const strategies = new Set(DEMO_DOSSIERS.map(d => d.actionPlan.strategy_type))
    for (const dossier of DEMO_FORFAIT_DOSSIERS) {
      expect(statuses).toContain(dossier.account.commercial_status)
      expect(sprints).toContain(dossier.account.sprint)
      expect(strategies).toContain(dossier.actionPlan.strategy_type)
      for (const contact of dossier.contacts) {
        expect(roles).toContain(contact.decision_role)
        expect(seniorities).toContain(contact.seniority)
        expect(lifecycles).toContain(contact.lifecycle_state)
        expect(families).toContain(contact.family)
      }
    }
  })
})

describe('démo forfait / conseil — les besoins lus comme projets à cadrer (#4291 J.1)', () => {
  const companies = new Set(DEMO_FORFAIT_DOSSIERS.map(d => d.account.company_name))

  it('chaque projet tient à un compte du jeu, son sponsor est un contact NOMMÉ de ce compte', () => {
    expect(DEMO_FORFAIT_PROJECTS.length).toBeGreaterThanOrEqual(4)
    for (const project of DEMO_FORFAIT_PROJECTS) {
      expect(companies.has(project.company)).toBe(true)
      const dossier = DEMO_FORFAIT_DOSSIERS.find(d => d.account.company_name === project.company)!
      expect(dossier.contacts.map(c => c.full_name)).toContain(project.sponsor)
    }
  })

  it('à cadrer : périmètre, sponsor et budget renseignés — jamais un « 0 »', () => {
    const toScope = DEMO_FORFAIT_PROJECTS.filter(p => p.status === 'to_qualify' || p.status === 'qualified')
    expect(toScope.length).toBeGreaterThanOrEqual(2)
    for (const project of DEMO_FORFAIT_PROJECTS) {
      expect(project.scope.length).toBeGreaterThan(40)
      expect(project.budget_cents).toBeGreaterThan(0)
    }
  })

  it('au moins un projet GAGNÉ, suivi à la place d’une mission : forfait encadré, sans consultant', () => {
    const won = DEMO_FORFAIT_PROJECTS.filter(p => p.status === 'won')
    expect(won.length).toBeGreaterThanOrEqual(1)
    for (const project of won) {
      expect(project.mission).not.toBeNull()
      expect(project.mission?.delivery_mode).toBe('supervised')
      expect(project.mission?.client_team_names.length).toBeGreaterThan(0)
    }
  })

  it('les valeurs écrites respectent les CHECK SQL (project_needs, missions)', () => {
    // project_needs_status_check (1796321398100), supervision_role / delivery_mode (1796424913577).
    const needStatuses = ['to_qualify', 'qualified', 'won']
    const roles = ['framing', 'supervision', 'both']
    for (const project of DEMO_FORFAIT_PROJECTS) {
      expect(needStatuses).toContain(project.status)
      expect(roles).toContain(project.supervision_role)
      if (project.mission) {
        expect(['active', 'onboarding']).toContain(project.mission.status)
        expect(roles).toContain(project.mission.supervision_role)
      }
    }
    const migrations = join(__dirname, '../../migrations')
    const statusCheck = readFileSync(join(migrations, '1796321398100-NeedInterviewNegotiationStatuses.ts'), 'utf8')
    for (const status of needStatuses) expect(statusCheck).toContain(`'${status}'`)
  })
})

describe('démo forfait / conseil — le semis branche la variante (#4291 J.1)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('les dossiers forfait passent par le MÊME seedDossier que la démo staffing', () => {
    const variant = seed.slice(seed.indexOf('private async seedForfaitVariant('))
    expect(variant.length).toBeGreaterThan(0)
    expect(variant.slice(0, 2500)).toContain('this.seedDossier(dossier, workspaceId, ownerUserId')
  })
})

/**
 * #4291 J.4 — la couverture démo du NOUVEL espace : chaque table qu'il écrit et chaque clé de `raw_analysis` de ses
 * comptes est classée (semée, ou vide à dessein avec sa raison). Rien de la démo staffing n'est déplacé.
 */
describe('démo forfait / conseil — demo-coverage (#4291 J.4)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const variantBody = seed.slice(
    seed.indexOf('private async seedForfaitVariant('),
    seed.indexOf('\n  }\n', seed.indexOf('private async seedForfaitVariant(')),
  )
  const contractKeys = Object.keys((accountAnalysisSchema as unknown as { shape: Record<string, unknown> }).shape)
  const filled = (key: string): boolean =>
    DEMO_FORFAIT_DOSSIERS.some(d => {
      const value = (d.account.raw_analysis as Record<string, unknown>)[key]
      if (value == null) return false
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object') return Object.keys(value as object).length > 0
      return true
    })

  it('chaque table écrite par la variante est classée SEMÉE, et déjà semée (et purgée) dans la démo staffing', () => {
    const written = new Set(
      [...variantBody.matchAll(/(?:INSERT INTO|UPDATE)\s+([a-z_]+)/g)].map(([, table]) => table as string),
    )
    // `seedDossier` (le même que la démo staffing) écrit ces tables-là pour chaque dossier.
    for (const table of ['accounts', 'contacts', 'account_entities', 'attack_angles', 'action_plans'])
      written.add(table)
    expect(written.size).toBeGreaterThan(5)
    for (const table of written) {
      expect({ table, classified: DEMO_FORFAIT_ROOM_COVERAGE.tables.includes(table) }).toEqual({
        table,
        classified: true,
      })
      expect(DEMO_SEEDED_TABLES).toContain(table)
    }
  })

  it('la garde sait dire NON : une table hors classement serait vue', () => {
    expect(DEMO_FORFAIT_ROOM_COVERAGE.tables.includes('rfps')).toBe(false)
  })

  it('chaque clé du contrat raw_analysis est classée pour les comptes forfait : semée, ou vide à dessein avec raison', () => {
    for (const key of contractKeys) {
      const seeded = DEMO_FORFAIT_ROOM_COVERAGE.rawAnalysis.seeded.includes(key)
      expect({ key, seeded }).toEqual({ key, seeded: filled(key) })
    }
    expect(DEMO_FORFAIT_ROOM_COVERAGE.rawAnalysis.seeded.length).toBeGreaterThanOrEqual(3)
    expect(DEMO_FORFAIT_ROOM_COVERAGE.rawAnalysis.othersEmptyReason.length).toBeGreaterThan(80)
  })

  it('aucune entrée de la démo staffing n’est déplacée : les tables forfait restent semées côté staffing', () => {
    for (const table of DEMO_FORFAIT_ROOM_COVERAGE.tables) {
      expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain(table)
    }
  })
})

// #4291.7 (recette 23/10) — « Plan stratégique 2029 à outiller techniquement » (affaire Société Générale de la salle,
// reprise dans la salle forfait) s'ouvrait avec 90 000 € mais ni périmètre ni sponsor : la salle forfait le CADRE.
describe('démo forfait / conseil — l’affaire « Plan stratégique 2029 » est cadrée (#4291.7)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('le jeu porte son périmètre et son sponsor, un contact du compte', () => {
    expect(DEMO_FORFAIT_FRAMED_OPPORTUNITY.label).toBe('Plan stratégique 2029 à outiller techniquement')
    expect(DEMO_FORFAIT_FRAMED_OPPORTUNITY.scope_label.length).toBeGreaterThan(30)
    expect(DEMO_FORFAIT_FRAMED_OPPORTUNITY.sponsor).toBe('Julien Castaing')
  })

  it('le semis de la variante forfait pose le périmètre (sans écraser une saisie) et rattache le sponsor', () => {
    expect(seed).toContain('DEMO_FORFAIT_FRAMED_OPPORTUNITY')
    expect(seed).toMatch(/UPDATE opportunities\s+SET scope_label/)
    expect(seed).toMatch(/INSERT INTO project_contacts[\s\S]{0,400}'sponsor'/)
  })
})
