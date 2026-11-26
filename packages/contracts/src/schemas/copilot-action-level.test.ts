import { describe, expect, it } from 'vitest'
import { actionIntentTypeSchema } from './action-router.js'
import { intentReversibility, intentSite, reachesOutsideProduct } from './action-os.js'
import {
  AUTOMATE_LEVEL_PERMISSION,
  AUTOMATION_PREREQUISITES,
  COPILOT_ACTION_LEVEL_ORDER,
  GRADUATED_MODE_LEVEL,
  PREPARED_IN_BELLUM,
  copilotActionLevelSchema,
  graduatedActionModeSchema,
  missingAutomationPrerequisites,
  offeredActionLevels,
} from './copilot-action-level.js'

describe('#2449 — les quatre niveaux d’action sont une VALEUR, pas une étiquette', () => {
  it('les quatre niveaux existent, du plus inerte au plus autonome', () => {
    expect(COPILOT_ACTION_LEVEL_ORDER).toEqual(['respond_only', 'prepare', 'execute', 'automate'])
    // La liste et le schéma ne peuvent pas diverger : un cinquième niveau
    // ajouté d'un côté et oublié de l'autre rougit ici.
    expect([...copilotActionLevelSchema.options].sort()).toEqual([...COPILOT_ACTION_LEVEL_ORDER].sort())
  })

  it('le schéma refuse un niveau inventé', () => {
    expect(copilotActionLevelSchema.safeParse('automatiser').success).toBe(false)
    expect(copilotActionLevelSchema.safeParse('n4_bounded_auto').success).toBe(false)
  })
})

describe('#2449 — OÙ l’effet atterrit : un seul axe, trois sites', () => {
  it('chaque intent du contrat est classé (table exhaustive, LUE)', () => {
    const sites = actionIntentTypeSchema.options.map(type => intentSite(type))
    expect(sites.length).toBeGreaterThanOrEqual(13)
    expect(new Set(sites)).toEqual(new Set(['bellum', 'connected_system', 'person']))
  })

  it('TÉMOIN — `reachesOutsideProduct` ne change pas de réponse : « quelqu’un reçoit » = site `person`', () => {
    for (const type of actionIntentTypeSchema.options) {
      expect(reachesOutsideProduct(type)).toBe(intentSite(type) === 'person')
    }
    expect(reachesOutsideProduct('send_email')).toBe(true)
    expect(reachesOutsideProduct('create_calendar_event')).toBe(true)
    expect(reachesOutsideProduct('create_crm_task')).toBe(false)
    expect(reachesOutsideProduct('create_mail_draft')).toBe(false)
  })

  it('l’axe SÉPARE « quitte notre base » de « quelqu’un reçoit »', () => {
    // Une écriture CRM sort de BellumAI et ne sollicite personne : c'est
    // précisément ce que `reachesOutsideProduct` ne sait pas dire.
    expect(intentSite('create_crm_task')).toBe('connected_system')
    expect(intentSite('create_crm_note')).toBe('connected_system')
    expect(intentSite('create_mail_draft')).toBe('connected_system')
    expect(intentSite('enrich_contact')).toBe('connected_system')
    expect(intentSite('send_email')).toBe('person')
    expect(intentSite('generate_message')).toBe('bellum')
    expect(intentSite('schedule_reminder')).toBe('bellum')
    expect(intentSite('pin_memory_fact')).toBe('bellum')
  })
})

describe('#2449.16 — « préparé dans BellumAI » : le mot compte', () => {
  it('le statut d’une préparation n’est ni « créé » ni « envoyé »', () => {
    expect(PREPARED_IN_BELLUM).toBe('prepared_in_bellum')
    expect(PREPARED_IN_BELLUM).not.toMatch(/created|sent|envoy/i)
  })
})

