import { describe, expect, it } from 'vitest'
import {
  NO_ACCOUNT_SCOPE,
  PORTFOLIO_SCOPE,
  STRICT_NO_DATA_SCOPE,
  accountState,
  activeAccountCount,
  filterScopeAccounts,
  isSameScope,
  isStrictScope,
  scopeAccount,
  scopeAccountId,
  scopeAccountsFrom,
  scopeFromAccountId,
} from './chat-scope'

const analysed = {
  id: 'a1',
  company_name: 'LATÉCOÈRE',
  priority_score: 72,
  status: 'completed',
  commercial_status: 'watching',
  last_analyzed_at: '2026-08-01T10:00:00Z',
}

describe('accountState — ce qui est mesuré, et rien de plus', () => {
  it('un compte jamais analysé le DIT — Laura n’a rien à lire dessus', () => {
    expect(accountState({ id: 'x', status: 'draft', last_analyzed_at: null })).toEqual({ kind: 'never_analysed' })
  })

  it('l’analyse en cours passe devant tout le reste', () => {
    expect(accountState({ ...analysed, status: 'pending', signal_preview: { label: 'Levée de fonds' } })).toEqual({
      kind: 'analysing',
    })
  })

  it('un signal réel s’affiche tel quel — jamais un compteur inventé', () => {
    expect(accountState({ ...analysed, signal_preview: { label: 'Recrute 12 ingénieurs' } })).toEqual({
      kind: 'signal',
      label: 'Recrute 12 ingénieurs',
    })
  })

  it('un signal VIDE n’est pas un signal', () => {
    expect(accountState({ ...analysed, signal_preview: { label: '   ' } })).toBeNull()
  })

  it('rien de mesurable rend null — le compte s’affiche seul, ce qui est vrai', () => {
    expect(accountState(analysed)).toBeNull()
  })

  it('un compte analysé SANS date d’analyse n’est pas déclaré « jamais analysé »', () => {
    // `status: completed` suffit : des projections anciennes ne portent pas la date.
    expect(accountState({ id: 'x', status: 'completed' })).toBeNull()
  })
})

describe('scopeAccountsFrom — la projection', () => {
  it('un score absent reste null — JAMAIS 0', () => {
    const [account] = scopeAccountsFrom([{ id: 'a1', priority_score: null }])
    expect(account?.priorityScore).toBeNull()
  })

  it('un score de 0 est une vraie mesure et se garde', () => {
    const [account] = scopeAccountsFrom([{ id: 'a1', priority_score: 0 }])
    expect(account?.priorityScore).toBe(0)
  })

  it('compte les conversations, et rend 0 pour un compte qui n’en a aucune', () => {
    const accounts = scopeAccountsFrom([{ id: 'a1' }, { id: 'a2' }], { a1: 3 })
    expect(accounts.map(a => a.conversationCount)).toEqual([3, 0])
  })

  it('la taille du portefeuille est ce que Laura LIT, pas ce qu’on a marqué', () => {
    // Mesuré en production le 26/08 : dix-sept comptes analysés, ZÉRO
    // `commercial_status`. L'en-tête annonçait « 0 compte actif » sur un
    // portefeuille de dix-sept — un zéro juste qui dit le contraire du vrai.
    const accounts = scopeAccountsFrom([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }])
    expect(activeAccountCount(accounts)).toBe(0)
    // Le nombre montré vient du SERVEUR (`pagination.totalItems`), pas d'ici :
    // ce compteur-ci ne voit que la page chargée. Voir `ScopeButton`.
    expect(accounts).toHaveLength(3)
  })

  it('« actif » veut dire SUIVI, et suit la liste du rafraîchissement de veille', () => {
    const accounts = scopeAccountsFrom([
      { id: 'a1', commercial_status: 'watching' },
      { id: 'a2', commercial_status: 'opportunity' },
      { id: 'a3', commercial_status: 'customer' },
      { id: 'a4', commercial_status: 'none' },
      { id: 'a5' },
    ])
    expect(activeAccountCount(accounts)).toBe(3)
  })
})

