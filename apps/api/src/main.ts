// Must be first: initializes Sentry before Nest reflects on any module.
import './sentry/instrument'

import { Logger } from '@nestjs/common'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod'
import { CV_ZIP_MAX_ARCHIVE_BYTES } from '@bellum/contracts'
import cookieParser from 'cookie-parser'
import express, { Request, Response, NextFunction } from 'express'
import { AppModule } from './app.module'
import { PublicApiModule } from './modules/public-api/public-api.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'
import { HttpLoggingInterceptor } from './common/http-logging.interceptor'
import { createLogger } from './common/logger.service'
import { correlationIdMiddleware } from './correlation-id/correlation-id.middleware'
import { requestMemoMiddleware } from './common/request-memo'
import { ZodValidationExceptionFilter } from './common/zod-validation-exception.filter'
import { stripeRawBodyParser, stashRawBody } from './modules/credits/stripe-raw-body.middleware'
import { resendRawBodyParser, stashResendRawBody } from './modules/mailer/resend-raw-body.middleware'
import { telephonyRawBodyParser, stashTelephonyRawBody } from './modules/telephony/telephony-raw-body.middleware'
import { getAllowedCorsOrigins } from './config/cors-origins'
import { httpCompression } from './perf/http-compression'
import { createServerTimingMiddleware } from './perf/server-timing.middleware'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(),
  })

  // Behind Railway's edge proxy: trust exactly one hop so `req.ip` / rate-limit
  // keys reflect the real client, not the shared edge address. Never `true`
  // (that would let any client spoof X-Forwarded-For).
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  // Perf P1 — compression des réponses ≥ 1 Ko, hors flux SSE et Socket.IO.
  app.use(httpCompression())

  // Body parsers — register explicitly and first. NestJS auto-registers
  // them during `listen()`, but any `app.use()` call before that point
  // ends up in the stack BEFORE the auto-registered parser, which is why
  // our debug/correlation middleware saw `req.body === undefined`.
  // Stripe webhook needs the raw, unparsed bytes for signature verification.
  // Capture them on the webhook route BEFORE the global JSON parser consumes
  // the stream (see stripe-raw-body.middleware.ts).
  app.use('/credits/webhook', stripeRawBodyParser, stashRawBody)
  // #2733 — même besoin pour le webhook Resend (`ResendWebhookController`) :
  // la signature Svix se vérifie sur les octets EXACTS que Resend a signés.
  app.use('/webhooks/resend', resendRawBodyParser, stashResendRawBody)
  // #2403.12 — même besoin pour le webhook « appel en cours »
  // (`TelephonyWebhookController`) : la signature HMAC se vérifie sur les
  // octets EXACTS que l'outil de téléphonie/l'automatisation a signés.
  app.use('/webhooks/telephony', telephonyRawBodyParser, stashTelephonyRawBody)

  // RAG file ingest (Théo p.21) : un PDF/document envoyé en base64 dépasse la
  // limite globale 1mb. On accepte jusqu'à 12mb UNIQUEMENT sur cette route
  // authentifiée (≈ 9MB de fichier brut), le reste reste à 1mb. Mount AVANT le
  // parser global : le premier json() qui matche le chemin parse, le second
  // voit un body déjà parsé et n'agit pas.
  app.use('/rag-documents/ingest', express.json({ limit: '12mb' }))
  // Même raison pour un enregistrement de rendez-vous déposé en base64 : la
  // limite du service de transcription est de 25 Mo, donc ~33 Mo encodés. La
  // route est authentifiée et la taille est re-vérifiée côté service, où le
  // refus est immédiat plutôt qu'après deux minutes d'envoi.
  app.use('/meeting-notes/transcribe', express.json({ limit: '34mb' }))
  // #1939 — un message vocal de Laura (90 s, 2 Mo au plus) voyage en base64, qui
  // pèse un tiers de plus : il dépasse la limite globale de 1 Mo dès 45 secondes.
  // Monté à 4 Mo pour que le refus au-delà de 2 Mo vienne du CONTRÔLEUR, avec sa
  // phrase, et pas d'un 413 anonyme du parseur. Route authentifiée.
  app.use('/ia/chat/voice', express.json({ limit: '4mb' }))
  // Un appel d'offres ou un dossier de mission arrive en PDF/DOCX encodé en
  // base64, qui gonfle le fichier d'un tiers : un document de 800 Ko dépassait
  // déjà la limite globale et l'envoi partait en 413. Le retour client du 14/08
  // décrit exactement cela — « en ajoutant un PDF […] j'ai reçu un message
  // d'erreur ». Route authentifiée, taille re-vérifiée côté service.
  app.use('/rfp', express.json({ limit: '12mb' }))
  // #3065 — l'archive ZIP de CV partageait la limite pensée pour UN CV (12 Mo
  // de corps, ~8 Mo de fichier) : au-delà d'environ 9 Mo d'archive, le corps
  // était rejeté AVANT le service, et le message générique du parseur HTTP
  // remontait comme « Validation failed ». La borne du contrat
  // (`CV_ZIP_MAX_ARCHIVE_BYTES`, 20 Mo) est désormais la MÊME dans le
  // navigateur (`CvZipImportDialog`, refus avant tout envoi) et ici — montée
  // un cran au-dessus (le base64 pèse un tiers de plus que l'octet, plus la
  // marge du reste de l'enveloppe JSON) pour que le refus vienne du SERVICE,
  // avec sa raison (`cv-batch-import.service.ts`). Montée AVANT `/talents/intake`
  // ci-dessous : le premier parseur qui matche le chemin agit, le second voit
  // un corps déjà consommé et n'agit pas — mais seul un envoi qui dépasse
  // MÊME cette marge tombe sur le filet ci-dessous, avec sa propre phrase.
  const CV_ZIP_BODY_LIMIT_BYTES = Math.ceil((CV_ZIP_MAX_ARCHIVE_BYTES * 4) / 3) + 64 * 1024
  app.use(
    '/talents/intake/zip',
    express.json({ limit: CV_ZIP_BODY_LIMIT_BYTES }),
    (err: unknown, _req: Request, res: Response, next: NextFunction) => {
      const status =
        (err as { status?: number; statusCode?: number } | null)?.status ??
        (err as { statusCode?: number } | null)?.statusCode
      if (status !== 413) {
        next(err)
        return
      }
      res.status(413).json({
        statusCode: 413,
        message:
          'Cette archive dépasse la taille transportable en un seul envoi. Découpe-la en plusieurs envois plus petits.',
      })
    },
  )
  // #2326.6 (épopée #2794) — un DOSSIER entier de CV pèse comme un LOT, pas
  // comme le CV unitaire de la route générique juste en dessous (12 Mo) :
  // même classe de taille que l'archive ZIP ci-dessus, même borne partagée
  // (`CV_ZIP_MAX_ARCHIVE_BYTES`) et même refus NOMMÉ plutôt qu'un 413 muet.
  // Montée AVANT `/talents/intake` pour la même raison que la route ZIP.
  app.use(
    '/talents/intake/files',
    express.json({ limit: CV_ZIP_BODY_LIMIT_BYTES }),
    (err: unknown, _req: Request, res: Response, next: NextFunction) => {
      const status =
        (err as { status?: number; statusCode?: number } | null)?.status ??
        (err as { statusCode?: number } | null)?.statusCode
      if (status !== 413) {
        next(err)
        return
      }
      res.status(413).json({
        statusCode: 413,
        message:
          'Ce dossier dépasse la taille transportable en un seul envoi. Découpe-le en plusieurs envois plus petits.',
      })
    },
  )
  // Le dépôt d'un CV voyage en base64 dans le corps, comme l'ingestion
  // documentaire. Le contrat borne le FICHIER à 8 Mo ; la route est montée un
  // cran au-dessus parce que le base64 pèse un tiers de plus que l'octet.
  app.use('/talents/intake', express.json({ limit: '12mb' }))
  // Le dépôt d'un justificatif ou d'une pièce d'affaire (31/08/2026). Le
  // contrat borne le FICHIER à 10 Mo ; le corps est monté à 16 Mo parce que le
  // base64 pèse un tiers de plus que l'octet, et qu'un refus doit venir de la
  // règle NOMMÉE (« ce fichier dépasse 10 Mo ») et non d'un 413 muet de la
  // couche HTTP, qui fait redéposer le même fichier.
  app.use('/expenses/reports', express.json({ limit: '16mb' }))
  app.use('/projects/needs', express.json({ limit: '16mb' }))
  // Un export de prospection (CSV) tient rarement dans 1 Mo dès qu'il porte les
  // colonnes d'un outil commercial. La borne de 2000 lignes du parseur reste la
  // vraie limite ; elle est ANNONCÉE, là où un 413 ne l'est pas.
  app.use(/^\/accounts\/[^/]+\/contacts\/import-csv$/, express.json({ limit: '12mb' }))
  // #2553 / #3740 — un organigramme PDF/image/PPTX voyage en base64 (comme /rfp).
  app.use(/^\/analysis\/[^/]+\/org-people\/from-file$/, express.json({ limit: '12mb' }))
  // L'assistant d'import (`/import/*`) envoie le fichier DÉCODÉ dans le corps :
  // c'est le navigateur qui possède les tables de caractères (Windows-1252), pas
  // nous. Il était resté à 1 Mo pendant que son schéma en acceptait vingt
  // millions de caractères — la borne applicative était vingt fois au-dessus de
  // ce que le transport laissait passer, et entre les deux tombait un 413 sans
  // corps JSON, donc sans message. La reprise nominative de l'ancien CRM
  // (17 387 contacts, 38 colonnes) ne pouvait matériellement pas passer. Le
  // plafond ANNONCÉ est `IMPORT_CONTENT_MAX_CHARS` (8 Mo) ; la route est montée
  // un cran au-dessus, parce que l'échappement JSON d'un CSV pèse plus que le
  // texte qu'il transporte.
  app.use('/import', express.json({ limit: '12mb' }))

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  // Correlation ID — must be first AFTER body parsing so downstream
  // middleware sees the parsed body.
  app.use(correlationIdMiddleware)
  // Perf P2 (29/09/2026) — mémo PAR REQUÊTE GET/HEAD de la résolution d'espace
  // et des permissions (`common/request-memo.ts`). Monté après la corrélation
  // pour hériter de son contexte, avant tout guard Nest.
  app.use(requestMemoMiddleware)
  // Perf P1 — `Server-Timing` (app / db + nb de requêtes / pool) et
  // `Timing-Allow-Origin` (origines CORS, jamais `*`) sur chaque réponse.
  app.use(createServerTimingMiddleware(getAllowedCorsOrigins()))

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // HSTS: force HTTPS for 2y incl. subdomains. (X-XSS-Protection dropped — it's
    // deprecated and can introduce vulnerabilities in some browsers.)
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })

  // `exposedHeaders` : en cross-origin, un navigateur ne laisse lire QUE six
  // en-têtes de réponse par défaut. `Content-Disposition` n'en fait pas partie,
  // si bien que le nom de fichier construit par le serveur — à partir du nom du
  // compte — était invisible côté SPA, qui retombait sur un nom générique. Le
  // téléchargement marchait ; il ne portait simplement pas le bon nom.
  // `X-Correlation-Id` relève du même piège : l'API le pose sur CHAQUE réponse,
  // mais la SPA (app.bellum-ai.com) et l'API (api.bellum-ai.com) sont deux
  // origines — sans exposition, le rapport de bug in-app joignait des requêtes
  // en échec sans le seul identifiant qui permet de retrouver la trace serveur
  // correspondante.
  app.enableCors({
    origin: getAllowedCorsOrigins(),
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Correlation-Id'],
  })

  app.useGlobalPipes(new ZodValidationPipe())
  // Order matters: more-specific filter (Zod) must register AFTER the catch-all
  // so it takes precedence — NestJS picks the last matching filter for a given
  // exception class.
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)), new ZodValidationExceptionFilter())
  app.useGlobalInterceptors(new HttpLoggingInterceptor())

  // OpenAPI for the PUBLIC surface ONLY: `include` restricts the document to
  // the controllers of PublicApiModule (`/v1/*`), so the internal API is never
  // documented. The spec (`/v1/openapi.json`) and the Swagger UI (`/v1/docs`)
  // are public by design — they describe the surface, they hold no secret.
  const openApiConfig = new DocumentBuilder()
    .setTitle('Bellum Public API')
    .setDescription(
      'Read-only access to your BellumAI workspace data: analysed accounts (dossiers), contacts and analysis runs.\n\n' +
        'Authenticate every request with a workspace API key created in **Settings › Integrations**:\n\n' +
        '`Authorization: Bearer blm_live_…`\n\n' +
        'Keys are scoped (`read:accounts`, `read:contacts`), revocable at any time, and rate-limited to 120 requests/min each.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: 'Workspace API key (`blm_live_…`) — created in Settings › Integrations, shown only once.',
      },
      'api-key',
    )
    .build()
  const openApiDoc = cleanupOpenApiDoc(SwaggerModule.createDocument(app, openApiConfig, { include: [PublicApiModule] }))
  SwaggerModule.setup('v1/docs', app, openApiDoc, {
    jsonDocumentUrl: 'v1/openapi.json',
    customSiteTitle: 'Bellum Public API — Documentation',
  })

  // Wire SIGTERM/SIGINT into Nest's shutdown lifecycle. Without this, a deploy
  // (Railway sends SIGTERM) hard-kills the process: in-flight analyses are
  // dropped, their BullMQ jobs stall and re-run, re-burning Claude tokens.
  // With hooks on, @nestjs/bullmq's onApplicationShutdown calls worker.close(),
  // which drains active jobs (lets them finish) before the process exits.
  app.enableShutdownHooks()

  const port = process.env['PORT'] || 3000
  await app.listen(port)

  // Process-level safety nets — installed only AFTER a successful boot, so a boot
  // failure still reaches `bootstrap().catch` below (→ exit 1 → Railway restart),
  // while a stray async error DURING operation is logged, not fatal.
  installProcessSafetyNets()
}

