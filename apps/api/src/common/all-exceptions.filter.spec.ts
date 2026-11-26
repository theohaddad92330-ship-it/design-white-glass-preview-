import { HttpException, HttpStatus } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'
import type { HttpAdapterHost } from '@nestjs/core'
import { correlationStorage } from '../correlation-id/correlation-id.store'
import { AllExceptionsFilter } from './all-exceptions.filter'
import { SUPPORT_REFERENCE_PATTERN } from '@bellum/contracts'

/**
 * The last link in the « API error » chain.
 *
 * A non-`HttpException` was answered with the bare string `'Internal server
 * error'`. Express sends a string body as `text/html`, so the web's
 * `extractError` could not `res.json()` it and fell through to its last-resort
 * `'API error'` — an untranslated non-explanation, in a French UI.
 *
 * The invariant these tests pin: whatever is thrown, the client can parse the
 * reply and find a message in it.
 */
describe('AllExceptionsFilter', () => {
  const build = (): { filter: AllExceptionsFilter; reply: jest.Mock; host: ArgumentsHost } => {
    const reply = jest.fn()
    const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', originalUrl: '/contacts/abc/enrich' }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost
    return { filter: new AllExceptionsFilter(adapterHost), reply, host }
  }

  it('answers an unhandled error with a JSON OBJECT, never a bare string', () => {
    const { filter, reply, host } = build()

    filter.catch(new Error('TypeError: fetch failed'), host)

    const [, body, status] = reply.mock.calls[0]!
    expect(status).toBe(500)
    // The whole defect in one assertion: a string body here is unparseable as
    // JSON on the client, which is precisely what produced "API error".
    expect(typeof body).toBe('object')
    expect(body).toEqual(expect.objectContaining({ message: expect.any(String) }))
  })

  it('leaves an HttpException body untouched, including its machine code', () => {
    // Endpoints that DO explain themselves must not be rewritten — the
    // `{message, code}` contract the contacts controller uses has to survive.
    const { filter, reply, host } = build()

    filter.catch(
      new HttpException(
        { message: 'Le service externe est indisponible.', code: 'unauthorized' },
        HttpStatus.BAD_GATEWAY,
      ),
      host,
    )

    const [, body, status] = reply.mock.calls[0]!
    expect(status).toBe(502)
    expect(body).toEqual({ message: 'Le service externe est indisponible.', code: 'unauthorized' })
  })

  it('does not leak the internal error text to the client', () => {
    // Honest ≠ verbose. The reply admits a failure without exposing a stack or
    // a driver message; the detail goes to the log line instead.
    const { filter, reply, host } = build()

    filter.catch(new Error('connect ECONNREFUSED 10.0.0.4:5432 password=hunter2'), host)

    expect(JSON.stringify(reply.mock.calls[0]![1])).not.toContain('hunter2')
  })
})

/**
 * #2442.5 / #2442.6 — LE DERNIER PASSAGE AVANT LE NAVIGATEUR.
 *
 * Toute réponse d'erreur du produit sort par ce filtre (`@Catch()` nu, posé
 * globalement dans `main.ts`) : c'est donc le seul endroit où « toute erreur
 * utilisateur porte une référence support » et « rien d'interne ne sort » se
 * tiennent d'un coup, au lieu d'être promis à chaque contrôleur.
 */