describe('la portée elle-même', () => {
  it('sans accountId, la portée est le portefeuille', () => {
    expect(scopeFromAccountId(null)).toEqual(PORTFOLIO_SCOPE)
    expect(scopeFromAccountId('a1')).toEqual({ kind: 'account', accountId: 'a1' })
  })

  it('portfolio et none rendent tous deux null côté API — la distinction est d’interface', () => {
    expect(scopeAccountId(PORTFOLIO_SCOPE)).toBeNull()
    expect(scopeAccountId(NO_ACCOUNT_SCOPE)).toBeNull()
    expect(scopeAccountId({ kind: 'account', accountId: 'a1' })).toBe('a1')
  })

  it('sait dire NON — portefeuille et « sans compte » ne sont PAS la même portée', () => {
    // Les deux rendent `null` côté API : si la comparaison passait par là, elles
    // se confondraient et changer de l'une à l'autre ne ferait rien à l'écran.
    expect(isSameScope(PORTFOLIO_SCOPE, NO_ACCOUNT_SCOPE)).toBe(false)
    expect(isSameScope(PORTFOLIO_SCOPE, PORTFOLIO_SCOPE)).toBe(true)
    expect(isSameScope({ kind: 'account', accountId: 'a1' }, { kind: 'account', accountId: 'a2' })).toBe(false)
  })

  it('retrouve le compte d’une portée, et rend null s’il n’est plus chargé', () => {
    const accounts = scopeAccountsFrom([analysed])
    expect(scopeAccount({ kind: 'account', accountId: 'a1' }, accounts)?.companyName).toBe('LATÉCOÈRE')
    expect(scopeAccount({ kind: 'account', accountId: 'zzz' }, accounts)).toBeNull()
    expect(scopeAccount(PORTFOLIO_SCOPE, accounts)).toBeNull()
  })
})

describe('la recherche de la modale', () => {
  const accounts = scopeAccountsFrom([analysed, { id: 'a2', company_name: 'SAFRAN' }, { id: 'a3' }])

  it('trouve sans accents et sans casse — un commercial tape « latecoere »', () => {
    expect(filterScopeAccounts(accounts, 'latecoere').map(a => a.id)).toEqual(['a1'])
    expect(filterScopeAccounts(accounts, 'LATÉCO').map(a => a.id)).toEqual(['a1'])
  })

  it('une recherche vide rend tout, et ne rend pas le tableau d’origine', () => {
    const all = filterScopeAccounts(accounts, '  ')
    expect(all).toHaveLength(3)
    expect(all).not.toBe(accounts)
  })

  it('un compte sans nom ne fait pas tomber la recherche', () => {
    expect(filterScopeAccounts(accounts, 'safran').map(a => a.id)).toEqual(['a2'])
  })
})

describe('#3772.5 — l’exclusion stricte est une portée à part', () => {
  it('« sans dossier ciblé » et « sans les données de l’espace » ne se confondent JAMAIS', () => {
    expect(isSameScope(NO_ACCOUNT_SCOPE, STRICT_NO_DATA_SCOPE)).toBe(false)
    expect(isSameScope(STRICT_NO_DATA_SCOPE, STRICT_NO_DATA_SCOPE)).toBe(true)
    expect(isSameScope(NO_ACCOUNT_SCOPE, NO_ACCOUNT_SCOPE)).toBe(true)
  })

  it('seule la portée stricte demande l’exclusion au serveur', () => {
    expect(isStrictScope(STRICT_NO_DATA_SCOPE)).toBe(true)
    expect(isStrictScope(NO_ACCOUNT_SCOPE)).toBe(false)
    expect(isStrictScope(PORTFOLIO_SCOPE)).toBe(false)
  })

  it('aucune des deux ne désigne un compte', () => {
    expect(scopeAccountId(STRICT_NO_DATA_SCOPE)).toBeNull()
  })
})
