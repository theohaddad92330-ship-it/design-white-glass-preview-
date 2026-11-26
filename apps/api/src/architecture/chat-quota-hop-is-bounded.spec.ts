import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHIPPED_PLAN_CODES, SHIPPED_PLAN_GRID } from '@bellum/contracts'
import {
  PRECISION_HOP_DIVISOR,
  QUOTA_WINDOW_MS,
  chatDailyLimitOfPlan,
  countableMessages,
  effectiveChatDailyLimit,
  precisionHopCeiling,
} from '../modules/ia-proxy/chat-quota'

/**
 * GA-91 — le saut de précision est BORNÉ, deux fois, et sa dérivation vit à un
 * seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne pas compter les réponses aux questions de Laura » a une conséquence que
 * personne ne voit venir : **une conversation qui tourne en rond ne consomme
 * plus rien**. Laura demande, on répond (gratuit), Laura redemande, on répond
 * (gratuit)… Un plafond qu'on peut contourner en bouclant n'est plus un
 * plafond, et chacun de ces tours reste un appel modèle facturé.
 *
 * Deux bornes, donc, et cette garde vérifie qu'elles EXISTENT et qu'elles sont
 * LUES :
 *
 *  1. **un seul saut par fil et par fenêtre** — dans `ChatMessagesService`,
 *     qui compte les sauts déjà accordés au fil avant d'en accorder un
 *     nouveau ;
 *  2. **une part du plafond au plus** — `precisionHopCeiling`, appelé par
 *     `countableMessages`, la seule soustraction du dispositif.
 *
 * Et une troisième chose, qui est la condition des deux autres : **la fenêtre
 * vit à un seul endroit** (`QUOTA_WINDOW_MS`, loi 1 / GA-26). Deux fenêtres
 * différentes — l'une pour compter, l'autre pour exonérer — feraient diverger
 * le comptage de ce qu'il retranche, en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE QU'ELLE SAIT DIRE NON (rouge exact, 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * En retirant l'écrêtage de `countableMessages` (`const granted = Math.max(exempt, 0)`) :
 *
 *   ● GA-91 › la part du plafond › 100 « sauts » sur un plafond de 50 n'ouvrent
 *     pas le plafond en grand
 *     expect(received).toBe(expected)  Expected: 83  Received: 0
 *
 * En rendant `alreadyHopped` inopérant dans `resolvePrecisionHop`
 * (`return new Date()`) :
 *
 *   ● GA-91 › un seul saut par fil › la borne du fil est LUE avant d'accorder
 *     un saut
 *     expect(received).toMatch(expected)
 *     Expected pattern: /alreadyHopped\s*>\s*0\s*\?\s*null/
 *
 * En recopiant `24 * 60 * 60 * 1000` dans le contrôleur au lieu d'importer
 * `QUOTA_WINDOW_MS` :
 *
 *   ● GA-91 › la fenêtre vit à un seul endroit › aucune recopie de la fenêtre
 *     de 24 h dans le module du copilote
 *     expect(received).toEqual(expected)  - Array []  + Array [ … ]
 */
