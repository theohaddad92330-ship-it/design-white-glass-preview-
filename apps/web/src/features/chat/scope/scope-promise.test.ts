import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1910.2 — « TOUT MON ESPACE » : LA PROMESSE DIT CE QUI EST LU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST RÉELLEMENT LU, ET OÙ ON PEUT LE VÉRIFIER
 * ─────────────────────────────────────────────────────────────────────────────
 * La portée large ne lit pas « mes » comptes. Elle lit ceux de l'ESPACE :
 *
 *   `apps/api/src/modules/ia-proxy/chat-context.service.ts` — « No active/named
 *   account → give the copilote the workspace portfolio »
 *     → `buildAccountsSummary(workspaceId, …)`
 *     → `AccountsService.listAccountsDigest(workspaceId)`
 *     → `WHERE account.workspace_id = $1` — AUCUN filtre par `user_id`.
 *
 * Sur un espace d'une seule personne, « mon portefeuille » et « mon espace »
 * désignent les mêmes comptes et la nuance ne se voit pas. Sur une ESN de
 * quatre commerciaux, « Laura lira tout ton portefeuille : tes comptes » est
 * FAUX — elle lit aussi ceux des collègues. C'est exactement le défaut #1779,
 * arbitré le 09/09/2026 : le comportement RESTE, la PROMESSE change.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE TIENT, ET CE QU'ELLE NE TIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit les DEUX langues — une promesse corrigée dans une seule est une
 * promesse fausse pour l'autre moitié des lecteurs — et elle vise les phrases
 * du bloc `scope`, celles qui décrivent ce que Laura lira.
 *
 * Elle ne vise PAS le mot « portefeuille » partout dans le produit : il est
 * juste là où il désigne un périmètre de travail choisi (`/accounts`,
 * `/consultants`, le filtre « tout le portefeuille » d'un écran de liste). Le
 * témoin ci-dessous le prouve.
 */

const LOCALES = join(__dirname, '..', '..', '..', 'i18n', 'locales')

type Dict = Record<string, unknown>

function chat(locale: 'fr' | 'en'): Dict {
  return JSON.parse(readFileSync(join(LOCALES, locale, 'chat.json'), 'utf8')) as Dict
}

function at(dict: Dict, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict)
}

/** Toutes les chaînes du bloc `scope`, aplaties, avec leur chemin. */
function scopeStrings(dict: Dict): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = []
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.push({ path, value: node })
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Dict)) walk(child, path ? `${path}.${key}` : key)
    }
  }
  walk(at(dict, ['scope']), 'scope')
  return out
}

/**
 * Une promesse qui RÉTRÉCIT ce qui est lu à la personne qui lit.
 *
 * Le possessif est le cœur du défaut, pas le mot « portefeuille » : « ton
 * portefeuille » et « tes comptes » disent « les tiens, pas ceux des autres »,
 * alors que la requête ne connaît pas de `user_id`.
 */
const PERSONAL_PROMISE =
  /\b(mon|ton|votre|son)\s+portefeuille\b|\btes\s+comptes\b|\byour\s+(whole\s+)?portfolio\b|\byour\s+accounts\b/i

describe('#1910.2 — la portée large promet l’ESPACE, jamais un portefeuille personnel', () => {
  const fr = scopeStrings(chat('fr'))
  const en = scopeStrings(chat('en'))

  it('LIT quelque chose — les deux langues portent bien les phrases de portée', () => {
    expect(fr.length).toBeGreaterThan(30)
    expect(en.length).toBeGreaterThan(30)
    // …et le corpus contient bien les trois clés que ce point corrige.
    for (const corpus of [fr, en]) {
      const paths = corpus.map(entry => entry.path)
      expect(paths).toContain('scope.portfolio')
      expect(paths).toContain('scope.dialog.effectPortfolio')
      expect(paths.some(path => path.startsWith('scope.portfolioWithCount'))).toBe(true)
    }
  })

  it('aucune phrase de portée ne promet « tes comptes » ni « ton portefeuille »', () => {
    const guilty = [...fr, ...en].filter(entry => PERSONAL_PROMISE.test(entry.value))
    expect(guilty.map(entry => `${entry.path} — ${entry.value}`)).toEqual([])
  })

  it('la portée large NOMME l’espace, dans les deux langues', () => {
    expect(at(chat('fr'), ['scope', 'portfolio'])).toMatch(/espace/i)
    expect(at(chat('en'), ['scope', 'portfolio'])).toMatch(/workspace/i)
    expect(at(chat('fr'), ['scope', 'dialog', 'effectPortfolio'])).toMatch(/espace/i)
    expect(at(chat('en'), ['scope', 'dialog', 'effectPortfolio'])).toMatch(/workspace/i)
  })

  it('sait dire NON — la phrase d’avant, mot pour mot, est refusée', () => {
    expect(PERSONAL_PROMISE.test('Laura lira tout ton portefeuille : tes comptes, leurs contacts.')).toBe(true)
    expect(PERSONAL_PROMISE.test('Laura will read your whole portfolio: your accounts, their contacts.')).toBe(true)
    expect(PERSONAL_PROMISE.test('Tout mon portefeuille')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — le portefeuille comme périmètre de TRAVAIL', () => {
    // Un filtre de liste qui dit « tout le portefeuille » ne promet rien sur ce
    // que Laura lit : il nomme un périmètre que la personne CHOISIT à l'écran.
    expect(PERSONAL_PROMISE.test('Tout le portefeuille')).toBe(false)
    expect(PERSONAL_PROMISE.test('Whole portfolio')).toBe(false)
    expect(PERSONAL_PROMISE.test('Les comptes de ton espace restent lisibles')).toBe(false)
  })
})