describe('#2442.5 / #2442.6 — la référence support, et rien d’interne', () => {
  const CORRELATION_ID = '3f2a1b4c-5d6e-7f80-9012-3456789abcde'

  const build = (): { filter: AllExceptionsFilter; reply: jest.Mock; host: ArgumentsHost } => {
    const reply = jest.fn()
    const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', originalUrl: '/accounts/abc/analyse' }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost
    return { filter: new AllExceptionsFilter(adapterHost), reply, host }
  }

  const catchWithin = (exception: unknown): Record<string, unknown> => {
    const { filter, reply, host } = build()
    correlationStorage.run({ correlationId: CORRELATION_ID }, () => filter.catch(exception, host))
    return reply.mock.calls[0]![1] as Record<string, unknown>
  }

  it('#2442.5 — pose une référence support courte sur une erreur inattendue', () => {
    const body = catchWithin(new Error('boom'))
    expect(body['supportReference']).toBe('BLM-3F2A1B4C')
    expect(String(body['supportReference'])).toMatch(SUPPORT_REFERENCE_PATTERN)
  })

  it('#2442.5 — la pose AUSSI sur une erreur que le contrôleur explique déjà', () => {
    const body = catchWithin(new HttpException({ message: 'Ce compte est introuvable.', code: 'not_found' }, 404))
    expect(body['message']).toBe('Ce compte est introuvable.')
    expect(body['code']).toBe('not_found')
    expect(body['supportReference']).toBe('BLM-3F2A1B4C')
  })

  it('n’INVENTE pas de référence hors contexte de corrélation — « non mesuré » n’est pas une valeur', () => {
    const { filter, reply, host } = build()
    filter.catch(new Error('boom'), host)
    expect((reply.mock.calls[0]![1] as Record<string, unknown>)['supportReference']).toBeUndefined()
  })

  it('#2442.6 — une pile d’appels recopiée dans le message n’atteint jamais le navigateur', () => {
    const body = catchWithin(
      new HttpException(
        {
          message: 'Échec\n    at AnalysisService.run (/app/apps/api/src/modules/analysis/analysis.service.ts:412:19)',
        },
        500,
      ),
    )
    expect(JSON.stringify(body)).not.toContain('analysis.service.ts')
    expect(JSON.stringify(body)).not.toContain('AnalysisService.run')
  })

  it('#2442.6 — ni un fragment de requête, ni un nom de contrainte', () => {
    const sql = catchWithin(new HttpException({ message: 'SELECT id, email FROM contacts WHERE id = $1' }, 500))
    expect(JSON.stringify(sql)).not.toContain('FROM contacts')
    const constraint = catchWithin(
      new HttpException({ message: 'duplicate key value violates unique constraint "contacts_email_key"' }, 409),
    )
    expect(JSON.stringify(constraint)).not.toContain('contacts_email_key')
  })

  it('#2442.6 — ni le nom d’UN DE NOS fournisseurs', () => {
    const body = catchWithin(new HttpException({ message: 'Firecrawl a répondu 503.' }, 502))
    expect(JSON.stringify(body)).not.toMatch(/firecrawl/i)
  })

  it('#2442.6 — un message en LISTE (ValidationPipe) est caviardé ligne à ligne', () => {
    const body = catchWithin(new HttpException({ message: ['champ invalide', 'api_key=AKIA0000000000000000'] }, 400))
    expect(JSON.stringify(body)).not.toContain('AKIA0000000000000000')
    expect((body['message'] as string[])[0]).toBe('champ invalide')
  })

  it('N’ATTRAPE PAS ce qu’il ne vise pas — une phrase normale et ses données traversent intactes', () => {
    const body = catchWithin(
      new HttpException(
        {
          message: 'Ce dossier a changé pendant ta saisie.',
          code: 'conflict',
          details: { intervening: [{ label: 'Poste mis à jour' }] },
        },
        409,
      ),
    )
    expect(body['message']).toBe('Ce dossier a changé pendant ta saisie.')
    expect(body['details']).toEqual({ intervening: [{ label: 'Poste mis à jour' }] })
  })

  it('#2442.6 — un corps qui n’est PAS un objet devient un objet, avec sa référence', () => {
    // `new HttpException('texte', 500).getResponse()` rend une CHAÎNE : Express
    // la sérialise en `text/html`, et le navigateur n'y trouve ni code, ni
    // référence support. Voir le docbloc du filtre.
    const body = catchWithin(new HttpException('Le service est momentanément indisponible.', 503))
    expect(typeof body).toBe('object')
    expect(body['message']).toBe('Le service est momentanément indisponible.')
    expect(body['supportReference']).toBe('BLM-3F2A1B4C')
  })
})
