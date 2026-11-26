import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { McpScopeGuard } from './mcp-scope.guard'

function context(request: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function build(required: string | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) }
  return new McpScopeGuard(reflector as never)
}

describe('McpScopeGuard', () => {
  it('laisse passer une route non annotée sans lire req.user', () => {
    const guard = build(undefined)
    expect(guard.canActivate(context({}))).toBe(true)
  })

  it('laisse passer une session navigateur (JwtStrategy — pas de clé scope du tout)', () => {
    const guard = build('mcp:analysis')
    // JwtStrategy#validate ne renvoie JAMAIS de clé `scope` — c'est la forme réelle
    // d'une session Supabase derrière ApiAuthGuard.
    expect(guard.canActivate(context({ user: { userId: 'u-1', email: 'rep@esn.fr' } }))).toBe(true)
  })

  it('refuse un principal MCP dont le scope accordé ne contient pas le scope requis', () => {
    const guard = build('mcp:analysis')
    expect(() => guard.canActivate(context({ user: { userId: 'u-1', email: 'x', scope: 'mcp:read' } }))).toThrow(
      ForbiddenException,
    )
  })

  it('refuse un principal MCP dont le jeton ne porte AUCUNE claim scope (normalisée à la chaîne vide)', () => {
    const guard = build('mcp:analysis')
    // Ce que McpOAuthStrategy#validate produit réellement pour un jeton sans
    // claim `scope` : `payload.scope || ''` → la clé est présente, vide.
    expect(() => guard.canActivate(context({ user: { userId: 'u-1', email: 'x', scope: '' } }))).toThrow(
      ForbiddenException,
    )
  })

  it('⚠️ épingle le défaut fail-open : un principal MCP dont scope vaut littéralement `undefined` (la clé existe) est REFUSÉ, pas laissé passer', () => {
    // Avant le correctif, `if (scope === undefined) return true` traitait CE cas
    // exactement comme une session navigateur : bypass total du scope requis.
    // Un objet littéral qui DÉCLARE `scope: undefined` porte toujours la clé —
    // c'est le marqueur positif (`'scope' in user`) que le nouveau guard lit.
    const guard = build('mcp:analysis')
    const mcpPrincipalWithUndefinedScope = { userId: 'u-1', email: 'x', scope: undefined }
    expect('scope' in mcpPrincipalWithUndefinedScope).toBe(true) // la clé existe bien
    expect(() => guard.canActivate(context({ user: mcpPrincipalWithUndefinedScope }))).toThrow(ForbiddenException)
  })

  it('laisse passer un principal MCP qui porte bien le scope requis', () => {
    const guard = build('mcp:analysis')
    expect(guard.canActivate(context({ user: { userId: 'u-1', email: 'x', scope: 'mcp:read mcp:analysis' } }))).toBe(
      true,
    )
  })

  it("refuse par prudence quand il n'y a aucun principal du tout (ne devrait jamais arriver après ApiAuthGuard)", () => {
    const guard = build('mcp:analysis')
    expect(() => guard.canActivate(context({}))).toThrow(ForbiddenException)
  })
})