describe('GA-91 — le saut de précision est borné', () => {
  const IA_PROXY = join(__dirname, '..', 'modules', 'ia-proxy')

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  function read(file: string): string {
    return stripComments(readFileSync(join(IA_PROXY, file), 'utf8'))
  }

  // ── 1. La part du plafond ──────────────────────────────────────────────────

  describe('la part du plafond', () => {
    /** Plafond → ce que le dispositif accorde au plus. Corpus, pas exemple. */
    const CEILINGS: readonly (readonly [number, number])[] = [
      [50, 17],
      [30, 10],
      [10, 4],
      [3, 1],
      [1, 1],
      [0, 0],
    ]

    it('LIT un corpus non vide', () => {
      expect(CEILINGS.length).toBeGreaterThanOrEqual(6)
      expect(PRECISION_HOP_DIVISOR).toBe(3)
    })

    it.each(CEILINGS)('un plafond de %i accorde %i sauts au plus', (limit, ceiling) => {
      expect(precisionHopCeiling(limit)).toBe(ceiling)
    })

    it('100 « sauts » sur un plafond de 50 n’ouvrent pas le plafond en grand', () => {
      expect(countableMessages({ total: 100, exempt: 100, limit: 50 })).toBe(83)
    })

    it('la soustraction n’existe qu’ici — le contrôleur ne la refait pas', () => {
      const controller = read('ia-proxy.controller.ts')
      expect(controller.length).toBeGreaterThan(5000)
      expect(controller).toContain('countableMessages(')
      expect(controller).not.toMatch(/total\s*-\s*exempt|exempt\s*-\s*total/)
    })
  })

  // ── 2. Un seul saut par fil ────────────────────────────────────────────────

  describe('un seul saut par fil', () => {
    it('la borne du fil est LUE avant d’accorder un saut', () => {
      const service = read('chat-messages.service.ts')
      expect(service.length).toBeGreaterThan(3000)
      const start = service.indexOf('private async resolvePrecisionHop')
      expect(start).toBeGreaterThan(-1)
      const body = service.slice(start, service.indexOf('private latestUserMessage', start))
      expect(body).toMatch(/alreadyHopped\s*>\s*0\s*\?\s*null/)
      expect(body).toContain('quota_exempt_at: MoreThanOrEqual(since)')
    })

    it('le saut est décidé à l’ÉCRITURE, pas à la lecture — sinon il se rejouerait', () => {
      const service = read('chat-messages.service.ts')
      const create = service.slice(service.indexOf('async create('), service.indexOf('async listHistory('))
      expect(create.length).toBeGreaterThan(200)
      expect(create).toContain('resolvePrecisionHop')
    })
  })

  // ── 3. La fenêtre vit à un seul endroit (loi 1 / GA-26) ────────────────────

  describe('la fenêtre vit à un seul endroit', () => {
    const FILES = ['chat-quota.ts', 'chat-messages.service.ts', 'ia-proxy.controller.ts', 'chat-context.service.ts']

    it('LIT un corpus non vide', () => {
      for (const file of FILES) expect(read(file).length).toBeGreaterThan(500)
    })

    it('aucune recopie de la fenêtre de 24 h dans le module du copilote', () => {
      expect(QUOTA_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
      const copies = FILES.filter(
        file => file !== 'chat-quota.ts' && /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|86_?400_?000/.test(read(file)),
      )
      expect(copies).toEqual([])
    })

    it('les deux lecteurs de la fenêtre l’IMPORTENT', () => {
      for (const file of ['chat-messages.service.ts', 'ia-proxy.controller.ts']) {
        const source = read(file)
        expect(source).toContain('QUOTA_WINDOW_MS')
        expect(source).toMatch(/from '\.\/chat-quota'/)
      }
    })
  })

  // ── 4. Le PLAN fait foi (#4016 L7, décision Louis 11/10/2026) ─────────────
  //
  // RENVERSEMENT DATÉ : jusqu'au 11/10, `CHAT_DAILY_MESSAGE_LIMIT` avait un
  // défaut (50) et le plafond effectif était le MINIMUM avec le plan — Growth
  // (100) restait bridé à 50 en silence. Le plan fait foi ; la variable n'est
  // plus qu'un plafond de sécurité OPTIONNEL. La garde tient les deux moitiés :
  // le plan n'est plus bridé par un défaut caché, ET il dit toujours NON à un
  // dépassement du plan — l'absence de plafond opérateur n'ouvre jamais l'illimité.
  //
  // PREUVE QU'ELLE SAIT DIRE NON (rouge exact, 11/10/2026) — en remettant
  // `.default(50)` sur `CHAT_DAILY_MESSAGE_LIMIT` dans `env.ts` :
  //   ● GA-91 › le plan fait foi › aucun défaut opérateur caché ne bride le plan
  //     expect(received).not.toMatch(expected)  Expected pattern: not /\.default\(/
  // Et en rendant `null` (illimité) quand ni plan ni opérateur ne répondent :
  //   ● GA-91 › le plan fait foi › l’absence de plafond opérateur n’ouvre JAMAIS l’illimité
  //     expect(received).not.toBeNull()
  describe('le plan fait foi', () => {
    const ENV_SCHEMA = join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas', 'env.ts')

    it('LIT un corpus non vide : chaque palier de la grille', () => {
      expect(SHIPPED_PLAN_CODES.length).toBeGreaterThanOrEqual(6)
    })

    it.each(SHIPPED_PLAN_CODES)('%s : sans opérateur, la borne est EXACTEMENT celle du plan', code => {
      const ceiling = effectiveChatDailyLimit({ operatorLimit: undefined, planLimit: chatDailyLimitOfPlan(code) })
      expect(ceiling).toEqual({ limit: SHIPPED_PLAN_GRID[code].chatDailyMessageLimit, source: 'plan' })
      // Dire NON au dépassement : au plafond du plan, il ne reste rien.
      const limit = ceiling?.limit ?? 0
      expect(countableMessages({ total: limit, exempt: 0, limit })).toBeGreaterThanOrEqual(limit)
    })

    it('l’absence de plafond opérateur n’ouvre JAMAIS l’illimité', () => {
      for (const planLimit of [null, 0, -1, 2.5]) {
        const ceiling = effectiveChatDailyLimit({ operatorLimit: undefined, planLimit })
        expect(ceiling).not.toBeNull()
        expect(ceiling?.limit).toBeGreaterThan(0)
      }
    })

    it('un plafond opérateur POSÉ reste un plafond de sécurité', () => {
      const growth = chatDailyLimitOfPlan('growth') ?? 0
      expect(effectiveChatDailyLimit({ operatorLimit: growth - 1, planLimit: growth })).toEqual({
        limit: growth - 1,
        source: 'operator',
      })
    })

    it('aucun défaut opérateur caché ne bride le plan', () => {
      const schema = readFileSync(ENV_SCHEMA, 'utf8')
      const line = schema.split('\n').find(l => l.includes('CHAT_DAILY_MESSAGE_LIMIT:'))
      expect(line).toBeDefined()
      const declaration = schema.slice(schema.indexOf('CHAT_DAILY_MESSAGE_LIMIT:'), schema.indexOf('CHAT_QUOTA_EXEMPT'))
      expect(declaration.length).toBeGreaterThan(40)
      expect(declaration).not.toMatch(/\.default\(/)
      // …ni un repli recopié dans les lecteurs de la variable.
      for (const file of ['ia-proxy.controller.ts', 'chat-thread-titles.service.ts']) {
        expect(read(file)).not.toMatch(/chatDailyMessageLimit'\)\)?\s*(\?\?|\|\|)\s*\d/)
      }
    })
  })
})
