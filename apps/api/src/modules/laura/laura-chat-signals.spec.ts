import { workspaceRoleValues, type WorkspaceRole } from '@bellum/contracts'
import { briefingReadingOf } from '../briefing/briefing-role-order'
import { DETECTABLE_KEYS, detectInterventions, countsNeededForScreen, type DetectionCounts } from './laura-detector'
import { CHAT_SCREEN, CHAT_SIGNAL_KEYS, chatSignalOrder, orderChatCandidates } from './laura-chat-signals'

// #3398 (V02, recette prod 01/10) — Laura parle sur /chat, et le rôle change
// l'ORDRE des signaux, jamais leur ensemble (c76_role_reordonne_jamais_ne_filtre).

const READINGS = [...new Set(workspaceRoleValues.map(role => briefingReadingOf(role as WorkspaceRole)))]

describe('#3398 — les signaux de /chat suivent le rôle', () => {
  it('chaque signal est une intervention du catalogue ET détectable', () => {
    for (const key of CHAT_SIGNAL_KEYS) expect(DETECTABLE_KEYS).toContain(key)
  })

  it('l’ordre de chaque lecture est une PERMUTATION du même ensemble — jamais un filtre', () => {
    expect(READINGS.length).toBeGreaterThanOrEqual(3)
    for (const reading of READINGS) {
      expect([...chatSignalOrder(reading)].sort()).toEqual([...CHAT_SIGNAL_KEYS].sort())
    }
  })

  it('les lectures ouvrent sur des signaux DIFFÉRENTS (sait dire non : un tri identique ne sert à rien)', () => {
    const firsts = new Set(READINGS.map(reading => chatSignalOrder(reading)[0]))
    expect(firsts.size).toBeGreaterThanOrEqual(3)
  })

  it('sur /chat les détecteurs de ces signaux tirent ; ailleurs, aucun changement', () => {
    const counts = { activeMissions: 2, activeMissionsWithCost: 0 } as unknown as DetectionCounts
    const input = { health: null, blockingIssues: [], counts }
    const onChat = detectInterventions({ ...input, screen: CHAT_SCREEN } as never)
    expect(onChat).toContain('margin_not_measured')
    const onOther = detectInterventions({ ...input, screen: '/settings/unknown' } as never)
    expect(onOther).not.toContain('margin_not_measured')
    expect(countsNeededForScreen(CHAT_SCREEN)).toContain('activeMissions')
  })

  it('orderChatCandidates garde TOUTES les clés, réordonne celles de /chat, laisse les autres en fin', () => {
    const keys = ['copilot_never_used', 'long_bench', 'margin_not_measured', 'consultant_free_soon']
    const founder = orderChatCandidates(keys, 'executive')
    const recruiter = orderChatCandidates(keys, 'recruiter')
    expect([...founder].sort()).toEqual([...keys].sort())
    expect([...recruiter].sort()).toEqual([...keys].sort())
    expect(founder[0]).toBe('margin_not_measured')
    expect(recruiter[0]).toBe('consultant_free_soon')
    expect(founder.at(-1)).toBe('copilot_never_used')
  })
})

describe('#3398 (lot F3) — « missions à risque » sur /chat', () => {
  const RISK = ['mission_start_not_ready']

  it('le détecteur de démarrage de mission pas prête se dit sur /chat, pour tous les rôles (c76 : même ensemble)', () => {
    for (const key of RISK) expect(CHAT_SIGNAL_KEYS).toContain(key)
    expect(countsNeededForScreen(CHAT_SCREEN)).toContain('missionsStartingSoonNotReady')
  })

  it('le manager lit une mission à risque avant la marge ; le recruteur avant les besoins', () => {
    const manager = chatSignalOrder('manager')
    expect(manager.indexOf('mission_start_not_ready')).toBeLessThan(manager.indexOf('margin_not_measured'))
    const recruiter = chatSignalOrder('recruiter')
    expect(recruiter.indexOf('mission_start_not_ready')).toBeLessThan(recruiter.indexOf('need_open_without_shortlist'))
  })
})

describe('#3398 (lot F27) — les signaux de rôle neufs ont chacun leur lecture', () => {
  const NEW = ['accounts_without_owner', 'account_collisions', 'portfolio_too_wide', 'consultant_to_requalify']

  it('sont servis sur /chat pour TOUS les rôles (c76 : ordre, jamais filtre) et leurs mesures sont lues', () => {
    for (const key of NEW) expect(CHAT_SIGNAL_KEYS).toContain(key)
    const needed = countsNeededForScreen(CHAT_SCREEN)
    for (const count of ['accountsWithoutOwner', 'accountsActedOnBySeveralPeople', 'myActiveAccounts'])
      expect(needed).toContain(count)
  })

  it('le manager lit « sans responsable » avant le portefeuille ; le commercial lit son portefeuille avant les comptes libres', () => {
    const manager = chatSignalOrder('manager')
    expect(manager.indexOf('accounts_without_owner')).toBeLessThan(manager.indexOf('portfolio_too_wide'))
    const sales = chatSignalOrder('sales')
    expect(sales.indexOf('portfolio_too_wide')).toBeLessThan(sales.indexOf('accounts_without_owner'))
    const recruiter = chatSignalOrder('recruiter')
    expect(recruiter.indexOf('consultant_to_requalify')).toBeLessThan(recruiter.indexOf('accounts_without_owner'))
  })
})

describe('#2875/#3398 (lot B3 15/10) — « forecast fondateur » sur /chat', () => {
  it('est servi sur /chat pour TOUS les rôles (c76) et sa mesure — un COUNT — est lue', () => {
    expect(CHAT_SIGNAL_KEYS).toContain('forecast_revenue_declared_blocked')
    expect(countsNeededForScreen(CHAT_SCREEN)).toContain('forecastDeclaredBlockedMissions')
  })
})

describe('#2875/#3398 (lot T06 08/10) — « entretien à préparer » sur /chat', () => {
  it('est servi sur /chat pour TOUS les rôles (c76 : ordre, jamais filtre) et sa mesure est lue', () => {
    expect(CHAT_SIGNAL_KEYS).toContain('interview_brief_not_consulted')
    expect(countsNeededForScreen(CHAT_SCREEN)).toContain('interviewsAwaitingBrief')
  })

  it('le recruteur (BM) lit l’entretien à préparer avant les comptes ; le commercial le lit en dernier', () => {
    const recruiter = chatSignalOrder('recruiter')
    expect(recruiter.indexOf('interview_brief_not_consulted')).toBeLessThan(recruiter.indexOf('accounts_without_owner'))
    const sales = chatSignalOrder('sales')
    expect(sales.at(-1)).toBe('interview_brief_not_consulted')
  })
})
