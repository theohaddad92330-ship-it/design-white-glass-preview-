import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_ROW_ACTION_KEYS,
  accountFavoriteLabelKey,
  buildAccountRowActions,
  type AccountRowActionHandlers,
} from './accountRowActions'

/**
 * LES SEPT ACTIONS DE LIGNE VIVAIENT AU CLIC DROIT, ET NULLE PART AILLEURS.
 *
 * Le dépôt le savait déjà à moitié : le commentaire d'`AccountTableRow` constate
 * pour la SEULE « Demander à Laura » qu'« un commercial ne fait pas de clic
 * droit, la fonction était donc livrée et introuvable ». Le constat n'avait
 * jamais été appliqué aux six autres — Partager, Relancer, Déplacer vers,
 * Rattacher, Archiver, Supprimer.
 *
 * Sortir les actions du clic droit veut dire les rendre DEUX fois : dans le menu
 * contextuel (qu'on garde — on ajoute une porte, on n'en ferme pas) et dans le
 * « … » de fin de ligne. Deux rendus, une seule LISTE : ce fichier tient la
 * liste, pour qu'une action ajoutée d'un côté ne puisse pas manquer de l'autre.
 */

function handlers(): AccountRowActionHandlers {
  return {
    onOpen: vi.fn(),
    onShare: vi.fn(),
    onRelaunch: vi.fn(),
    onAskCopilot: vi.fn(),
    onSetNextAction: vi.fn(),
    onSleep: vi.fn(),
    onAbsorb: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
  }
}

