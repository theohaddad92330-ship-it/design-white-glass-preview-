import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  decideFieldWrite,
  ESTIMATED_FIELD_SOURCE,
  learnEmailPattern,
  renderEmailPattern,
  splitPersonName,
} from '@bellum/contracts'
import { isPersonErasureKeyConfigured } from '../../common/person-erasure-hmac'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import {
  EMAIL_ESTIMATE_PORTS,
  EMAIL_ESTIMATE_PROBE,
  type EmailEstimatePorts,
  type EmailEstimateProbe,
} from './module-tokens'
import { isErasedPerson, personErasureFingerprints } from './person-erasure-fingerprint'

/** Pourquoi aucune adresse n'a été estimée — toujours une raison lisible, jamais un silence. */
type EmailEstimateSkipReason =
  | 'not_found'
  | 'unavailable'
  | 'demo'
  | 'has_email'
  | 'no_name'
  | 'opposed'
  | 'no_pattern'
  | 'duplicate'
  | 'suppressed'
  | 'erased'
  | 'unverifiable'
  | 'undeliverable'
  | 'protected'

type EmailEstimateOutcome =
  | { kind: 'estimated'; email: string; verifiedAt: string; pattern: string }
  | { kind: 'skipped'; reason: EmailEstimateSkipReason }

/**
 * #4016 L4.1 — L'E-MAIL DÉDUIT DU MOTIF DE L'ENTREPRISE, PUIS VÉRIFIÉ
 * (décision Louis 11/10/2026, `c95_estimation_badgee`).
 *
 * Quand une personne n'a pas d'adresse, Bellum lit les adresses VÉRIFIÉES déjà
 * connues sur son compte (même espace — jamais un autre), en déduit le motif
 * (`prenom.nom@…`), l'applique, puis le VÉRIFIE (MX + SMTP, sans jamais
 * envoyer). Vérifiée : l'adresse s'écrit sur la fiche en provenance
 * `inferred` (« estimé, vérifié le … ») — jamais `email_verified`. Invérifiable :
 * rien ne s'écrit, rien ne s'affiche.
 *
 * L'ORDRE des portes est délibéré : tout ce qui protège une personne (fiche
 * effacée, arrêt demandé, opposition, empreinte d'effacement) passe AVANT la
 * sonde — on n'interroge même pas le serveur de messagerie pour quelqu'un qui
 * a demandé qu'on cesse.
 *
 * Coût : aucun crédit, aucun fournisseur payant. Latence : bornée par
 * `EMAIL_ESTIMATE_PROBE_TIMEOUT_MS`, le seul réglage (0 = éteint).
 */
