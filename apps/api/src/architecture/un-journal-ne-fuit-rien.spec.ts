import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HttpException } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'
import type { HttpAdapterHost } from '@nestjs/core'
import * as winston from 'winston'
import { AllExceptionsFilter } from '../common/all-exceptions.filter'
import { correlationStorage } from '../correlation-id/correlation-id.store'
import { SUPPORT_REFERENCE_PATTERN } from '@bellum/contracts'
import { internalDetailsIn } from '../common/observability-privacy'
import { redactLogInfo } from '../common/logger.service'

/**
 * #2442.1 / .5 / .6 / .7 / .8 / .19 — UN JOURNAL NE FUIT RIEN, UN ÉCRAN D'ERREUR
 * NON PLUS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La convention de `common/observability-privacy.ts` ne vaut que tant que les
 * trois CHEMINS qui doivent la lire la lisent vraiment. Un module juste,
 * calculé, testé, que personne n'appelle est le défaut le plus fréquent du
 * dépôt : cette garde cherche l'APPELANT, pas la fonction.
 *
 *   1. le PUITS du journal — `createLogger()` passe chaque ligne par
 *      `redactLogInfo`, dans les DEUX formats (développement et production) ;
 *   2. le dernier passage avant le navigateur — `AllExceptionsFilter` pose la
 *      référence support et caviarde ;
 *   3. Sentry — `sentry/instrument.ts` ne tient plus sa propre liste (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT — et pourquoi elle ne se contente pas de lire du texte
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle fait tourner le vrai format winston et le vrai filtre sur des entrées
 * fabriquées, puis regarde ce qui en sort. Un test qui ne lirait que le code
 * source resterait vert sur un `redactLogInfo` devenu l'identité ; un test qui
 * ne ferait que tourner resterait vert si le format était retiré du pipeline.
 * Les deux moitiés sont donc là, et chacune a son témoin :
 *   — le COMPORTEMENT : l'entrée non caviardée porte bien le contenu (sinon
 *     l'assertion « ne contient pas » serait vraie pour rien) ;
 *   — le CÂBLAGE : le pipeline réel est construit et son format appliqué.
 *
 * Elle retire les commentaires avant de chercher dans un source : mesuré
 * ailleurs dans ce dossier, une garde qui lit la PROSE accuse du code juste
 * parce que le mot interdit apparaît dans un docbloc qui l'explique.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const LOGGER_FILE = 'apps/api/src/common/logger.service.ts'
const SENTRY_FILE = 'apps/api/src/sentry/instrument.ts'
const FILTER_FILE = 'apps/api/src/common/all-exceptions.filter.ts'
const GLOBAL_FILTER_FILE = 'apps/api/src/common/global-exception.filter.ts'

/** Retire les commentaires — un docblock qui CITE un motif ne doit pas se
 *  dénoncer lui-même (même piège que GA-08 / GA-240 / GA-264). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function code(file: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'))
}

const SPLAT = Symbol.for('splat')

function logEntry(extra: Record<string | symbol, unknown> = {}): winston.Logform.TransformableInfo {
  return { level: 'error', message: 'échec', timestamp: '12:00:00', ...extra } as winston.Logform.TransformableInfo
}

/** Un corps de message, une adresse, un téléphone : ce qui ne doit jamais
 *  atteindre un transport de journal. Fabriqués ici, jamais recopiés d'une
 *  donnée réelle. */
const PRIVATE_SAMPLE = {
  draft: { subject: 'Suite à notre échange', body: 'Bonjour Jean, je reviens vers toi au sujet du poste.' },
  contact: { email: 'jean.dupont@example.test', phone: '+33612345678' },
}
const PRIVATE_NEEDLES = ['Bonjour Jean', 'Suite à notre échange', 'jean.dupont@example.test', '+33612345678'] as const

describe('#2442.7 — le PUITS du journal : `createLogger` caviarde, dans les deux formats', () => {
  it('lit un corpus non vide — le témoin porte bien le contenu qu’on cherche à ne plus voir', () => {
    // Sans ce contrôle, toutes les assertions « ne contient pas » ci-dessous
    // seraient vraies pour la mauvaise raison (mesuré : un relevé négatif se
    // valide par un contrôle sur un cas connu).
    const witness = JSON.stringify(logEntry({ ...PRIVATE_SAMPLE }))
    for (const needle of PRIVATE_NEEDLES) expect(witness).toContain(needle)
  })

  it('le format réel retire le contenu privé et garde les métadonnées', () => {
    const out = JSON.stringify(redactLogInfo(logEntry({ ...PRIVATE_SAMPLE, status: 502, accountId: 'acc-1' })))
    for (const needle of PRIVATE_NEEDLES) expect(out).not.toContain(needle)
    expect(out).toContain('acc-1')
    expect(out).toContain('502')
  })

  it('le format est BRANCHÉ dans les deux pipelines — développement ET production', () => {
    const source = code(LOGGER_FILE)
    // Deux `winston.format(redactLogInfo)()` : un par branche du ternaire
    // `isDev ? … : …`. Une seule occurrence voudrait dire qu'un des deux
    // environnements journalise en clair.
    const wired = source.match(/winston\.format\(redactLogInfo\)\(\)/g) ?? []
    expect(wired.length).toBe(2)
  })

  it('le caviardage passe AVANT la sérialisation JSON de production', () => {
    const source = code(LOGGER_FILE)
    const redaction = source.indexOf('winston.format(redactLogInfo)()', source.indexOf('correlation_id'))
    const json = source.indexOf('winston.format.json()')
    expect(redaction).toBeGreaterThan(-1)
    expect(json).toBeGreaterThan(redaction)
  })

  it('SAIT DIRE NON — un pipeline winston réel SANS le format laisse passer le corps du brouillon', () => {
    // La preuve par la faute : on remonte le pipeline de production à
    // l'identique, en retirant la seule étape de caviardage.
    const leaky = winston.format.combine(winston.format.timestamp(), winston.format.json())
    const transformed = leaky.transform(logEntry({ ...PRIVATE_SAMPLE })) as winston.Logform.TransformableInfo
    expect(JSON.stringify(transformed)).toContain('Bonjour Jean')

    const tight = winston.format.combine(
      winston.format.timestamp(),
      winston.format(redactLogInfo)(),
      winston.format.json(),
    )
    const guarded = tight.transform(logEntry({ ...PRIVATE_SAMPLE })) as winston.Logform.TransformableInfo
    expect(JSON.stringify(guarded)).not.toContain('Bonjour Jean')
  })

  it('le SPLAT est traité — c’est par là qu’arrive `logger.error("échec", { draft })`', () => {
    const out = redactLogInfo(logEntry({ [SPLAT]: [{ ...PRIVATE_SAMPLE }] }))
    expect(JSON.stringify((out as unknown as Record<symbol, unknown>)[SPLAT])).not.toContain('Bonjour Jean')
  })
})

