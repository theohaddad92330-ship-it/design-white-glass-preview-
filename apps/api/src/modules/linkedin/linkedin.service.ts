import type { LinkedInFollowUp, LinkedInInteraction, LinkedInInteractionKind, PostIdea } from '@bellum/contracts'
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { LinkedInInteractionEntity } from '../../database/entities/linkedin-interaction.entity'
import { CrmService } from '../crm/crm.service'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { contactGestureWhere } from '../contacts/contact-gesture-scope'
import { pendingFollowUps, type InteractionFact } from './linkedin-follow-ups'

/**
 * Les sujets joués en démonstration.
 *
 * Écrits en dur et ancrés sur le jeu de données fictif : ils montrent la FORME
 * du livrable — un angle, une raison, une première phrase, et surtout la source
 * affichée — sans appeler de modèle depuis un espace public.
 */
function demoPostIdeas(): PostIdea[] {
  return [
    {
      angle:
        'Ce que trois mois sur un programme de refonte de parcours commande apprennent sur la conduite du changement',
      whyNow: 'Un programme de transformation vient d’être annoncé chez un compte suivi.',
      openingLine:
        'On parle beaucoup d’outils. Le vrai sujet d’une refonte de parcours commande, c’est qui décide quoi.',
      groundedOn: 'Dossier de démonstration — programme de transformation annoncé',
    },
    {
      angle: 'Pourquoi l’hébergement de données de santé change la façon de staffer une équipe',
      whyNow: 'Un compte suivi a ouvert un chantier d’hébergement de données de santé.',
      openingLine: 'Une contrainte réglementaire ne se sous-traite pas : elle se conçoit avec l’équipe qui livre.',
      groundedOn: 'Dossier de démonstration — chantier d’hébergement de données de santé',
    },
  ]
}

/**
 * LinkedIn sans scraping.
 *
 * Le §5.10 demande de suivre les connexions, de journaliser les interactions
 * dans le CRM et de proposer des sujets de publication. Le scraping est refusé
 * — violation des CGU, et c'est le compte de l'UTILISATEUR qui serait banni.
 *
 * Le chemin retenu donne le même résultat sans exposer personne : le commercial
 * déclare ce qu'il a fait, Bellum s'en souvient et le relance au bon moment.
 * Personne ne se souvient de trente invitations envoyées ; une base, si.
 */
