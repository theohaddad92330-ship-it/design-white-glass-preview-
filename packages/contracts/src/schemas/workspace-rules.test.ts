import { describe, expect, it } from 'vitest'

import {
  WORKSPACE_RULE_DEFAULTS,
  effectiveBusinessUnitAccess,
  resolveWorkspaceRuleValues,
  updateWorkspaceRulesSchema,
  workspaceRuleForbids,
  workspaceRuleGestures,
  workspaceRuleRefusalMessage,
} from './workspace-rules.js'

/**
 * #2081.14 — LES RÈGLES D'ESPACE (DÉCISION Louis 19/09/2026) : posées par un
 * administrateur pour tout l'espace, elles PRIMENT sur les réglages
 * individuels. Chaque test ci-dessous sait dire NON : il rougit si la règle
 * redevient un simple défaut que le réglage individuel peut contredire.
 */
describe('#2081.14 — règles d’espace', () => {
  describe('visibilité des comptes d’une unité', () => {
    it('« partagée » : le réglage individuel décide, comme avant la règle', () => {
      expect(effectiveBusinessUnitAccess('workspace', 'sales', 'shared')).toBe('workspace')
      expect(effectiveBusinessUnitAccess('business_unit', 'sales', 'shared')).toBe('business_unit')
    })

    it('« privée » l’emporte sur un réglage individuel contraire (tout l’espace)', () => {
      for (const role of ['sales', 'sales_ops', 'member', 'viewer', 'recruiter', 'finance', 'tech_admin'] as const) {
        expect(effectiveBusinessUnitAccess('workspace', role, 'private')).toBe('business_unit')
      }
    })

    it('« privée » ne rouvre jamais un membre déjà cloisonné', () => {
      expect(effectiveBusinessUnitAccess('business_unit', 'sales', 'private')).toBe('business_unit')
      expect(effectiveBusinessUnitAccess('business_unit', 'admin', 'private')).toBe('business_unit')
    })

    it('un administrateur, qui pose la règle, garde son propre réglage', () => {
      expect(effectiveBusinessUnitAccess('workspace', 'owner', 'private')).toBe('workspace')
      expect(effectiveBusinessUnitAccess('workspace', 'admin', 'private')).toBe('workspace')
    })

    it('un rôle INCONNU (pas membre) n’est jamais exempté', () => {
      expect(effectiveBusinessUnitAccess('workspace', null, 'private')).toBe('business_unit')
    })
  })

  describe('qui peut exporter — la SORTIE de données, et rien d’autre (décision Louis 19/09/2026)', () => {
    it('« tous » ne retire rien', () => {
      expect(workspaceRuleForbids({ exportPolicy: 'everyone' }, 'sales', 'data_exit')).toBeNull()
    })

    it('« administrateurs » retire la sortie de données à tout autre siège, même accordée en propre', () => {
      for (const role of ['sales', 'sales_ops', 'member', 'viewer', 'recruiter', 'finance', 'tech_admin'] as const) {
        expect(workspaceRuleForbids({ exportPolicy: 'admins' }, role, 'data_exit')).toBe('exportPolicy')
      }
    })

    it('« administrateurs » laisse passer propriétaire et administrateur', () => {
      expect(workspaceRuleForbids({ exportPolicy: 'admins' }, 'owner', 'data_exit')).toBeNull()
      expect(workspaceRuleForbids({ exportPolicy: 'admins' }, 'admin', 'data_exit')).toBeNull()
    })

    it('un rôle INCONNU (pas membre) n’est jamais exempté', () => {
      expect(workspaceRuleForbids({ exportPolicy: 'admins' }, null, 'data_exit')).toBe('exportPolicy')
    })

    // #2081.14 — la règle s’appuyait sur la PERMISSION `data:export`, qui garde
    // aussi l’import, les liens de partage, l’envoi à signature, l’explication
    // de matching et le versement des appels au CRM. Elle les fermait tous.
    // Resserrée : une permission, même `data:export`, n’est pas un geste que
    // la règle gouverne — seule la sortie de données l’est.
    it('ne gouverne QUE la sortie de données : aucune permission, même data:export, ne s’y confond', () => {
      expect(workspaceRuleGestures).toEqual(['data_exit'])
      for (const permission of ['data:export', 'records:write', 'crm:read', 'messages:send'] as const) {
        expect(workspaceRuleForbids({ exportPolicy: 'admins' }, 'sales', permission as never)).toBeNull()
      }
    })

    it('le refus NOMME la règle d’espace', () => {
      expect(workspaceRuleRefusalMessage('exportPolicy')).toMatch(/^Réservé par la règle d’espace : /)
    })
  })

  describe('lecture de la ligne', () => {
    it('aucune ligne = les valeurs par défaut, qui sont le comportement d’avant', () => {
      expect(resolveWorkspaceRuleValues(null)).toEqual(WORKSPACE_RULE_DEFAULTS)
      expect(WORKSPACE_RULE_DEFAULTS).toEqual({ businessUnitAccountsVisibility: 'shared', exportPolicy: 'everyone' })
    })

    it('une valeur illisible se lit RESTRICTIVE, jamais ouverte', () => {
      expect(
        resolveWorkspaceRuleValues({ business_unit_accounts_visibility: 'nimporte', export_policy: 'quoi' }),
      ).toEqual({ businessUnitAccountsVisibility: 'private', exportPolicy: 'admins' })
    })

    it('une ligne lisible rend ses valeurs', () => {
      expect(
        resolveWorkspaceRuleValues({ business_unit_accounts_visibility: 'private', export_policy: 'everyone' }),
      ).toEqual({ businessUnitAccountsVisibility: 'private', exportPolicy: 'everyone' })
    })
  })

  describe('corps du PATCH', () => {
    it('refuse un corps vide et un champ inconnu (pas d’affectation de masse)', () => {
      expect(updateWorkspaceRulesSchema.safeParse({}).success).toBe(false)
      expect(updateWorkspaceRulesSchema.safeParse({ exportPolicy: 'admins', role: 'owner' }).success).toBe(false)
      expect(updateWorkspaceRulesSchema.safeParse({ exportPolicy: 'personne' }).success).toBe(false)
    })

    it('accepte une règle seule', () => {
      expect(updateWorkspaceRulesSchema.parse({ exportPolicy: 'admins' })).toEqual({ exportPolicy: 'admins' })
    })
  })
})
