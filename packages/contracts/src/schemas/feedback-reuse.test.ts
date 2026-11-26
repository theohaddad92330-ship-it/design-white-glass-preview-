import { describe, expect, it } from 'vitest'
import { FEEDBACK_REUSE_SCOPES } from './offer-portfolio.js'
import {
  DEFAULT_FEEDBACK_REUSE_SCOPE,
  FEEDBACK_FREE_TEXT_COLUMNS,
  FEEDBACK_REUSE_SCOPE_COLUMN,
  FEEDBACK_ROW_TABLES,
  WORKSPACE_SCOPED_FEEDBACK_TABLES,
  mayLeaveWorkspace,
} from './feedback-reuse.js'

/**
 * La règle qui décide ce qu'un client voit du retour d'un autre client.
 *
 * Elle est testée à part, et pure, pour la même raison que
 * `community-facts.ts` : la mettre dans un service la rendrait invérifiable, et
 * c'est la seule règle du dépôt dont une erreur ne se répare pas — une
 * information qui a circulé ne se reprend pas.
 */
describe('portée de réutilisation d’un retour — le défaut', () => {
  it('est le plus FERMÉ des deux, jamais le plus ouvert', () => {
    // Un retour se réutilise sur DÉCISION, jamais par omission. Si ce test
    // tombe parce que quelqu'un a changé le défaut, la question à poser est :
    // « qui a dit oui ? » — et personne n'aura pu le dire, puisque le défaut
    // s'applique justement à ceux qui n'ont rien dit.
    expect(DEFAULT_FEEDBACK_REUSE_SCOPE).toBe('tenant_private')
    expect(FEEDBACK_REUSE_SCOPES[0]).toBe(DEFAULT_FEEDBACK_REUSE_SCOPE)
  })

  it('vit dans l’énumération fermée du portefeuille — pas dans une seconde', () => {
    // Deux vocabulaires pour la même question divergent au premier ajout.
    expect(FEEDBACK_REUSE_SCOPES).toContain(DEFAULT_FEEDBACK_REUSE_SCOPE)
    expect(FEEDBACK_REUSE_SCOPES).toHaveLength(2)
  })
})

describe('portée de réutilisation d’un retour — ce qui peut sortir', () => {
  it('AUCUNE portée ne laisse sortir le verbatim', () => {
    // C'est l'asymétrie qui porte l'invariant : `generalized_only` autorise le
    // MOTIF anonymisé, jamais la phrase qui l'a inspiré. Un verbatim de client
    // décrit une stratégie — des zones, des seuils, des cibles — c'est-à-dire
    // ce qui distingue une ESN de ses concurrentes.
    for (const scope of FEEDBACK_REUSE_SCOPES) {
      expect(mayLeaveWorkspace(scope, 'verbatim')).toBe(false)
    }
  })

  it('`tenant_private` ne laisse RIEN sortir, pas même une généralisation', () => {
    expect(mayLeaveWorkspace('tenant_private', 'generalized')).toBe(false)
    expect(mayLeaveWorkspace('tenant_private', 'verbatim')).toBe(false)
  })

  it('`generalized_only` ne laisse sortir QUE la généralisation', () => {
    expect(mayLeaveWorkspace('generalized_only', 'generalized')).toBe(true)
    expect(mayLeaveWorkspace('generalized_only', 'verbatim')).toBe(false)
  })
})

describe('portée de réutilisation d’un retour — les listes que la garde consomme', () => {
  it('nomme les tables qui STOCKENT un retour, et la colonne qui porte la portée', () => {
    expect(FEEDBACK_ROW_TABLES.length).toBeGreaterThanOrEqual(3)
    expect(FEEDBACK_REUSE_SCOPE_COLUMN).toBe('reuse_scope')
  })

  it('les tables scopées à un espace sont un SOUS-ENSEMBLE des tables de retour', () => {
    // `beta_feedback` est la troisième : elle porte la même portée et n'a pas de
    // `workspace_id`, donc elle ne relève pas de la règle de lecture — seulement
    // de la règle de schéma. Les confondre ferait crier la garde sur du code
    // correct, et une garde qui crie sur du code correct finit désactivée.
    for (const table of WORKSPACE_SCOPED_FEEDBACK_TABLES) {
      expect(FEEDBACK_ROW_TABLES as readonly string[]).toContain(table)
    }
    expect(WORKSPACE_SCOPED_FEEDBACK_TABLES.length).toBeLessThan(FEEDBACK_ROW_TABLES.length)
  })

  it('nomme le texte écrit par un humain — la seule chose qui ne doit jamais voyager', () => {
    expect(FEEDBACK_FREE_TEXT_COLUMNS).toContain('verbatim')
    expect(FEEDBACK_FREE_TEXT_COLUMNS).toContain('note')
    expect(FEEDBACK_FREE_TEXT_COLUMNS).toContain('message')
  })
})
