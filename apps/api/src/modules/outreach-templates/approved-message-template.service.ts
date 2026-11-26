import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  computeHierarchyLevel,
  displayCompanyName,
  personaForHierarchyLevel,
  renderApprovedTemplate,
  templateReadiness,
  type ApprovedTemplateBlocked,
  type ApprovedTemplateCandidate,
  type ApprovedTemplateCandidatesResponse,
  type ApprovedTemplateChannel,
  type ApprovedTemplateScenarioId,
  type OutreachPersona,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ApprovedMessageTemplateEntity } from '../../database/entities/approved-message-template.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'

export type ApprovedMessageTemplateCtx = { userId: string; workspaceId: string }

/** #3417 — les clés de preuve que ce lot sait lire, sur des colonnes RÉELLES
 *  déjà en base (jamais une preuve inventée pour satisfaire un modèle). Une
 *  seule aujourd'hui : d'autres s'ajoutent quand un modèle en réclame une que
 *  ce module ne sait pas encore lire — jamais approximée.
 *
 *  #3417 (recette 02/10) — « signal récent » se lit sur les signaux RATTACHÉS
 *  AU CONTACT (`contacts.signals`, l'onglet Signaux de sa fiche), jamais sur
 *  ceux du compte : un message adressé à une personne qui dit « j'ai repéré un
 *  signal » ne se prouve pas par un signal que cette personne ne porte pas. */
function presentEvidence(contact: Pick<ContactEntity, 'signals'>): Set<string> {
  const evidence = new Set<string>()
  if (contact.signals && contact.signals.length > 0) evidence.add('recent_signal')
  return evidence
}

@Injectable()
export class ApprovedMessageTemplateService {
  constructor(
    @InjectRepository(ApprovedMessageTemplateEntity)
    private readonly templates: Repository<ApprovedMessageTemplateEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * #3417 — les modèles approuvés candidats pour CE contact, sur UN canal et
   * UN scénario choisis par le commercial (aucune dérivation automatique du
   * scénario dans cette tranche : la relation d'un compte se lit aujourd'hui
   * sous DEUX vocabulaires différents selon le chemin — celui de
   * `resolveRelationshipEvidence` (`cadence-templates.ts`, neuf états) et
   * celui d'`OUTREACH_SCENARIO_IDS` — et les deux ne se recouvrent pas
   * complètement ; en choisir un pour cette bibliothèque écrirait une
   * TROISIÈME correspondance silencieuse plutôt que de réutiliser l'une des
   * deux. `persona`, lui, réutilise directement le paramètre déjà choisi par
   * le commercial dans le composer (`ComposerParameters`, `@bellum/contracts`
   * `OUTREACH_PERSONAS`) quand il est fourni ; omis, tous les personas.
   *
   * Prêt = rendu (variables toutes connues) ET preuves requises présentes ;
   * sinon bloqué, avec la raison et ce qui manque NOMMÉS (#3417 : un modèle
   * dont une preuve manque ne se propose jamais comme prêt à envoyer, mais il
   * reste visible, avec sa raison — jamais silencieusement absent).
   */
  async candidatesForContact(
    ctx: ApprovedMessageTemplateCtx,
    contactId: string,
    channel: ApprovedTemplateChannel,
    scenario: ApprovedTemplateScenarioId,
    persona: OutreachPersona | null,
  ): Promise<ApprovedTemplateCandidatesResponse> {
    const contact = await this.contacts.findOne({
      where: { id: contactId, ...workspaceScopeWhere(ctx.workspaceId) },
    })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')

    const account = contact.account_id
      ? await this.accounts.findOne({ where: { id: contact.account_id, ...workspaceScopeWhere(ctx.workspaceId) } })
      : null

    const candidates = await this.templates.find({
      where: { scenario, channel, status: 'active' },
      order: { sequence_step: 'ASC' },
    })
    // #3697.9 — un persona CHOISI filtre (comportement historique). Sans choix, le RÔLE du contact
    // ordonne : trames de son niveau d'abord, puis celles sans persona, puis les autres — jamais
    // de trame écartée (`c76_role_reordonne_jamais_ne_filtre`). Poste inconnu ⇒ aucun ordre deviné.
    const matching = persona
      ? candidates.filter(template => !template.persona || template.persona === persona)
      : orderByRole(candidates, personaForHierarchyLevel(computeHierarchyLevel(contact.title)))

    const values = {
      prenom: (contact.full_name || '').trim().split(/\s+/)[0] ?? '',
      entreprise: displayCompanyName(account?.company_name || contact.entity || ''),
    }
    const evidence = presentEvidence(contact)

    const ready: ApprovedTemplateCandidate[] = []
    const blocked: ApprovedTemplateBlocked[] = []
    for (const template of matching) {
      const dto = this.toDto(template)
      const readiness = templateReadiness(dto, evidence)
      if (!readiness.ready) {
        blocked.push({ ...dto, reason: 'evidence_missing', missing: readiness.missingEvidence })
        continue
      }
      const rendered = renderApprovedTemplate(dto, values)
      if (!rendered.ok) {
        blocked.push({ ...dto, reason: 'variables_missing', missing: rendered.missingVariables })
        continue
      }
      ready.push({ ...dto, renderedText: rendered.text })
    }
    return { ready, blocked }
  }

  private toDto(template: ApprovedMessageTemplateEntity) {
    return {
      id: template.id,
      scenario: template.scenario,
      channel: template.channel,
      persona: template.persona,
      sequenceStep: template.sequence_step,
      delayDays: template.delay_days,
      version: template.version,
      source: template.source,
      exactText: template.exact_text,
      variables: template.variables,
      requiredEvidence: template.required_evidence,
      forbiddenClaims: template.forbidden_claims,
      status: template.status,
    }
  }
}

/** Tri STABLE : le persona du rôle, puis sans persona, puis le reste. Sans rôle connu, l'ordre d'origine. */
function orderByRole<T extends { persona: string | null }>(templates: readonly T[], role: OutreachPersona | null): T[] {
  if (!role) return [...templates]
  const rank = (template: T) => (template.persona === role ? 0 : template.persona === null ? 1 : 2)
  return templates
    .map((template, index) => ({ template, index }))
    .sort((a, b) => rank(a.template) - rank(b.template) || a.index - b.index)
    .map(item => item.template)
}
