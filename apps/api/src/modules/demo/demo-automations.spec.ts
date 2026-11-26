import type { QueryRunner } from 'typeorm'
import {
  AUTOMATION_ACTION_KINDS,
  AUTOMATION_OUTCOMES,
  AUTOMATION_PREPARED_ACTIONS,
  AUTOMATION_RULE_LIMITS,
  AUTOMATION_SIGNALS,
  OUTREACH_INTENTS,
  OUTREACH_PLAYBOOK_KEYS,
  countAutomationFirings,
} from '@bellum/contracts'
import { AutomationRules1796540127394 } from '../../migrations/1796540127394-AutomationRules'
import { DEMO_AUTOMATIONS_COVERAGE, DEMO_SEEDED_TABLES, DEMO_SEQUENCE_JOURNEY_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_AUTOMATION_MESSAGES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_TRIALS } from './demo-automations'
import { AutomationRuleEditor1796574823417 } from '../../migrations/1796574823417-AutomationRuleEditor'

/**
 * Lot L-D1 (#4167, craft rule n°9) — LES AUTOMATISATIONS SONT REMPLIES EN DÉMONSTRATION.
 *
 * Une règle active AVEC des déclenchements, une règle éteinte jamais passée, des e-mails préparés dans
 * « À traiter ». Chaque valeur semée est confrontée au CHECK de la MIGRATION, pas à une liste recopiée.
 */

const flat = async (): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new AutomationRules1796540127394().up(runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ')).join(' ')
}