describe('#2449.26-.31 — les six conditions de l’automatisation, toutes nécessaires', () => {
  const allTrue = () =>
    Object.fromEntries(AUTOMATION_PREREQUISITES.map(name => [name, true])) as Record<
      (typeof AUTOMATION_PREREQUISITES)[number],
      boolean
    >

  it('les six sont nommées, et ce sont celles du rapport', () => {
    expect([...AUTOMATION_PREREQUISITES]).toEqual([
      'capability_exists',
      'workspace_policy_allows',
      'role_allowed',
      'simulation_validated',
      'cap_defined',
      'kill_switch_available',
    ])
  })

  it('TÉMOIN POSITIF — les six réunies ne manquent de rien', () => {
    expect(missingAutomationPrerequisites(allTrue())).toEqual([])
  })

  it('sait dire NON : chacune des six, retirée SEULE, manque', () => {
    for (const name of AUTOMATION_PREREQUISITES) {
      expect(missingAutomationPrerequisites({ ...allTrue(), [name]: false })).toEqual([name])
    }
  })
})

describe('#2449.32 — « automatiser » n’est jamais proposé à un utilisateur non habilité', () => {
  it('l’habilitation réutilise la matrice de permissions, elle n’invente pas une liste de rôles', () => {
    expect(AUTOMATE_LEVEL_PERMISSION).toBe('team:manage')
  })

  it('un propriétaire voit les quatre niveaux ; un membre n’en voit que trois', () => {
    expect(offeredActionLevels('owner')).toEqual(['respond_only', 'prepare', 'execute', 'automate'])
    expect(offeredActionLevels('member')).toEqual(['respond_only', 'prepare', 'execute'])
    expect(offeredActionLevels('viewer')).toEqual(['respond_only', 'prepare', 'execute'])
  })

  it('MASQUÉ n’est pas FILTRÉ : les trois autres niveaux restent, dans le même ordre', () => {
    const offered = offeredActionLevels('member')
    expect(offered).toEqual(COPILOT_ACTION_LEVEL_ORDER.filter(level => level !== 'automate'))
  })
})

describe('#2400.3 — les cinq modes gradués, et la correspondance avec les quatre niveaux', () => {
  it('les cinq modes du rapport existent, jamais un sixième', () => {
    expect([...graduatedActionModeSchema.options]).toEqual([
      'observe',
      'suggest',
      'prepare',
      'execute-after-approval',
      'auto-execute',
    ])
    expect(graduatedActionModeSchema.safeParse('dry-run').success).toBe(false)
  })

  it('chaque mode est lié à EXACTEMENT un niveau, et aucun niveau n’est orphelin', () => {
    const levels = graduatedActionModeSchema.options.map(mode => GRADUATED_MODE_LEVEL[mode])
    expect(new Set(levels)).toEqual(new Set(COPILOT_ACTION_LEVEL_ORDER))
  })

  it('« observe » et « suggest » tombent sur le MÊME niveau : ni l’un ni l’autre n’écrit', () => {
    expect(GRADUATED_MODE_LEVEL.observe).toBe('respond_only')
    expect(GRADUATED_MODE_LEVEL.suggest).toBe('respond_only')
    expect(GRADUATED_MODE_LEVEL['execute-after-approval']).toBe('execute')
    expect(GRADUATED_MODE_LEVEL['auto-execute']).toBe('automate')
  })
})

describe('#2400.8 — la réversibilité classe chaque geste, et ce n’est pas le risque', () => {
  it('les trois classes sont toutes utilisées par le catalogue d’intents', () => {
    const classes = actionIntentTypeSchema.options.map(type => intentReversibility(type))
    expect(new Set(classes)).toEqual(new Set(['reversible', 'compensable', 'irreversible']))
  })

  it('un envoi ne se défait ni ne se compense ; une note versée se compense ; un rappel se retire', () => {
    expect(intentReversibility('send_email')).toBe('irreversible')
    expect(intentReversibility('create_crm_note')).toBe('compensable')
    expect(intentReversibility('create_crm_task')).toBe('compensable')
    expect(intentReversibility('enrich_contact')).toBe('compensable')
    expect(intentReversibility('schedule_reminder')).toBe('reversible')
    expect(intentReversibility('create_mail_draft')).toBe('reversible')
  })

  it('la classe ne se déduit PAS du site : deux intents du même site diffèrent', () => {
    expect(intentSite('send_email')).toBe('person')
    expect(intentSite('create_calendar_event')).toBe('person')
    expect(intentReversibility('send_email')).not.toBe(intentReversibility('create_calendar_event'))
  })
})