@Injectable()
export class EmailEstimateService {
  private readonly logger = new Logger(EmailEstimateService.name)

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(PersonErasureEntity) private readonly erasures: Repository<PersonErasureEntity>,
    @InjectRepository(ContactStopEntity) private readonly stops: Repository<ContactStopEntity>,
    @Inject(EMAIL_ESTIMATE_PORTS) private readonly ports: EmailEstimatePorts,
    @Inject(EMAIL_ESTIMATE_PROBE) private readonly probe: EmailEstimateProbe,
  ) {}

  /** La fiche est lue SOUS la borne de l'espace (#2671.5) : jamais une ligne d'un autre espace. */
  async estimateFor(workspaceId: string, contactId: string): Promise<EmailEstimateOutcome> {
    const contact = await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) return skipped('not_found')
    // Écartée ou masquée à la main (#2297.41) : même porte que l'enrichissement.
    if (contact.deleted_at || contact.anonymized_at || contact.excluded_at) return skipped('unavailable')
    if ((contact.email ?? '').trim()) return skipped('has_email')
    // Une salle de démonstration ne sonde jamais un vrai serveur de messagerie :
    // l'e-mail estimé y est SEMÉ (`demo-dataset.ts`), craft rule n°9.
    const workspace = await this.contacts.query<{ is_demo: boolean | null }[]>(
      'SELECT is_demo FROM workspaces WHERE id = $1',
      [workspaceId],
    )
    if (workspace[0]?.is_demo === true) return skipped('demo')
    const name = splitPersonName(contact.full_name)
    if (!name) return skipped('no_name')

    // c69 — la personne a demandé qu'on cesse : on ne cherche même pas.
    const stop = await this.stops.findOne({ where: { workspace_id: workspaceId, contact_id: contact.id } })
    if (stop) return skipped('opposed')

    if (!contact.account_id) return skipped('no_pattern')
    const peers = await this.contacts.find({
      where: { workspace_id: workspaceId, account_id: contact.account_id, deleted_at: IsNull(), email_verified: true },
      select: { email: true, full_name: true, email_verified: true, anonymized_at: true },
    })
    const learned = learnEmailPattern(
      peers
        .filter(peer => !peer.anonymized_at)
        .map(peer => ({ email: peer.email, fullName: peer.full_name, verified: peer.email_verified === true })),
    )
    if (!learned) return skipped('no_pattern')
    const candidate = renderEmailPattern(learned.pattern, name, learned.domain)

    // Une autre fiche de l'espace porte déjà cette adresse : un homonyme ou un
    // doublon — dans les deux cas, l'écrire ici mentirait.
    const taken = await this.contacts.count({ where: { workspace_id: workspaceId, email: candidate } })
    if (taken > 0) return skipped('duplicate')

    if (await this.ports.isSuppressed(workspaceId, candidate)) return skipped('suppressed')
    if (await this.isErased(workspaceId, contact, candidate)) return skipped('erased')

    const verdict = await this.probe(candidate)
    if (verdict !== 'deliverable') return skipped(verdict)

    const sources = await this.ports.currentSources(contact.id)
    const decision = decideFieldWrite({
      incomingValue: candidate,
      incomingSource: ESTIMATED_FIELD_SOURCE,
      currentValue: contact.email,
      currentSource: sources.email ?? null,
    })
    if (!decision.write) return skipped('protected')

    // Écriture CONDITIONNELLE : une adresse posée entre-temps (humain,
    // enrichissement concurrent) gagne, toujours.
    const result = await this.contacts
      .createQueryBuilder()
      .update(ContactEntity)
      .set({ email: candidate })
      .where('id = :id', { id: contact.id })
      .andWhere("(email IS NULL OR btrim(email) = '')")
      .execute()
    if (!result.affected) return skipped('protected')

    const rule = `email_pattern:${learned.pattern}`
    await this.ports.commitEstimate({ workspaceId, contactId: contact.id, email: candidate, rule })
    this.logger.log('E-mail estimé et vérifié', { contactId: contact.id, tags: { rule, support: learned.support } })
    return { kind: 'estimated', email: candidate, verifiedAt: new Date().toISOString(), pattern: learned.pattern }
  }

  /** #2297 — la personne, avec l'adresse estimée, a-t-elle été effacée ? Sans
   *  clé d'empreinte sur un espace qui porte des effacements : on se tait. */
  private async isErased(workspaceId: string, contact: ContactEntity, candidate: string): Promise<boolean> {
    const rows = await this.erasures.find({ where: { workspace_id: workspaceId }, select: { fingerprints: true } })
    const erased = new Set(rows.flatMap(row => row.fingerprints ?? []))
    if (erased.size === 0) return false
    if (!isPersonErasureKeyConfigured()) return true
    const prints = personErasureFingerprints(workspaceId, {
      fullName: contact.full_name,
      email: candidate,
      linkedinUrl: contact.linkedin_url,
      accountId: contact.account_id,
    })
    return isErasedPerson(prints, erased)
  }
}

function skipped(reason: EmailEstimateSkipReason): EmailEstimateOutcome {
  return { kind: 'skipped', reason }
}