@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name)

  constructor(
    @InjectRepository(LinkedInInteractionEntity)
    private readonly interactions: Repository<LinkedInInteractionEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly ia: IaClient,
    @Optional() private readonly esnProfile?: EsnProfileService,
    // Sans CRM connecté, l'interaction est quand même journalisée chez nous :
    // c'est elle qui pilote la relance. Le CRM est un miroir, pas la source.
    @Optional() private readonly crm?: CrmService,
  ) {}

  /**
   * Journalise une interaction déclarée.
   *
   * Le contact est relu par son id ET son propriétaire : un identifiant deviné
   * ne doit pas pouvoir écrire dans le journal de quelqu'un d'autre.
   *
   * Le reflet dans le CRM est best-effort. Un CRM indisponible ne doit pas
   * empêcher d'enregistrer un fait — sinon le commercial cesse de journaliser,
   * et la relance ne part plus.
   */
  async record(
    userId: string,
    input: { contactId: string; kind: LinkedInInteractionKind; occurredAt?: string; note?: string },
  ): Promise<LinkedInInteraction> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({ where: contactGestureWhere(workspaceId, userId, input.contactId) })
    if (!contact) throw new NotFoundException('Contact introuvable.')

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
    const saved = await this.interactions.save(
      this.interactions.create({
        workspace_id: workspaceId,
        user_id: userId,
        contact_id: input.contactId,
        kind: input.kind,
        occurred_at: occurredAt,
        note: input.note?.trim() || null,
      }),
    )

    void this.mirrorToCrm(userId, contact, input.kind, input.note)

    return {
      id: saved.id,
      contactId: saved.contact_id,
      kind: saved.kind,
      occurredAt: occurredAt.toISOString(),
      note: saved.note,
    }
  }

  /** Le journal d'un contact, du plus récent au plus ancien. */
  async listForContact(userId: string, contactId: string): Promise<LinkedInInteraction[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.interactions.find({
      where: { ...workspaceScopeWhere(workspaceId), contact_id: contactId },
      order: { occurred_at: 'DESC' },
      take: 50,
    })
    return rows.map(row => ({
      id: row.id,
      contactId: row.contact_id,
      kind: row.kind,
      occurredAt: row.occurred_at.toISOString(),
      note: row.note,
    }))
  }

  /** Les connexions acceptées restées sans réponse au-delà du délai. */
  async followUps(userId: string, afterDays: number): Promise<LinkedInFollowUp[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.interactions.find({
      where: workspaceScopeWhere(workspaceId),
      order: { occurred_at: 'ASC' },
    })
    if (rows.length === 0) return []

    const names = new Map<string, string | null>()
    const contacts = await this.contacts.find({
      where: contactGestureWhere(workspaceId, userId, [...new Set(rows.map(row => row.contact_id))]),
    })
    for (const contact of contacts) names.set(contact.id, contact.full_name ?? null)

    const facts: InteractionFact[] = rows.map(row => ({
      contactId: row.contact_id,
      contactName: names.get(row.contact_id) ?? null,
      kind: row.kind,
      occurredAt: row.occurred_at.toISOString(),
    }))
    return pendingFollowUps(facts, { now: new Date(), afterDays })
  }

  /**
   * Des SUJETS de publication, ancrés dans ce que l'ESN fait réellement.
   *
   * Le contexte vient du profil de l'espace, pas d'une saisie libre : un
   * commercial qui doit décrire son ESN avant chaque suggestion ne s'en sert pas
   * deux fois. Un profil vide produit MOINS de sujets — c'est le prompt qui le
   * garantit, et le routeur IA qui écarte ceux sans ancrage.
   */
  async postIdeas(userId: string, objective?: string): Promise<PostIdea[]> {
    // Salle de démonstration : aucun appel modèle. Le bandeau promet « aucun
    // crédit consommé, analyses réelles désactivées » — un appel Claude
    // déclenché par un visiteur le contredirait, et le compte rendu de
    // rendez-vous applique déjà cette règle. Vu en production : cette route
    // appelait bien le modèle depuis l'espace de démonstration.
    if (await this.workspaceContext.isDemoWorkspace(userId)) return demoPostIdeas()

    let offers = ''
    let sectors = ''
    if (this.esnProfile) {
      try {
        const answers = await this.esnProfile.getAnswers(userId)
        offers = (answers.expertise_areas ?? []).join(', ')
        sectors = (answers.target_sectors ?? []).join(', ')
      } catch (error) {
        // Un profil illisible donne moins de sujets, pas une erreur.
        this.logger.warn('Profil ESN illisible — les sujets seront proposés sans lui', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const envelope = await this.ia.postIdeas({
      esnOffers: offers,
      signals: sectors,
      objective: objective ?? '',
    })
    const data = (envelope?.data ?? {}) as Record<string, unknown>
    const ideas = Array.isArray(data['ideas']) ? (data['ideas'] as unknown[]) : []
    return (
      ideas
        .map(item => {
          const row = (item ?? {}) as Record<string, unknown>
          return {
            angle: String(row['angle'] ?? '').trim(),
            whyNow: String(row['why_now'] ?? '').trim(),
            openingLine: String(row['opening_line'] ?? '').trim(),
            groundedOn: String(row['grounded_on'] ?? '').trim(),
          }
        })
        // Deuxième filtre après celui du routeur IA : un sujet sans ancrage est un
        // post générique, c'est-à-dire du bruit de plus sur un fil professionnel.
        .filter(idea => idea.angle && idea.groundedOn)
    )
  }

  /** Reflète l'interaction sur la fiche CRM du contact. Best-effort, jamais bloquant. */
  private async mirrorToCrm(
    userId: string,
    contact: ContactEntity,
    kind: LinkedInInteractionKind,
    note?: string,
  ): Promise<void> {
    if (!this.crm) return
    try {
      const record = await this.crm.findContactRecord(userId, contact.email)
      if (!record) return
      const label: Record<LinkedInInteractionKind, string> = {
        connection_sent: 'Invitation envoyée',
        connection_accepted: 'Invitation acceptée',
        message_sent: 'Message envoyé',
        reply_received: 'Réponse reçue',
        post_engagement: 'Interaction sur une publication',
      }
      // La capacité est nommée, pas l'éditeur (doctrine du 02/08) : « réseau
      // professionnel », jamais le nom du réseau, dans une note qui circule.
      const body = [`Réseau professionnel — ${label[kind]}`, note?.trim()].filter(Boolean).join('\n')
      await this.crm.logActivity(userId, record.recordId, body)
    } catch (error) {
      this.logger.warn('Reflet CRM de l’interaction en échec (non bloquant)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
