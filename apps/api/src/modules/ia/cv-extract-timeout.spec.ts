// HttpClient calls undici's OWN `fetch` (a custom `Agent` dispatcher that Node's
// global fetch rejects — see packages/http/src/client.ts), so stubbing
// `global.fetch` never intercepts it. Mock the `undici` module instead, exactly
// like `ia.client.spec.ts` does.
//
// ⚠️ Ce fichier est listé dans l'exception `ts-jest` de `jest.config.js` (§1) :
// sous `@swc/jest` (le transform par défaut), le `require('undici')` déclenché
// par l'import d'`IaClient` remonte en tête de module et lit ce `const` dans sa
// zone morte, quel que soit l'endroit où on le place dans ce fichier — mesuré,
// pas supposé (voir le commentaire de `jest.config.js`).
const mockFetch = jest.fn()
jest.mock('undici', () => ({ Agent: jest.fn(), fetch: mockFetch }))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConfigService } from '@nestjs/config'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { IaClient } from './ia.client'

/**
 * `IaClient.cvExtract` (`apps/api/src/modules/ia/ia.client.ts`) n'avait AUCUN
 * `timeoutMs` explicite → il héritait du défaut de `HttpClient`, 30 s par
 * tentative. Or l'OCR qu'il peut déclencher côté service IA a son propre
 * budget de 60 s (`apps/ia/app/services/ocr.py:42`, `_TIMEOUT_S = 60.0`). Un
 * document qui se lit légitimement entre 30 s et 60 s était donc abandonné
 * par NestJS alors que l'OCR travaillait encore — #2542.M3.
 *
 * Ce fichier ne teste pas une constante contre elle-même : il LIT le délai
 * réellement donné à la couche HTTP (l'argument passé à `AbortSignal.timeout`,
 * point d'entrée unique du bornage dans `packages/http/src/client.ts`) et le
 * compare au budget OCR mesuré dans le fichier Python — une régression vers
 * le défaut de `HttpClient`, ou un chiffre repassé sous le budget OCR,
 * rougit les deux.
 */

const OCR_MODULE = join(__dirname, '../../../../ia/app/services/ocr.py')
const HTTP_CLIENT = join(__dirname, '../../../../../packages/http/src/client.ts')

function pythonOcrTimeoutS(): number {
  const source = readFileSync(OCR_MODULE, 'utf8')
  const match = source.match(/^_TIMEOUT_S\s*=\s*([0-9.]+)/m)
  if (!match) throw new Error(`_TIMEOUT_S introuvable dans ${OCR_MODULE}`)
  return Number(match[1])
}

function makeConfig(baseUrl = 'http://ia.test'): ConfigService {
  return { get: (_key: string, def?: unknown) => baseUrl ?? def } as unknown as ConfigService
}

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response
}

describe('IaClient.cvExtract — le délai amont couvre le budget de la lecture optique (#2542.M3)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('les deux budgets sont lisibles', () => {
    // Une lecture ratée rendrait NaN, et NaN passe silencieusement toute
    // comparaison `>` — le test aurait l'air vert en ne vérifiant rien.
    expect(Number.isFinite(pythonOcrTimeoutS())).toBe(true)
    expect(pythonOcrTimeoutS()).toBeGreaterThan(0)
  })

  it('passe à la couche HTTP un délai RÉELLEMENT supérieur au budget OCR mesuré côté Python', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout')
    mockFetch.mockResolvedValue(makeResponse(200, { data: {} }))
    const client = new IaClient(makeConfig(), new CorrelationIdService())

    await client.cvExtract({ fileB64: 'ZmFrZQ==', filename: 'cv.pdf' })

    // C'est l'argument RÉEL passé au bornage HTTP (`AbortSignal.timeout`
    // dans `packages/http/src/client.ts:tryFetch`), pas une relecture du
    // code source : si `cvExtract` retombe un jour sur le défaut de
    // `HttpClient` (30 s), ce nombre redevient 30 000 et l'assertion suivante
    // rougit.
    expect(timeoutSpy).toHaveBeenCalledTimes(1)
    const timeoutMsPassed = timeoutSpy.mock.calls[0]?.[0]
    expect(typeof timeoutMsPassed).toBe('number')

    const ocrBudgetMs = pythonOcrTimeoutS() * 1000
    expect(timeoutMsPassed as number).toBeGreaterThan(ocrBudgetMs)

    timeoutSpy.mockRestore()
  })

  it('sait reconnaître le défaut qui abandonnait à 30 s', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper : le défaut de
    // `HttpClient` (30 s) est plus court que le budget OCR (60 s) — c'est
    // exactement la course perdue d'avance que ce lot corrige.
    const httpDefaults = readFileSync(HTTP_CLIENT, 'utf8')
    expect(httpDefaults).toContain('defaultTimeoutMs ?? 30_000')
    expect(30_000).toBeLessThan(pythonOcrTimeoutS() * 1000)
  })
})
