import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DemoLeadEntity } from '../../database/entities/demo-lead.entity'
import { normalizeEmail, type DemoLeadJobTitle } from './demo-lead'

type RegisterInput = {
  firstName: string
  lastName: string
  email: string
  jobTitle: DemoLeadJobTitle
  company: string
  phone?: string
  deviceId: string
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    term: string | null
    content: string | null
  }
}

type RegisterOutcome = { created: boolean; lead: DemoLeadEntity }
type TouchOutcome = { firstName: string }

/**
 * #2705 — la DÉCISION du formulaire de démo, séparée du contrôleur (le
 * contrôleur, lui, décide s'il faut prévenir #2707 — composition autorisée,
 * hors périmètre GA-07 — ce service ne connaît PAS l'alerte).
 */
@Injectable()
export class DemoLeadService {
  constructor(@InjectRepository(DemoLeadEntity) private readonly repo: Repository<DemoLeadEntity>) {}

  /**
   * « Aucun doublon : une ligne par e-mail normalisé » (#2705). Une seconde
   * soumission du même e-mail MET À JOUR la ligne existante (dernier accès,
   * compteur, et le cookie d'appareil le plus récent) au lieu d'en créer une
   * seconde — `created: false` dit au contrôleur de ne PAS déclencher #2707.
   */
  async registerOrTouch(input: RegisterInput): Promise<RegisterOutcome> {
    const email = normalizeEmail(input.email)
    const now = new Date()
    const existing = await this.repo.findOne({ where: { email } })

    if (existing) {
      existing.last_access_at = now
      existing.access_count += 1
      existing.device_id = input.deviceId
      const saved = await this.repo.save(existing)
      return { created: false, lead: saved }
    }

    const created = this.repo.create({
      first_name: input.firstName,
      last_name: input.lastName,
      email,
      job_title: input.jobTitle,
      company: input.company,
      phone: input.phone ?? null,
      device_id: input.deviceId,
      source: 'demo',
      first_access_at: now,
      last_access_at: now,
      access_count: 1,
      utm_source: input.utm.source,
      utm_medium: input.utm.medium,
      utm_campaign: input.utm.campaign,
      utm_term: input.utm.term,
      utm_content: input.utm.content,
    })
    const saved = await this.repo.save(created)
    return { created: true, lead: saved }
  }

  /**
   * #2705.6 — le visiteur qui revient : `bellum_did` porte déjà un lead ⇒ le
   * formulaire ne se réaffiche pas. `null` = aucun lead pour ce cookie (le
   * contrôleur doit alors router vers le formulaire), jamais une ligne
   * devinée.
   */
  async touchByDevice(deviceId: string): Promise<TouchOutcome | null> {
    const existing = await this.repo.findOne({ where: { device_id: deviceId } })
    if (!existing) return null
    existing.last_access_at = new Date()
    existing.access_count += 1
    await this.repo.save(existing)
    return { firstName: existing.first_name }
  }

  /** #2706.1 — le back-office : « la plus récente d'abord ». */
  async listMostRecentFirst(): Promise<DemoLeadEntity[]> {
    return this.repo.find({ order: { last_access_at: 'DESC' } })
  }
}
