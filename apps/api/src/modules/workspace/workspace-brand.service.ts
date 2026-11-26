import { resolveBrand, type Brand } from '@bellum/contracts'
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceContextService } from './workspace-context.service'

/**
 * LA MARQUE D'UN ESPACE — lecture et écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX PORTES D'ENTRÉE, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 * `getForUser` répond à « quelle marque pour l'espace de CET utilisateur ? » —
 * c'est le chemin de l'application, après authentification.
 *
 * `getForDomain` répond à « quelle marque pour CET hôte ? » — c'est le chemin
 * de la page de connexion, AVANT toute authentification. Sans lui, un client
 * en marque blanche verrait notre logo tant qu'il n'est pas connecté, c'est-à-
 * dire précisément sur l'écran que ses propres clients voient en premier.
 *
 * ⚠️ `getForDomain` est donc appelable SANS JWT. C'est ce qui oblige à ne
 * jamais y rendre autre chose que la marque : pas d'identifiant d'espace, pas
 * de compte, pas de nombre. Un attaquant qui balaie les domaines n'apprend que
 * ce qu'il verrait en ouvrant la page.
 */
@Injectable()
export class WorkspaceBrandService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /** La marque de l'espace actif. N'importe quel membre peut la lire. */
  async getForUser(userId: string): Promise<Brand> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return this.resolve(workspace)
  }

  /**
   * La marque d'un espace DONNÉ, sans passer par un utilisateur.
   *
   * Sert aux chemins qui connaissent déjà l'espace mais n'ont pas de session —
   * un lien de partage public, un e-mail sortant. `null` rend la marque du
   * produit : une ligne écrite avant que la colonne `workspace_id` ne soit
   * remplie n'est pas une erreur, c'est un partage d'avant la multi-équipe.
   */
  async getForWorkspace(workspaceId: string | null | undefined): Promise<Brand> {
    if (!workspaceId) return resolveBrand(null)
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return this.resolve(workspace)
  }

  /**
   * L'ADRESSE D'EXPÉDITION déclarée par l'espace, ou `null`.
   *
   * Séparée de `getForWorkspace` parce qu'elle n'est PAS de l'affichage :
   * `Brand` est ce qu'un écran montre, l'expéditeur est un en-tête SMTP. Les
   * fondre exposerait une adresse interne sur la route publique `GET brand`.
   *
   * ⚠️ Lue à l'ENVOI, jamais mise en cache : elle se change dans Réglages ›
   * Marque, et un message parti de l'ancienne adresse après le changement
   * serait un défaut invisible — il n'y a pas d'écran qui montre l'expéditeur
   * d'un message déjà envoyé.
   */
  /**
   * Théo D settings-espace.N5 — la signature et le pied de document de l'espace actif. Tout membre les LIT (un
   * document part au nom de l'espace) ; `null` = rien posé, jamais une valeur par défaut.
   */
  async getDocumentIdentityForUser(userId: string): Promise<DocumentIdentity> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.getDocumentIdentity(workspaceId)
  }

  async getDocumentIdentity(workspaceId: string | null | undefined): Promise<DocumentIdentity> {
    if (!workspaceId) return { signature: null, footer: null }
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return {
      signature: workspace?.document_signature?.trim() || null,
      footer: workspace?.document_footer?.trim() || null,
    }
  }

  async getSendingAddress(workspaceId: string | null | undefined): Promise<string | null> {
    if (!workspaceId) return null
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return workspace?.brand_email_from?.trim() || null
  }

  /**
   * La marque servie sur un nom d'hôte, ou celle du produit.
   *
   * ⚠️ Le nom d'hôte est NORMALISÉ ici et pas seulement à l'écriture : il
   * arrive de l'en-tête `Host`, donc du client, et un navigateur a le droit
   * d'envoyer `APP.ACME.COM` ou `app.acme.com:443`. Sans ce nettoyage la
   * comparaison échouerait en silence et le client tomberait sur NOTRE marque
   * — le défaut se verrait chez lui, jamais chez nous.
   */
  async getForDomain(host: string | undefined): Promise<Brand> {
    const domain = normalizeHost(host)
    if (!domain) return resolveBrand(null)
    const workspace = await this.workspaces.findOne({ where: { custom_domain: domain } })
    return this.resolve(workspace)
  }

  /**
   * Enregistre la marque. Propriétaire ou administrateur uniquement : c'est un
   * réglage qui change ce que TOUTE l'équipe — et tous ses clients — voient.
   */
  async update(userId: string, patch: BrandPatch): Promise<Brand> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner', 'admin'])

    /*
     * ⚠️ LA SALLE DE DÉMONSTRATION NE SE RENOMME PAS.
     *
     * Le rôle ne suffit PAS à protéger ici, et c'est ce qui rend ce contrôle
     * nécessaire : un visiteur de la démo publique est `owner` de sa salle —
     * c'est ce qui lui permet de tout essayer. Or la marque est l'un des rares
     * réglages qui vit sur la ligne `workspaces` elle-même, laquelle N'EST PAS
     * purgée entre deux baux (c'est le CONTENU qui l'est). Un nom posé par un
     * visiteur survivrait donc à son passage, et le suivant — un prospect —
     * ouvrirait le produit sous ce nom-là.
     *
     * Un 403 plutôt qu'un no-op silencieux : l'écran doit DIRE pourquoi, sinon
     * le visiteur croit que la fonctionnalité est cassée.
     */
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new ForbiddenException('La marque ne se change pas dans la salle de démonstration.')
    }

    const update: Partial<WorkspaceEntity> = {}
    // ⚠️ `undefined` = « ne touche pas », `null` = « efface ». Les confondre
    // ferait d'un formulaire qui n'envoie qu'un champ un formulaire qui efface
    // les trois autres.
    if (patch.brandName !== undefined) update.brand_name = emptyToNull(patch.brandName)
    if (patch.copilotName !== undefined) update.copilot_name = emptyToNull(patch.copilotName)
    if (patch.brandLogoUrl !== undefined) update.brand_logo_url = emptyToNull(patch.brandLogoUrl)
    if (patch.brandAccent !== undefined) update.brand_accent = normalizeAccent(patch.brandAccent)
    if (patch.brandEmailFrom !== undefined) update.brand_email_from = emptyToNull(patch.brandEmailFrom)
    if (patch.documentSignature !== undefined) update.document_signature = emptyToNull(patch.documentSignature)
    if (patch.documentFooter !== undefined) update.document_footer = emptyToNull(patch.documentFooter)

    if (patch.customDomain !== undefined) {
      const domain = normalizeHost(patch.customDomain) ?? null
      if (domain) await this.assertDomainIsFree(domain, workspaceId)
      update.custom_domain = domain
    }

    if (Object.keys(update).length > 0) {
      const result = await this.workspaces.update({ id: workspaceId }, update)
      if (result.affected === 0) throw new BadRequestException('Espace introuvable.')
    }

    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return this.resolve(workspace)
  }

  /**
   * Un domaine appartient à UN espace.
   *
   * ⚠️ Ce contrôle double l'index unique posé en migration, et ce n'est pas
   * une redondance inutile : l'index produirait une erreur Postgres brute
   * (« duplicate key value violates unique constraint ») que l'écran
   * afficherait telle quelle. Ici on rend un 409 qui DIT ce qui se passe. Et
   * l'index reste, parce que deux requêtes concurrentes passeraient toutes
   * deux ce contrôle — la base est la seule à pouvoir trancher une course.
   */
  private async assertDomainIsFree(domain: string, workspaceId: string): Promise<void> {
    const taken = await this.workspaces.findOne({
      where: { custom_domain: domain, id: Not(workspaceId) },
    })
    if (taken) throw new ConflictException('Ce domaine est déjà utilisé par un autre espace.')
  }

  private resolve(workspace: WorkspaceEntity | null): Brand {
    if (!workspace) return resolveBrand(null)
    return resolveBrand({
      brandName: workspace.brand_name,
      copilotName: workspace.copilot_name,
      brandLogoUrl: workspace.brand_logo_url,
      brandAccent: workspace.brand_accent,
    })
  }
}