describe('buildAccountRowActions — la liste des gestes de ligne, écrite une fois', () => {
  // #2150.21/.22/.25/.26 — « agir sur une ligne sans ouvrir le dossier » : les
  // quatre gestes du portefeuille rejoignent la liste, et « Ouvrir le dossier »
  // devient un geste NOMMÉ en tête (la ligne cliquable ne se voit pas au doigt).
  it('rend les ONZE actions, dans l’ordre du pipe', () => {
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, handlers())
    expect(actions.map(a => a.key)).toEqual([
      'open',
      'share',
      'relaunch',
      'askCopilot',
      'nextAction',
      'assign',
      'moveTo',
      'sleep',
      'absorb',
      'archive',
      'delete',
    ])
  })

  it('le corpus n’est pas vide — onze clés déclarées, onze rendues', () => {
    expect(ACCOUNT_ROW_ACTION_KEYS).toHaveLength(11)
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, handlers())
    expect(actions).toHaveLength(ACCOUNT_ROW_ACTION_KEYS.length)
  })

  it('appelle le gestionnaire que sa clé désigne, et lui seul', () => {
    const h = handlers()
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, h)
    for (const action of actions) {
      if (action.kind !== 'item') continue
      action.run()
    }
    expect(h.onOpen).toHaveBeenCalledTimes(1)
    expect(h.onSetNextAction).toHaveBeenCalledTimes(1)
    expect(h.onSleep).toHaveBeenCalledTimes(1)
    expect(h.onShare).toHaveBeenCalledTimes(1)
    expect(h.onRelaunch).toHaveBeenCalledTimes(1)
    expect(h.onAskCopilot).toHaveBeenCalledTimes(1)
    expect(h.onAbsorb).toHaveBeenCalledTimes(1)
    expect(h.onArchive).toHaveBeenCalledTimes(1)
    expect(h.onDelete).toHaveBeenCalledTimes(1)
  })

  it('un compte DÉJÀ archivé ne se ré-archive ni ne se rattache', () => {
    const actions = buildAccountRowActions({ status: 'archived', isArchiving: false }, handlers())
    const byKey = new Map(actions.map(a => [a.key, a]))
    expect(byKey.get('archive')).toMatchObject({ disabled: true })
    expect(byKey.get('absorb')).toMatchObject({ disabled: true })
    // Les autres restent offertes : un compte archivé se partage, se relance,
    // se relit avec Laura — l'archivage n'est pas une suppression.
    expect(byKey.get('share')).toMatchObject({ disabled: false })
    expect(byKey.get('relaunch')).toMatchObject({ disabled: false })
    expect(byKey.get('delete')).toMatchObject({ disabled: false })
  })

  // #4053.9 (recette prod 14/10) — « Archiver le compte » grisé sur un compte listé « À trier » : l'état
  // d'ANALYSE disait `archived` (écrit par l'annulation d'un import), mais le tri COMMERCIAL, lui, n'avait
  // pas bougé — le compte restait dans la liste, sans moyen de le ranger. Archivé = les DEUX.
  it('un compte à demi archivé (analyse archivée, tri commercial « à trier ») peut encore être archivé', () => {
    const actions = buildAccountRowActions(
      { status: 'archived', isArchiving: false, commercialStatus: 'inbox' },
      handlers(),
    )
    expect(actions.find(a => a.key === 'archive')).toMatchObject({ disabled: false })
  })

  it('pendant l’archivage, l’entrée est grisée ET dit qu’elle travaille', () => {
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: true }, handlers())
    const archive = actions.find(a => a.key === 'archive')
    expect(archive).toMatchObject({ disabled: true, labelKey: 'list.archiving' })
  })

  it('« Supprimer » est le SEUL geste destructeur', () => {
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, handlers())
    const destructive = actions.filter(a => a.kind === 'item' && a.destructive).map(a => a.key)
    expect(destructive).toEqual(['delete'])
  })

  it('les séparations tombent avant les gestes du portefeuille et avant « Rattacher »', () => {
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, handlers())
    const separated = actions.filter(a => a.separatorBefore).map(a => a.key)
    expect(separated).toEqual(['nextAction', 'absorb'])
  })

  it('#2150.26 — un compte DÉJÀ en veille ne s’y remet pas ; les autres, si', () => {
    const watching = buildAccountRowActions(
      { status: 'completed', isArchiving: false, commercialStatus: 'watching' },
      handlers(),
    )
    expect(watching.find(a => a.key === 'sleep')).toMatchObject({ disabled: true })
    const inbox = buildAccountRowActions(
      { status: 'completed', isArchiving: false, commercialStatus: 'inbox' },
      handlers(),
    )
    expect(inbox.find(a => a.key === 'sleep')).toMatchObject({ disabled: false, labelKey: 'list.sleep' })
  })

  it('#2150.25 — « Attribuer » est un SOUS-MENU (la liste des membres), comme « Déplacer vers »', () => {
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, handlers())
    expect(actions.filter(a => a.kind === 'submenu').map(a => a.key)).toEqual(['assign', 'moveTo'])
  })

  it('chaque entrée porte une clé i18n non vide — un geste sans nom est un geste anonyme (GA-32)', () => {
    const actions = buildAccountRowActions({ status: 'completed', isArchiving: false }, handlers())
    for (const action of actions) {
      expect(action.labelKey.length).toBeGreaterThan(0)
    }
  })
})

/**
 * #2150.14/.18 — L'ÉTOILE DE LIGNE, TOUJOURS VISIBLE (pas dans ce menu, voir
 * `AccountTableRow`). Son nom accessible (GA-32) change avec l'état :
 * « Ajouter aux favoris » sur une étoile creuse, « Retirer des favoris » sur
 * une étoile pleine — jamais le même libellé dans les deux états, sinon le
 * geste ne s'annonce pas au clavier ni au lecteur d'écran.
 */
describe('accountFavoriteLabelKey — le nom accessible de l’étoile (GA-32)', () => {
  it('« Retirer des favoris » quand la ligne est DÉJÀ en favori', () => {
    expect(accountFavoriteLabelKey(true)).toBe('list.favorite.remove')
  })

  it('« Ajouter aux favoris » sinon', () => {
    expect(accountFavoriteLabelKey(false)).toBe('list.favorite.add')
  })

  it('les deux clés diffèrent — sinon le nom accessible ne change jamais', () => {
    expect(accountFavoriteLabelKey(true)).not.toBe(accountFavoriteLabelKey(false))
  })
})
