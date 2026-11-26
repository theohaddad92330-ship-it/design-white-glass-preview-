import { describe, expect, it } from 'vitest'
import type { LauncherRun } from '@bellum/contracts'
import { launcherTypeOf, runsOfType } from '@bellum/contracts'
import {
  armedRunOf,
  composerCanSubmit,
  composerDisabledReasonKey,
  composerPlaceholderKey,
  composerSubmitMode,
} from './launcher-arm'

/**
 * #2149.27 — plus aucun run du catalogue n'a `queryParam: null` depuis que
 * `territory` l'a quitté (son run pointait sur une route absente du disque,
 * puis ne faisait plus qu'ouvrir `/discover` nu, doctrine #2486). Le
 * COMPORTEMENT « pas de saisie clavier » reste une règle du type
 * `LauncherRun`, donc encore à garder — via un run FABRIQUÉ plutôt que puisé
 * au catalogue, pour ne plus dépendre d'une entrée retirée.
 */
const NO_KEYBOARD_RUN: LauncherRun = {
  key: 'test.no-keyboard',
  labelKey: 'run.accountAnalysis',
  action: 'account_analysis',
  billedOnSuccessOnly: false,
  to: '/discover',
  queryParam: null,
}

/**
 * Ce que ces tests gardent : le composer ne peut pas mentir sur ce que fera le
 * prochain clic. C'est la seule partie du déplacement qui puisse coûter un
 * crédit à quelqu'un — le reste est de la mise en page.
 */

describe('armedRunOf', () => {
  it("n'arme rien tant qu'aucun type n'est choisi — la voie Laura est le défaut", () => {
    expect(armedRunOf(null, null)).toBeNull()
    expect(armedRunOf(null, 'account.analysis')).toBeNull()
  })

  it('arme le PREMIER run du type quand aucun run n’est choisi', () => {
    const armed = armedRunOf('account', null)
    expect(armed?.key).toBe(runsOfType('account')[0]?.key)
  })

  it('arme le run choisi quand il appartient au type', () => {
    expect(armedRunOf('account', 'account.refresh')?.key).toBe('account.refresh')
  })

  it("retombe sur le premier run quand la clé de run n'appartient pas au type", () => {
    // Un lien collé peut porter le run d'un autre type. Armer « rien » ferait
    // un composer qui a l'air cassé après un clic sur un chip.
    expect(armedRunOf('account', 'talent.cvRewrite')?.key).toBe('account.analysis')
  })

  it("n'arme rien sur un type inconnu plutôt que de lever", () => {
    expect(armedRunOf('inconnu' as never, null)).toBeNull()
  })
})

describe('composerPlaceholderKey', () => {
  it('garde le marque-place de Laura quand rien n’est armé', () => {
    expect(composerPlaceholderKey(null, null)).toBe('composer.placeholder')
  })

  it('annonce ce qu’on doit taper quand un run est armé', () => {
    const run = armedRunOf('account', null)
    expect(composerPlaceholderKey(run, 'account')).toBe('launcher:placeholder.account')
  })

  it('garde le marque-place de Laura pour un run qui ne se tape pas au clavier', () => {
    // Un run qui se CHOISIT dans une liste : promettre une saisie qu'on
    // jetterait sans le dire est pire que pas de promesse.
    expect(composerPlaceholderKey(NO_KEYBOARD_RUN, 'account')).toBe('composer.placeholder')
  })
})

describe('composerSubmitMode', () => {
  it('envoie à Laura quand rien n’est armé', () => {
    expect(composerSubmitMode(null)).toBe('send')
  })

  it('OUVRE quand un run est armé — le lanceur n’exécute rien', () => {
    expect(composerSubmitMode(armedRunOf('account', null))).toBe('open')
  })
})

describe('composerCanSubmit', () => {
  it('refuse un message vide sur la voie Laura', () => {
    expect(composerCanSubmit(null, '   ')).toBe(false)
    expect(composerCanSubmit(null, 'bonjour')).toBe(true)
  })

  it('refuse un run qui attend un texte tant que rien n’est tapé', () => {
    expect(composerCanSubmit(armedRunOf('account', null), '  ')).toBe(false)
  })

  it('accepte un run SANS saisie clavier dès qu’il est armé', () => {
    // Sinon son bouton serait définitivement mort : il n'y a rien à taper.
    expect(composerCanSubmit(NO_KEYBOARD_RUN, '')).toBe(true)
  })
})

// #2428.19 — un bouton d'envoi désactivé se contentait d'un `disabled` nu :
// ni tooltip, ni annonce, rien qui dise POURQUOI. Deux causes possibles, deux
// clés — jamais devinées.
describe('composerDisabledReasonKey', () => {
  it('rend `null` — rien à expliquer — dès que le bouton est actionnable', () => {
    expect(composerDisabledReasonKey(null, 'bonjour', false)).toBeNull()
    expect(composerDisabledReasonKey(null, '', true)).toBeNull()
    expect(composerDisabledReasonKey(NO_KEYBOARD_RUN, '', false)).toBeNull()
  })

  it('explique la voie Laura vide — ni texte, ni connecteur choisi', () => {
    expect(composerDisabledReasonKey(null, '   ', false)).toBe('composer.sendDisabledReason')
  })

  it('explique un run armé qui attend encore un texte', () => {
    const run = armedRunOf('account', null)
    expect(composerDisabledReasonKey(run, '  ', false)).toBe('composer.openDisabledReason')
  })
})

describe('le catalogue reste la seule source du coût', () => {
  it('chaque type garde au moins un run', () => {
    // Un chip sans run produirait un composer armé qui ne peut pas partir.
    for (const key of ['account', 'contact', 'need', 'talent'] as const) {
      expect(launcherTypeOf(key)?.runs.length ?? 0).toBeGreaterThan(0)
    }
  })
})