/** La signature proposée et le pied de document d'un espace — `null` quand rien n'est posé. */
export type DocumentIdentity = { signature: string | null; footer: string | null }

type BrandPatch = {
  brandName?: string | null
  copilotName?: string | null
  brandLogoUrl?: string | null
  brandAccent?: string | null
  customDomain?: string | null
  brandEmailFrom?: string | null
  documentSignature?: string | null
  documentFooter?: string | null
}

/** `''` et `'   '` veulent dire « efface », pas « enregistre une chaîne vide ». */
function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeAccent(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

/**
 * Un nom d'hôte, ramené à la forme que la base stocke.
 *
 * Retire le schéma, le port, le chemin, le point final absolu et la casse.
 * Rend `null` sur ce qui ne peut pas être un domaine — jamais une valeur
 * approchée : mieux vaut tomber sur la marque du produit que servir la marque
 * d'un AUTRE client sur une comparaison approximative.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null
  const withoutScheme = raw.trim().replace(/^[a-z]+:\/\//i, '')
  const host = withoutScheme.split('/')[0]?.split(':')[0]?.replace(/\.$/, '').toLowerCase()
  if (!host) return null
  // Le même motif que la contrainte SQL : ce qui n'y entrerait pas ne doit pas
  // servir à chercher.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null
  return host
}