/**
 * Keep the worker process ALIVE on a stray async error.
 *
 * Job failures are already isolated by BullMQ — a throwing processor fails THAT
 * job (and retries per `attempts`); it never touches the process. But a
 * fire-and-forget promise that rejects, or a late callback that throws OUTSIDE a
 * handled path, would by Node ≥15 default TERMINATE the process — taking every
 * in-flight analysis with it. Registering these listeners overrides that default:
 * we log the error (→ Winston → Sentry, per the repo convention of passing meta
 * through the logger rather than calling Sentry directly) and DON'T exit, so one
 * bad job's stray rejection can never crash the shared worker. Genuinely fatal
 * BOOT errors are the deliberate exception — they exit non-zero (below) so Railway
 * relaunches, and the `/health/ready` gate keeps a broken build from being promoted.
 */
function installProcessSafetyNets(): void {
  const logger = new Logger('Process')
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection (logged, process kept alive)', {
      error: reason instanceof Error ? reason : new Error(String(reason)),
      tags: { kind: 'unhandledRejection' },
    })
  })
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception (logged, process kept alive)', {
      error,
      tags: { kind: 'uncaughtException' },
    })
  })
}

bootstrap().catch((error: unknown) => {
  // Fatal boot error (module init, DB/Redis unreachable at startup, bad config):
  // the `/health/ready` gate never went green, so Railway cut over no traffic.
  // Exit non-zero so the restartPolicy (ON_FAILURE) relaunches the process — the
  // worker "always restarts on its own" instead of hanging half-booted.
  const logger = new Logger('Bootstrap')
  logger.error('Fatal boot error — exiting non-zero for restart', {
    error: error instanceof Error ? error : new Error(String(error)),
  })
  process.exit(1)
})
