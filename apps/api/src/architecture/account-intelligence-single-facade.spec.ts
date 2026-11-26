import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * GA-281 — #1618 — une seule façade pour croiser DataForge et la mémoire
 * marché : `AccountIntelligenceContextService`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `OrionAccountsService` (DataForge, ORION V12) et `MarketMemoryService`
 * (mémoire marché) sont deux services matures, testés séparément, et jamais
 * co-injectés nulle part — mesuré le 09/09/2026, confirmé le 10/09/2026 :
 * aucun fichier de production n'importait les deux avant #1618.
 * `accounts.controller.ts` n'importait que la mémoire marché ;
 * `OrionAccountsService` n'avait pour seul consommateur que son propre module
 * (`internal-dataforge.controller.ts`, derrière `InternalSecretGuard`).
 *
 * C'est exactement le défaut que #1618 ferme : sans point de croisement,
 * chaque écran qui voudrait les confronter (« DataForge dit Banque, la fiche
 * dit Assurance — laquelle affiche-t-on ? ») devait INVENTER sa propre règle
 * d'arbitrage. `AccountIntelligenceContextService`
 * (`modules/account-intelligence/`) est désormais ce point unique, avec la
 * hiérarchie de confiance codée dans `@bellum/contracts`
 * (`resolveAccountIntelligenceField`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun fichier de production, hors la composition de la façade elle-même
 * (`account-intelligence.module.ts` — le SEUL endroit autorisé à importer les
 * deux classes, pour les brancher chacune sur son jeton, voir son docblock),
 * n'importe à la fois `OrionAccountsService` ET `MarketMemoryService`. Un
 * écran ou un service qui le ferait recalculerait sa PROPRE règle d'arbitrage
 * à côté de la façade — exactement le défaut que #1618 ferme.
 *
 * ⚠️ Cette garde ne remplace PAS GA-07 (`module-boundaries.spec.ts`, qui
 * borne le nombre TOTAL d'imports service→service) ni GA-258
 * (`market-memory-single-source-of-truth.spec.ts`, qui borne QUI peut lire les
 * TABLES de la mémoire marché). Elle tient une règle plus étroite et
 * complémentaire : qui a le droit de voir les DEUX services à la fois.
 */

const MODULES = join(__dirname, '..', 'modules')

/** Le SEUL fichier de production autorisé à importer les deux classes — la
 *  composition de la façade, qui les branche chacune sur son jeton
 *  (`module-tokens.ts`). Voir son docblock pour la raison exacte : GA-07 est
 *  au plafond, et un `*.module.ts` est hors de SON périmètre par
 *  construction — mais rien n'empêchait, avant cette garde, qu'un DEUXIÈME
 *  fichier fasse pareil ailleurs, hors de tout jeton. */
const ALLOWED_FILES = new Set(['account-intelligence.module.ts'])

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** La fonction de détection, testée directement dans « sait dire NON » et
 *  dans les témoins de code légitime — pas seulement invoquée en boucle sur
 *  le corpus, pour qu'un désaccord entre elle et la garde se voie au bon
 *  endroit. */
function importsBothServices(source: string): boolean {
  return /\bOrionAccountsService\b/.test(source) && /\bMarketMemoryService\b/.test(source)
}

describe('GA-281 — #1618 — aucun écran ne lit DataForge et la mémoire marché directement', () => {
  const files = sourceFiles(MODULES)

  it('lit un corpus non vide, et voit bien le module de la façade', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some(file => file.includes(`${'account-intelligence'}`))).toBe(true)
  })

  it('SAIT DIRE NON — un fichier fautif qui importerait les deux services est détecté', () => {
    const fautif = `
      import { Injectable } from '@nestjs/common'
      import { OrionAccountsService } from '../dataforge/orion-accounts.service'
      import { MarketMemoryService } from '../market-memory/market-memory.service'

      @Injectable()
      export class RogueScreenService {
        constructor(
          private readonly orion: OrionAccountsService,
          private readonly marketMemory: MarketMemoryService,
        ) {}
      }
    `
    expect(importsBothServices(stripComments(fautif))).toBe(true)
  })

  it("n'attrape pas ce qu'elle ne vise pas — trois témoins de code légitime", () => {
    // Témoin 1 : `accounts.controller.ts` lit la mémoire marché SEULE.
    const accountsController = stripComments(readFileSync(join(MODULES, 'accounts', 'accounts.controller.ts'), 'utf8'))
    expect(accountsController.includes('MarketMemoryService')).toBe(true)
    expect(importsBothServices(accountsController)).toBe(false)

    // Témoin 2 : le contrôleur interne DataForge lit `OrionAccountsService`
    // SEUL (derrière `InternalSecretGuard`, voir GA-37) — jamais la mémoire
    // marché, qui n'a rien à faire dans un écran de couverture du pack.
    const internalDataforge = stripComments(
      readFileSync(join(MODULES, 'dataforge', 'internal-dataforge.controller.ts'), 'utf8'),
    )
    expect(internalDataforge.includes('OrionAccountsService')).toBe(true)
    expect(importsBothServices(internalDataforge)).toBe(false)

    // Témoin 3 : un commentaire qui NOMME les deux services (comme celui de
    // cette garde) ne doit pas se faire piéger par sa propre justification.
    const commentaireSeul = `// ne jamais faire comme OrionAccountsService + MarketMemoryService dans le même fichier`
    expect(importsBothServices(stripComments(commentaireSeul))).toBe(false)
  })

  it('la façade elle-même (le service, pas sa composition) ne les importe PAS directement — le jeton, jamais l’import', () => {
    const facadeService = stripComments(
      readFileSync(join(MODULES, 'account-intelligence', 'account-intelligence-context.service.ts'), 'utf8'),
    )
    expect(facadeService.includes('OrionAccountsService')).toBe(false)
    expect(facadeService.includes('MarketMemoryService')).toBe(false)

    const moduleTokens = stripComments(readFileSync(join(MODULES, 'account-intelligence', 'module-tokens.ts'), 'utf8'))
    expect(moduleTokens.includes('OrionAccountsService')).toBe(false)
    expect(moduleTokens.includes('MarketMemoryService')).toBe(false)
  })

  it('AUCUN fichier hors de la composition de la façade ne lit les deux services', () => {
    const offenders = files
      .filter(file => !ALLOWED_FILES.has(basename(file)))
      .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
      .filter(({ source }) => importsBothServices(source))
      .map(({ file }) => file.slice(file.indexOf('modules')))

    // ⚠️ Si cette liste cesse d'être vide : le croisement doit passer par
    // `AccountIntelligenceContextService` (`contextFor`), pas par un import
    // direct des deux services — c'est exactement ce que #1618 ferme.
    expect(offenders.sort()).toEqual([])
  })

  it('la composition de la façade, elle, importe bien les deux — la garde n’exclut pas un fichier vide', () => {
    const facadeModule = stripComments(
      readFileSync(join(MODULES, 'account-intelligence', 'account-intelligence.module.ts'), 'utf8'),
    )
    expect(importsBothServices(facadeModule)).toBe(true)
  })
})