describe('#2442.5 / #2442.6 — le dernier passage avant le navigateur est BRANCHÉ', () => {
  const CORRELATION_ID = '3f2a1b4c-5d6e-7f80-9012-3456789abcde'

  const answerTo = (exception: unknown): Record<string, unknown> => {
    const reply = jest.fn()
    const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', originalUrl: '/accounts/abc' }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost
    const filter = new AllExceptionsFilter(adapterHost)
    correlationStorage.run({ correlationId: CORRELATION_ID }, () => filter.catch(exception, host))
    return reply.mock.calls[0]![1] as Record<string, unknown>
  }

  it('#2442.5 — toute erreur utilisateur sort avec une référence support à la bonne forme', () => {
    for (const exception of [
      new Error('boom'),
      new HttpException({ message: 'Ce compte est introuvable.', code: 'not_found' }, 404),
      new HttpException('Service indisponible.', 503),
    ]) {
      const reference = answerTo(exception)['supportReference']
      expect(typeof reference).toBe('string')
      expect(String(reference)).toMatch(SUPPORT_REFERENCE_PATTERN)
    }
  })

  it('#2442.6 — aucune des quatre fuites nommées n’atteint le navigateur', () => {
    const leaks: ReadonlyArray<{ what: string; message: string; needle: string }> = [
      {
        what: 'pile d’appels',
        message: 'Échec\n    at Runner.run (/app/apps/api/src/modules/analysis/analysis.service.ts:412:19)',
        needle: 'analysis.service.ts',
      },
      { what: 'SQL', message: 'SELECT id, email FROM contacts WHERE id = $1', needle: 'FROM contacts' },
      { what: 'clé', message: 'api_key=AKIA0000000000000000', needle: 'AKIA0000000000000000' },
      { what: 'fournisseur', message: 'Firecrawl a répondu 503.', needle: 'Firecrawl' },
    ]
    for (const leak of leaks) {
      // Témoin : le message fabriqué porte bien ce qu'on cherche à ne plus voir.
      expect(leak.message).toContain(leak.needle)
      expect(internalDetailsIn(leak.message).length).toBeGreaterThan(0)
      const body = JSON.stringify(answerTo(new HttpException({ message: leak.message }, 500)))
      expect(body).not.toContain(leak.needle)
    }
  })

  it('N’ATTRAPE PAS ce qu’il ne vise pas — une phrase normale traverse le filtre intacte', () => {
    for (const innocent of [
      'Ce compte n’a pas encore été analysé.',
      'La collecte n’a pas abouti. Réessaie dans quelques minutes.',
      'Ton brouillon est déposé dans Gmail.',
      'Il te reste 12 crédits sur 100 ce cycle.',
    ]) {
      expect(internalDetailsIn(innocent)).toEqual([])
      expect(answerTo(new HttpException({ message: innocent }, 400))['message']).toBe(innocent)
    }
  })

  it('le filtre appelle bien la convention — pas une reformulation locale', () => {
    const source = code(FILTER_FILE)
    expect(source).toContain("from './observability-privacy'")
    expect(source).toContain('sanitizeUserFacingText')
    expect(source).toContain('supportReference')
  })
})

describe('GA-26 / #2442.7 — la liste des clés sensibles vit à UN SEUL endroit', () => {
  it('Sentry et les deux filtres lisent la convention, ils ne la redéfinissent pas', () => {
    for (const file of [SENTRY_FILE, FILTER_FILE, GLOBAL_FILTER_FILE, LOGGER_FILE]) {
      expect(code(file)).toContain('observability-privacy')
    }
  })

  it('SAIT DIRE NON — aucun de ces fichiers ne reconstruit un motif de clé sensible', () => {
    // La forme exacte que `sentry/instrument.ts` tenait avant : une expression
    // régulière qui énumère des noms de clés. La revoir ici voudrait dire
    // qu'une deuxième liste est née, et qu'elle dérivera de la première.
    const localList = /\/\([^/\n]*\b(?:authorization|password|api[-_]?key|token)\b[^/\n]*\)\//i
    for (const file of [SENTRY_FILE, FILTER_FILE, GLOBAL_FILTER_FILE, LOGGER_FILE]) {
      expect(code(file)).not.toMatch(localList)
    }
    // Le détecteur sait reconnaître la faute quand on la lui remet.
    expect('const SENSITIVE_KEY = /(authorization|cookie|password|token)/i').toMatch(localList)
  })
})