function checkValues(sql: string, constraint: string): string[] {
  const match = new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\s*(?:\\w+ IS NULL OR )?\\w+ IN \\(([^)]*)\\)`).exec(sql)
  if (!match) throw new Error(`contrainte ${constraint} introuvable dans la migration`)
  return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(found => found[1] as string)
}

// Les contacts de la salle : ceux des dossiers ET ceux du client de la livraison (semés avant l'outreach).
const names = new Set<string>([
  ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts).map(contact => contact.full_name),
  ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
])

describe('automatisations de démo (lot L-D1)', () => {
  it('est classée SEEDÉE, avec sa raison, et ses deux tables sont déclarées semées', () => {
    expect(DEMO_AUTOMATIONS_COVERAGE.state).toBe('seede')
    expect(DEMO_AUTOMATIONS_COVERAGE.reason).toContain('#4167')
    expect(DEMO_SEEDED_TABLES).toEqual(expect.arrayContaining(['automation_rules', 'automation_rule_firings']))
  })

  it('#4357.1 / #4355.1 / #4354.1 — le parcours fusionné est SEEDÉ : il ne lit que des données déjà semées', () => {
    expect(DEMO_SEQUENCE_JOURNEY_COVERAGE.state).toBe('seede')
    expect(DEMO_SEQUENCE_JOURNEY_COVERAGE.reason).toMatch(/#4357/)
    // la section « Séquences sur un signal » montre les règles semées ; le lot d'« À traiter », leurs e-mails
    expect(DEMO_AUTOMATION_RULES.some(rule => rule.enabled)).toBe(true)
    expect(DEMO_AUTOMATION_MESSAGES.length).toBeGreaterThanOrEqual(2)
  })

  it('LIT quelque chose : des règles, des contacts à y chercher, des e-mails préparés', () => {
    expect(DEMO_AUTOMATION_RULES.length).toBeGreaterThanOrEqual(3)
    expect(DEMO_AUTOMATION_MESSAGES.length).toBeGreaterThanOrEqual(1)
    expect(names.size).toBeGreaterThan(10)
  })

  it('au moins une règle ACTIVE porte des déclenchements comptés (inscrit ou préparé)', () => {
    const counted = DEMO_AUTOMATION_RULES.filter(
      rule =>
        rule.enabled && rule.firings.some(firing => firing.outcome === 'enrolled' || firing.outcome === 'prepared'),
    )
    expect(counted.length).toBeGreaterThanOrEqual(2)
  })

  it('le compteur des 30 jours COMPTE le journal semé : mesuré une fois la règle passée', () => {
    const [rule] = DEMO_AUTOMATION_RULES
    const now = new Date()
    const rows = (rule?.firings ?? []).map(firing => ({
      outcome: firing.outcome,
      fired_at: new Date(now.getTime() - firing.daysAgo * 86_400_000).toISOString(),
    }))
    expect(countAutomationFirings(rows, now.toISOString(), now)).toBe(
      (rule?.firings ?? []).filter(firing => firing.outcome === 'enrolled' || firing.outcome === 'prepared').length,
    )
  })

  it('une règle éteinte et jamais passée existe : son compteur est « non mesuré », pas 0', () => {
    const idle = DEMO_AUTOMATION_RULES.find(rule => !rule.enabled && rule.lastRunDaysAgo === null)
    expect(idle).toBeDefined()
    expect(idle?.firings).toEqual([])
    expect(countAutomationFirings([], null, new Date())).toBeNull()
  })

  it('chaque contact visé EXISTE dans la salle', () => {
    for (const rule of DEMO_AUTOMATION_RULES)
      for (const firing of rule.firings)
        if (firing.contact)
          expect({ contact: firing.contact, existe: names.has(firing.contact) }).toEqual({
            contact: firing.contact,
            existe: true,
          })
    for (const message of DEMO_AUTOMATION_MESSAGES)
      expect({ contact: message.contact, existe: names.has(message.contact) }).toEqual({
        contact: message.contact,
        existe: true,
      })
  })

  it('chaque valeur semée est acceptée par le CHECK de la migration', async () => {
    const sql = await flat()
    const signals = checkValues(sql, 'automation_rules_signal_check')
    const kinds = checkValues(sql, 'automation_rules_action_kind_check')
    const playbooks = checkValues(sql, 'automation_rules_playbook_key_check')
    const prepared = checkValues(sql, 'automation_rules_prepared_action_check')
    const outcomes = checkValues(sql, 'automation_rule_firings_outcome_check')
    for (const rule of DEMO_AUTOMATION_RULES) {
      expect(signals).toContain(rule.signal)
      expect(kinds).toContain(rule.actionKind)
      if (rule.playbook) expect(playbooks).toContain(rule.playbook)
      if (rule.prepared) expect(prepared).toContain(rule.prepared)
      for (const firing of rule.firings) expect(outcomes).toContain(firing.outcome)
    }
    expect(signals).toEqual([...AUTOMATION_SIGNALS])
    expect(kinds).toEqual([...AUTOMATION_ACTION_KINDS])
    expect(prepared).toEqual([...AUTOMATION_PREPARED_ACTIONS])
    expect(outcomes).toEqual([...AUTOMATION_OUTCOMES])
    expect(playbooks).toEqual([...OUTREACH_PLAYBOOK_KEYS])
  })

  it('la source « automation » est ouverte aux messages ET aux appels AVANT le code qui l’écrit (GA-11/GA-12)', async () => {
    const sql = await flat()
    expect(sql).toMatch(/outreach_messages_source_check CHECK \(source IN \([^)]*'automation'/)
    expect(sql).toMatch(/outreach_call_tasks_source_check CHECK \(source IN \([^)]*'automation'/)
  })

  it('la grammaire de chaque règle semée est celle du CHECK : une inscription porte une séquence, une préparation son action', () => {
    for (const rule of DEMO_AUTOMATION_RULES) {
      if (rule.actionKind === 'enroll_sequence') {
        expect(rule.playbook).toBeDefined()
        expect(rule.prepared).toBeUndefined()
      } else {
        expect(rule.prepared).toBeDefined()
        expect(rule.playbook).toBeUndefined()
      }
      if (rule.inactiveDays !== undefined) {
        expect(rule.inactiveDays).toBeGreaterThanOrEqual(AUTOMATION_RULE_LIMITS.inactiveDaysMin)
        expect(rule.inactiveDays).toBeLessThanOrEqual(AUTOMATION_RULE_LIMITS.inactiveDaysMax)
      }
    }
  })

  it('chaque e-mail préparé a une règle qui le prépare, une intention de la liste fermée et un signal en « pourquoi »', () => {
    for (const message of DEMO_AUTOMATION_MESSAGES) {
      const rule = DEMO_AUTOMATION_RULES[message.rule]
      expect(rule?.prepared).toBe('email_to_review')
      expect(rule?.enabled).toBe(true)
      expect(OUTREACH_INTENTS as readonly string[]).toContain(message.intent)
      expect(message.reason.length).toBeGreaterThan(10)
      expect(message.body.length).toBeGreaterThan(20)
    }
  })

  it('le « préparé » du journal correspond à un e-mail réellement déposé dans la file', () => {
    const preparedByRule = DEMO_AUTOMATION_MESSAGES.map(message => `${message.rule}:${message.contact}`)
    for (const [ruleIndex, rule] of DEMO_AUTOMATION_RULES.entries())
      for (const firing of rule.firings)
        // Un e-mail préparé il y a plus de trois jours a déjà été traité : il n'attend plus dans la file.
        if (firing.outcome === 'prepared' && firing.contact && firing.daysAgo <= 3) {
          expect(preparedByRule).toContain(`${ruleIndex}:${firing.contact}`)
        }
  })
})

// Théo C automations-bibliotheque.N3 / automations-editeur.N2 — le journal des essais et la règle à brouillon testé.
describe('journal des essais de démo (Théo C)', () => {
  const editorSql = async (): Promise<string> => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql)
        return []
      }),
    } as unknown as QueryRunner
    await new AutomationRuleEditor1796574823417().up(runner)
    return queries.map(sql => sql.replace(/\s+/g, ' ')).join(' ')
  }

  it('sème trois essais : un du brouillon, un de la règle qui tourne, un échec NOMMÉ — l’écran n’est pas vide en réunion', () => {
    expect(DEMO_AUTOMATION_TRIALS.length).toBeGreaterThanOrEqual(3)
    expect(DEMO_AUTOMATION_TRIALS.map(trial => trial.target)).toEqual(expect.arrayContaining(['draft', 'live']))
    const failed = DEMO_AUTOMATION_TRIALS.filter(trial => trial.outcome === 'failed')
    expect(failed.length).toBeGreaterThanOrEqual(1)
    for (const trial of failed) {
      // Un échec n'a rien lu : « non mesuré » (null), jamais 0, et il dit pourquoi.
      expect(trial.situationsRead).toBeNull()
      expect(trial.wouldAct).toBeNull()
      expect(trial.reason?.length ?? 0).toBeGreaterThan(10)
    }
  })

  it('chaque valeur semée respecte le CHECK de la migration (cible, issue, signal)', async () => {
    const sql = await editorSql()
    for (const trial of DEMO_AUTOMATION_TRIALS) {
      expect(checkValues(sql, 'automation_rule_trials_target_check')).toContain(trial.target)
      expect(checkValues(sql, 'automation_rule_trials_outcome_check')).toContain(trial.outcome)
      expect(checkValues(sql, 'automation_rule_trials_signal_check')).toContain(
        DEMO_AUTOMATION_RULES[trial.rule]?.signal,
      )
    }
    expect(checkValues(sql, 'automation_rule_trials_signal_check')).toEqual([...AUTOMATION_SIGNALS])
  })

  it('une règle porte un brouillon TESTÉ : la version suivante est prête à activer', () => {
    const withDraft = DEMO_AUTOMATION_RULES.find(rule => rule.draft)
    expect(withDraft?.draft?.tested).toBe(true)
    expect(withDraft?.name?.length ?? 0).toBeGreaterThan(5)
    expect(DEMO_AUTOMATION_RULES.every(rule => (rule.name ?? '').length > 0)).toBe(true)
  })

  it('la table du journal est déclarée semée', () => {
    expect(DEMO_SEEDED_TABLES).toContain('automation_rule_trials')
  })
})
