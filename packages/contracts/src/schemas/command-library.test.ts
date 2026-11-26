import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'
import {
  COMMAND_BILLED_ACTION,
  COMMAND_MOMENTS,
  commandAvailability,
  commandLibraryProblems,
  commandDefinitionSchema,
  commandReads,
  type CommandDefinition,
} from './command-library.js'

const command = (over: Partial<CommandDefinition> = {}): CommandDefinition =>
  commandDefinitionSchema.parse({
    key: 'needs_open',
    category: 'accounts',
    moment: 'handle_need',
    label: { fr: 'Besoins ouverts', en: 'Open needs' },
    prompt: { fr: 'Quels besoins sont actifs ?', en: 'Which needs are open?' },
    tools: ['find_needs'],
    requires: [],
    ...over,
  })

describe('disponibilité d’une commande', () => {
  it('est prête quand rien n’est exigé — la plupart des questions ne dépendent d’aucun connecteur', () => {
    expect(commandAvailability(command(), [])).toEqual({ state: 'ready', missing: [] })
  })

  it('est prête quand tout ce qu’elle exige est connecté', () => {
    const withMail = command({ requires: ['email'] })
    expect(commandAvailability(withMail, ['email', 'calendar']).state).toBe('ready')
  })

  it('est DÉGRADÉE quand une partie seulement manque, et nomme ce qui manque', () => {
    // La refuser en bloc priverait l'utilisateur de la moitié qui fonctionne.
    const both = command({ requires: ['email', 'calendar'] })
    expect(commandAvailability(both, ['email'])).toEqual({ state: 'degraded', missing: ['calendar'] })
  })

  it('est indisponible quand rien de ce qu’elle exige n’est là', () => {
    const both = command({ requires: ['email', 'calendar'] })
    expect(commandAvailability(both, ['crm'])).toEqual({ state: 'unavailable', missing: ['email', 'calendar'] })
  })

  it('ne devine jamais une connexion : une famille absente est manquante', () => {
    const withCrm = command({ requires: ['crm'] })
    expect(commandAvailability(withCrm, []).missing).toEqual(['crm'])
  })
})

describe('forme du catalogue', () => {
  it('accepte un catalogue sain', () => {
    expect(commandLibraryProblems([command()], ['find_needs'])).toEqual([])
  })

  it('refuse une commande qui appelle un outil inexistant', () => {
    // Le défaut le plus coûteux : l'écran la propose, le modèle appelle un
    // outil inconnu, l'utilisateur reçoit « je n'ai pas pu ».
    expect(commandLibraryProblems([command({ tools: ['outil_fantome'] })], ['find_needs'])).toEqual([
      'needs_open appelle un outil inconnu : outil_fantome',
    ])
  })

  it('refuse deux commandes de même clé', () => {
    expect(commandLibraryProblems([command(), command()], ['find_needs'])).toContain('Commande en double : needs_open')
  })

  it('exige un prompt dans les deux langues', () => {
    expect(
      commandDefinitionSchema.safeParse({
        key: 'k',
        category: 'accounts',
        label: { fr: 'a', en: 'b' },
        prompt: { fr: 'a' },
        tools: ['find_needs'],
        requires: [],
      }).success,
    ).toBe(false)
  })

  it('exige au moins un outil — une commande qui n’appelle rien ne fait rien', () => {
    expect(commandDefinitionSchema.safeParse({ ...command(), tools: [] }).success).toBe(false)
  })
})

// #1913.2 → .10 — le catalogue se range par MOMENT MÉTIER, et ce rangement vit
// sur la commande elle-même (un seul endroit, GA-26).
describe('#1913 — les moments métier', () => {
  it('sont les neuf moments du retour, plus la clôture (#2392), dans son ordre — l’ordre est celui de l’affichage', () => {
    expect(COMMAND_MOMENTS).toEqual([
      'start_day',
      'prepare_meeting',
      'open_account',
      'find_contact',
      'position_consultant',
      'handle_need',
      'follow_up',
      'track_mission',
      'steer_team',
      // #2392 — la clôture de fin de journée.
      'end_day',
    ])
  })

  it('refuse une commande sans moment — une commande non rangée disparaîtrait de l’écran', () => {
    const sansMoment: Record<string, unknown> = { ...command() }
    delete sansMoment.moment
    expect(commandDefinitionSchema.safeParse(sansMoment).success).toBe(false)
  })

  it('un résultat attendu, quand il est écrit, l’est dans les deux langues', () => {
    expect(commandDefinitionSchema.safeParse({ ...command(), outcome: { fr: 'x' } }).success).toBe(false)
    expect(commandDefinitionSchema.safeParse({ ...command(), outcome: { fr: 'x', en: 'y' } }).success).toBe(true)
  })

  it('le résultat attendu reste facultatif — un champ inconnu est absent, jamais rempli', () => {
    expect(commandDefinitionSchema.safeParse(command()).success).toBe(true)
  })
})

// #1913.11 — « donnée utilisée » se DÉRIVE des outils appelés : écrite à la main
// sur chaque commande, elle divergerait le jour où une commande change d'outil.
describe('#1913.11 — la donnée utilisée', () => {
  it('réunit ce que lisent les outils, sans doublon, dans l’ordre des outils', () => {
    expect(commandReads(command({ tools: ['find_needs', 'run_matching'] }))).toEqual(['needs', 'bench'])
  })

  it('un outil qui ne lit aucune donnée de l’espace ne contribue rien', () => {
    // `find_accounts` prépare des critères ; la recherche part de Découvrir, après le clic.
    expect(commandReads(command({ tools: ['find_accounts'] }))).toEqual([])
  })

  it('un outil non déclaré rend la donnée INCONNUE — jamais une liste partielle présentée comme complète', () => {
    expect(commandReads(command({ tools: ['find_needs', 'outil_fantome'] }))).toBeNull()
  })
})

// #1913.11 — le coût d'une commande se LIT dans la grille, jamais un littéral.
describe('#1913.11 — ce que coûte une commande', () => {
  it('une commande est UN message à Laura : son coût est la ligne `copilot_message` de la grille', () => {
    expect(COMMAND_BILLED_ACTION).toBe('copilot_message')
    expect(Object.keys(CREDIT_WEIGHTS)).toContain(COMMAND_BILLED_ACTION)
  })
})
