import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMAND_MOMENTS,
  COMMAND_TOOL_READS,
  commandAvailability,
  commandDefinitionSchema,
  commandLibraryProblems,
  commandReads,
} from '@bellum/contracts'
import { COMMAND_CATALOG } from './command-catalog'

/**
 * Le catalogue annonce ce que le copilote sait faire. Une commande qui appelle
 * un outil inexistant est donc pire qu'une commande absente : l'écran la
 * propose, le modèle appelle un outil inconnu, et l'utilisateur reçoit « je
 * n'ai pas pu ».
 *
 * La liste des outils est lue dans le fichier Python qui la porte, plutôt que
 * recopiée ici. Une copie diverge le jour où quelqu'un renomme un outil — et
 * c'est exactement ce jour-là que la garde devrait tomber.
 */
function chatToolsSource(): string {
  return readFileSync(join(__dirname, '../../../../ia/app/services/chat_tools.py'), 'utf8')
}

function declaredToolNames(): string[] {
  return [...chatToolsSource().matchAll(/"name":\s*"([a-z_]+)"/g)].map(match => match[1])
}

/**
 * #1913.11 — les outils dont une branche d'exécution propose un geste PAYANT.
 *
 * Le dispatcher Python découpe ses outils en branches `if name == "…":`. Une
 * branche qui porte `"cost_credits": N` avec N > 0 propose un geste qui débite
 * (aujourd'hui : l'enrichissement d'un contact). On découpe le fichier à chaque
 * `if name ==` et on lit la branche jusqu'à la suivante.
 */
function paidProposalTools(source: string): string[] {
  const branches = [...source.matchAll(/\bif name == "([a-z_]+)":/g)]
  return branches
    .filter((branch, index) => {
      const end = branches[index + 1]?.index ?? source.length
      return /"cost_credits":\s*[1-9]/.test(source.slice(branch.index ?? 0, end))
    })
    .map(branch => branch[1])
}

describe('catalogue de commandes', () => {
  it('chaque commande a une forme valide', () => {
    for (const command of COMMAND_CATALOG) {
      expect(() => commandDefinitionSchema.parse(command)).not.toThrow()
    }
  })

  it('n’appelle QUE des outils qui existent', () => {
    const tools = declaredToolNames()
    expect(tools.length).toBeGreaterThan(10)
    expect(commandLibraryProblems(COMMAND_CATALOG, tools)).toEqual([])
  })

  it('la majorité des commandes ne dépend d’AUCUN connecteur', () => {
    // C'est le fait le plus utile de ce catalogue, et il mérite d'être verrouillé :
    // l'essentiel de ce qu'un commercial demande porte sur les données de Bellum.
    const standalone = COMMAND_CATALOG.filter(command => command.requires.length === 0)
    expect(standalone.length).toBeGreaterThan(COMMAND_CATALOG.length / 2)
  })

  it('une commande sans connecteur est prête sur un espace vierge', () => {
    for (const command of COMMAND_CATALOG.filter(entry => entry.requires.length === 0)) {
      expect(commandAvailability(command, []).state).toBe('ready')
    }
  })

  it('couvre les vingt requêtes prioritaires, sauf les deux qu’on ne promet pas', () => {
    // Les deux absentes sont écrites dans le docblock du catalogue avec leur
    // raison : la création d'un rendez-vous (le copilote n'écrit pas) et le
    // bilan trimestriel (aucune maille trimestrielle n'existe).
    const keys = COMMAND_CATALOG.map(command => command.key)
    for (const expected of [
      'mail_no_reply',
      'accounts_to_prioritise',
      'accounts_stalled',
      'needs_open',
      'matching_shortlist',
      'matching_explain',
      'talents_reactivate',
      'missions_ending',
      'missions_at_risk',
      'timesheets_missing',
      'timesheets_chase',
      'invoicing_blocked',
      'agenda_tomorrow',
      'rfp_summary',
      'proofs_usable',
      'interventions_today',
    ]) {
      expect(keys).toContain(expected)
    }
  })
})

describe('#1913 — le catalogue rangé par moments métier', () => {
  it('chaque commande est rangée sous un moment connu — le rangement vit sur la commande, nulle part ailleurs', () => {
    for (const command of COMMAND_CATALOG) {
      expect(COMMAND_MOMENTS).toContain(command.moment)
    }
  })

  it('#1913.11 — chaque commande dit ce qu’elle rend, dans les deux langues', () => {
    const sansResultat = COMMAND_CATALOG.filter(command => !command.outcome).map(command => command.key)
    expect(sansResultat).toEqual([])
  })

  it('#1913.11 — la donnée utilisée est CONNUE pour chaque commande : tous ses outils sont déclarés', () => {
    const inconnues = COMMAND_CATALOG.filter(command => commandReads(command) === null).map(command => command.key)
    expect(inconnues).toEqual([])
  })

  it('la table « outil → donnée lue » ne déclare que des outils qui existent', () => {
    const tools = declaredToolNames()
    expect(Object.keys(COMMAND_TOOL_READS).length).toBeGreaterThan(10)
    expect(Object.keys(COMMAND_TOOL_READS).filter(tool => !tools.includes(tool))).toEqual([])
  })
})

describe('#1913.11 — « inclus » n’est vrai que si aucun outil du catalogue ne propose un geste payant', () => {
  it('LIT le dispatcher — et y trouve le geste payant qui existe', () => {
    const source = chatToolsSource()
    expect(source.length).toBeGreaterThan(10_000)
    expect(paidProposalTools(source)).toContain('enrich_contact')
  })

  it('sait dire NON — une branche à 2 crédits est attrapée', () => {
    const fake =
      'if name == "outil_a":\n    return {"cost_credits": 0}\nif name == "outil_b":\n    return {"cost_credits": 2}\n'
    expect(paidProposalTools(fake)).toEqual(['outil_b'])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — les propositions à 0 crédit restent libres', () => {
    const source = chatToolsSource()
    expect(paidProposalTools(source)).not.toContain('prepare_message_for_contact')
    expect(paidProposalTools(source)).not.toContain('find_accounts')
  })

  it('aucune commande du catalogue n’appelle un outil qui propose un geste payant', () => {
    const paid = paidProposalTools(chatToolsSource())
    const offenders = COMMAND_CATALOG.flatMap(command =>
      command.tools.filter(tool => paid.includes(tool)).map(tool => `${command.key} → ${tool}`),
    )
    // ⚠️ Si cette liste cesse d'être vide, l'écran annonce « inclus » sur une
    // commande dont la réponse peut débiter : le coût affiché doit alors venir
    // de la ligne de la grille de CE geste, pas de `copilot_message`.
    expect(offenders).toEqual([])
  })
})
