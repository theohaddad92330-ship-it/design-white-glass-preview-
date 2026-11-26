/**
 * #2033.9 / #2033.10 — ce que le périmètre d'autorité DÉCLARÉ change dans ce
 * que Laura PROPOSE, jamais dans ce que l'API autorise (D3, décision Louis
 * 18/09/2026).
 *
 * Les deux tests-pièges du brief :
 *  - le guard ignore la déclaration (ici : rien dans ce module ne touche à
 *    `WorkspacePermission` ni à `can()` — la fonction ne PEUT PAS élargir un
 *    droit, elle ne connaît que quatre chaînes d'échelle) ;
 *  - l'absence de réponse ne restreint rien (`undefined`/`null` → toujours
 *    dans le périmètre, jamais traité comme "je n'ai pas cette
 *    responsabilité").
 */
import { describe, expect, it } from 'vitest'
import {
  AUTHORITY_CATEGORIES,
  AUTHORITY_SCALE_CHOICES,
  isProposalWithinDeclaredAuthority,
  type DeclaredAuthorityScope,
} from './authority-scope.js'

const EMPTY_SCOPE: DeclaredAuthorityScope = {}

describe('isProposalWithinDeclaredAuthority', () => {
  it('PIÈGE 1 — une personne qui déclare tout décider seule n’obtient AUCUN droit de plus : la fonction ne rend qu’un verdict de PROPOSITION, jamais une permission', () => {
    const scope: DeclaredAuthorityScope = {
      recruitmentAccountsAuthority: 'Je décide seul',
      staffingAuthority: 'Je décide seul',
      marginBillingAuthority: 'Je décide seul',
      inviteAuthority: 'Je décide seul',
    }
    for (const category of AUTHORITY_CATEGORIES) {
      const result = isProposalWithinDeclaredAuthority(category, scope)
      expect(result.withinScope).toBe(true)
      // La forme du résultat ne porte ni permission, ni rôle, ni matrice —
      // rien qu'un guard pourrait lire comme un droit élargi.
      expect(result).not.toHaveProperty('permission')
      expect(result).not.toHaveProperty('role')
    }
  })

  it('PIÈGE 2 — périmètre NON renseigné : Laura propose tout, l’absence n’est jamais un refus (GA-18/GA-19)', () => {
    for (const category of AUTHORITY_CATEGORIES) {
      const result = isProposalWithinDeclaredAuthority(category, EMPTY_SCOPE)
      expect(result.withinScope).toBe(true)
      expect(result.declineReasonFr).toBeUndefined()
    }
  })

  it('#2033.9 — "Je n’ai pas cette responsabilité" fait sortir la proposition du périmètre, ET LE DIT', () => {
    const scope: DeclaredAuthorityScope = { staffingAuthority: AUTHORITY_SCALE_CHOICES[2] }
    const result = isProposalWithinDeclaredAuthority('staffing', scope)
    expect(result.withinScope).toBe(false)
    expect(result.declineReasonFr).toMatch(/tu m'as dit/i)
  })

  it('#2033.10 — "directeur" ne se lit jamais comme un accès à toutes les données : une réponse hors catalogue ne bloque rien par prudence, elle est ignorée comme non déclarée', () => {
    const scope: DeclaredAuthorityScope = { marginBillingAuthority: 'Directeur' }
    const result = isProposalWithinDeclaredAuthority('margin_billing', scope)
    expect(result.withinScope).toBe(true)
  })

  it('"Je dois faire valider" reste dans le périmètre proposé, avec une réserve nommée', () => {
    const scope: DeclaredAuthorityScope = { recruitmentAccountsAuthority: AUTHORITY_SCALE_CHOICES[1] }
    const result = isProposalWithinDeclaredAuthority('recruitment_accounts', scope)
    expect(result.withinScope).toBe(true)
    expect(result.cautionReasonFr).toBeTruthy()
  })
})
