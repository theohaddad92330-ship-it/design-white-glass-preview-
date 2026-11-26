import { describe, expect, it } from 'vitest'
import { deriveWelcomeCards } from './derive-welcome-cards'

/**
 * #2091.28 — « Trois cartes maximum, ISSUES DE L'AUDIT. » `WelcomeScreen.tsx`
 * affichait « Partir d'un consultant » de façon STATIQUE, quelle que soit la
 * réponse de l'ESN à la question qui décide si cette piste la concerne —
 * vérifié : `git grep 'quelle carte pour quel audit'` = 0 résultat sur
 * `origin/main`.
 *
 * « Analyser un compte » reste un repli GÉNÉRIQUE (#1921.11/.12, témoin
 * ci-dessous) : rien dans l'audit ne peut la rendre hors-sujet, donc rien ne
 * la dérive. « Prioriser la semaine » (#2091.31) exige un signal de
 * PORTEFEUILLE EXISTANT (`hasAccountsToAct`, `AccountsController
 * .hasAccountsToAct`) — absent, elle ne se propose jamais ; présent, elle
 * rejoint les cartes déjà dérivées sans jamais en écarter une autre.
 */
describe('deriveWelcomeCards — dérivée de l’audit, jamais statique', () => {
  it('« analyser un compte » reste TOUJOURS présente — repli générique, jamais hors-sujet', () => {
    expect(deriveWelcomeCards({ recruitsForClients: null })).toEqual(['analyzeAccount'])
    expect(deriveWelcomeCards({ recruitsForClients: 'no' })).toEqual(['analyzeAccount'])
  })

  it('propose « positionner un consultant » SEULEMENT si l’ESN place des CDI chez ses clients (#1124)', () => {
    expect(deriveWelcomeCards({ recruitsForClients: 'yes' })).toEqual(['analyzeAccount', 'positionConsultant'])
  })

  it('ne la propose PAS quand l’ESN a explicitement répondu non', () => {
    expect(deriveWelcomeCards({ recruitsForClients: 'no' })).not.toContain('positionConsultant')
  })

  it('ne propose PAS « prioriser la semaine » sans portefeuille existant (sortie d’onboarding, par construction)', () => {
    expect(deriveWelcomeCards({ recruitsForClients: null, hasAccountsToAct: false })).toEqual(['analyzeAccount'])
    expect(deriveWelcomeCards({ recruitsForClients: null })).not.toContain('prioritizeWeek')
  })

  it('propose « prioriser la semaine » SEULEMENT si le portefeuille a déjà un compte en attente', () => {
    expect(deriveWelcomeCards({ recruitsForClients: null, hasAccountsToAct: true })).toEqual([
      'analyzeAccount',
      'prioritizeWeek',
    ])
  })

  it('TROIS CARTES MAXIMUM (#2091.28) — jamais les deux candidates à la fois, même si les deux signaux sont vrais', () => {
    expect(deriveWelcomeCards({ recruitsForClients: 'yes', hasAccountsToAct: true })).toEqual([
      'analyzeAccount',
      'positionConsultant',
    ])
  })

  // #2091.28 — la carte « analyser ce compte » est DÉRIVÉE de l'audit quand il a
  // produit des comptes à proposer ; sinon le repli générique (témoin ci-dessus).
  it('#2091.28 — « analyser » devient celle de l’AUDIT quand il a proposé des comptes', () => {
    expect(deriveWelcomeCards({ recruitsForClients: null, hasAuditSuggestions: true })).toEqual([
      'analyzeAccountFromAudit',
    ])
  })

  it('#2091.28 — sans suggestion de l’audit, le repli générique reste (jamais un compte inventé)', () => {
    expect(deriveWelcomeCards({ recruitsForClients: 'yes', hasAuditSuggestions: false })).toEqual([
      'analyzeAccount',
      'positionConsultant',
    ])
  })
})
