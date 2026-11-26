import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'
import Stripe from 'stripe'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { dependencyPresence, isApiManagerDependencyId, type ApiManagerDependencyId } from './manager-dependencies'

type DependencyTestResult = { ok: boolean; detail: string; checkedAt: string }

/**
 * #1676.2 — les TROIS dépendances du manager dont le secret vit côté API :
 * Stripe (facturation récurrente), Resend (e-mails sortants), le webhook
 * Slack des alertes back-office. Voir le docblock de `manager-dependencies.ts`
 * pour les trois autres (Supabase, Vercel, GitHub — testées côté
 * `dashboard-manager`, qui détient leurs identifiants).
 *
 * ⚠️ AUCUN CLIENT PARTAGÉ. `StripeService` (module `stripe/`) JETTE si
 * `STRIPE_SECRET_KEY` manque (`stripe.service.ts:111`) — un choix juste pour
 * du code métier qui ne doit jamais tourner sans facturation configurée, mais
 * l'inverse exact de ce dont CET écran a besoin : dire « non configuré »
 * plutôt que de faire tomber tout le module au démarrage. Même raisonnement
 * pour Resend — `MailerService` n'est pas importable ici (GA-07 est au
 * plafond, voir `backoffice-alert-dispatch.service.ts`). Les deux clients
 * sont donc construits ICI, à la demande, jamais mémorisés tant que la clé
 * peut changer d'un déploiement à l'autre.
 *
 * ⚠️ « SAIN N'EST JAMAIS DÉCLARÉ, IL EST DÉRIVÉ D'UN TEST RÉEL. » Chaque test
 * fait un appel RÉEL et NON DESTRUCTIF : `balance.retrieve()` (Stripe),
 * `domains.list()` (Resend), un POST factice sur le webhook (Slack — un
 * webhook entrant n'expose aucune lecture, poster est la seule vérification
 * possible ; le message est nommé « test » pour ne pas se lire comme une
 * vraie alerte).
 */
@Controller('internal/admin/manager-dependencies')
@UseGuards(InternalSecretGuard)
export class ManagerDependenciesController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  async status() {
    return {
      dependencies: dependencyPresence({
        stripeSecretKey: this.config.get<string>('stripeSecretKey'),
        resendApiKey: this.config.get<string>('resendApiKey'),
        slackWebhookUrl: process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL'],
      }),
      measuredAt: new Date().toISOString(),
    }
  }

  @Post(':id/test')
  @HttpCode(200)
  async test(@Param('id') id: string): Promise<DependencyTestResult> {
    if (!isApiManagerDependencyId(id)) {
      return { ok: false, detail: `Dépendance inconnue côté API : ${id}`, checkedAt: new Date().toISOString() }
    }
    const testers: Record<ApiManagerDependencyId, () => Promise<DependencyTestResult>> = {
      stripe: () => this.testStripe(),
      resend: () => this.testResend(),
      slack: () => this.testSlack(),
    }
    return testers[id]()
  }

  private async testStripe(): Promise<DependencyTestResult> {
    const checkedAt = new Date().toISOString()
    const key = this.config.get<string>('stripeSecretKey')
    if (!key) return { ok: false, detail: 'non configuré — STRIPE_SECRET_KEY absente', checkedAt }
    try {
      const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion })
      const balance = await stripe.balance.retrieve()
      return { ok: true, detail: `Stripe a répondu (${balance.available.length} solde(s) disponible(s))`, checkedAt }
    } catch (error) {
      return {
        ok: false,
        detail: `Stripe a refusé l'appel : ${error instanceof Error ? error.message : String(error)}`,
        checkedAt,
      }
    }
  }

  private async testResend(): Promise<DependencyTestResult> {
    const checkedAt = new Date().toISOString()
    const key = this.config.get<string>('resendApiKey')
    if (!key) return { ok: false, detail: 'non configuré — RESEND_API_KEY absente', checkedAt }
    try {
      const resend = new Resend(key)
      const { data, error } = await resend.domains.list()
      if (error) throw new Error(error.message)
      return { ok: true, detail: `Resend a répondu (${data?.data.length ?? 0} domaine(s) déclaré(s))`, checkedAt }
    } catch (error) {
      return {
        ok: false,
        detail: `Resend a refusé l'appel : ${error instanceof Error ? error.message : String(error)}`,
        checkedAt,
      }
    }
  }

  private async testSlack(): Promise<DependencyTestResult> {
    const checkedAt = new Date().toISOString()
    const webhook = process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL']?.trim()
    if (!webhook) return { ok: false, detail: 'non configuré — BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL absente', checkedAt }
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Test de connectivité — Dépendances du manager (BellumAI). Ignorer ce message.' }),
      })
      if (!res.ok) throw new Error(`le webhook a répondu ${res.status}`)
      return { ok: true, detail: 'Message de test envoyé sur le canal configuré', checkedAt }
    } catch (error) {
      return {
        ok: false,
        detail: `Slack a refusé l'appel : ${error instanceof Error ? error.message : String(error)}`,
        checkedAt,
      }
    }
  }
}
