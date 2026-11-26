import { Controller, Get, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DemoLeadService } from './demo-lead.service'

type InternalDemoLeadDto = {
  id: string
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  company: string
  /** `undefined` quand absent — jamais `null` ni une chaîne vide (#2706.3). */
  phone?: string
  firstAccessAt: string
  lastAccessAt: string
  accessCount: number
  source: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
}

/**
 * #2706 — vue interne (dashboard-manager) des prospects du formulaire de
 * démo. Même patron que `/internal/feedback` : gardée par le secret partagé,
 * le back-office la proxy server-side pour que le secret n'atteigne jamais le
 * navigateur.
 *
 * ⚠️ Un champ absent (téléphone, UTM) rend `undefined`, jamais `null` : « on
 * n'affiche pas ce qu'on n'a pas » (doctrine, Louis 20/09/2026) — une valeur
 * `null` sérialisée en JSON reste une clé présente, `undefined` en JSON.stringify
 * DISPARAÎT de l'objet, ce qui est exactement ce qu'une liste doit faire d'un
 * champ qu'elle n'a pas.
 */
@Controller('internal/demo-leads')
@UseGuards(InternalSecretGuard)
export class InternalDemoLeadsController {
  constructor(private readonly demoLead: DemoLeadService) {}

  @Get()
  async list(): Promise<{ items: InternalDemoLeadDto[] }> {
    const leads = await this.demoLead.listMostRecentFirst()
    return {
      items: leads.map(lead => ({
        id: lead.id,
        firstName: lead.first_name,
        lastName: lead.last_name,
        email: lead.email,
        jobTitle: lead.job_title,
        company: lead.company,
        phone: lead.phone ?? undefined,
        firstAccessAt: lead.first_access_at.toISOString(),
        lastAccessAt: lead.last_access_at.toISOString(),
        accessCount: lead.access_count,
        source: lead.source,
        utmSource: lead.utm_source ?? undefined,
        utmMedium: lead.utm_medium ?? undefined,
        utmCampaign: lead.utm_campaign ?? undefined,
        utmTerm: lead.utm_term ?? undefined,
        utmContent: lead.utm_content ?? undefined,
      })),
    }
  }
}
