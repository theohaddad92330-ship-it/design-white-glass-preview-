import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { NeedDocument, NeedDocumentKind, NeedDocumentStatus } from '@bellum/contracts'
import { NeedDocumentEntity } from '../../database/entities/need-document.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'

function toNeedDocument(row: NeedDocumentEntity): NeedDocument {
  return {
    id: row.id,
    needId: row.need_id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * Les DOCUMENTS d'un besoin — devis, NDA, contrat cadre — et leur statut.
 * Voir `need-document.ts` (`@bellum/contracts`) pour ce que ça ferme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE LA LECTURE SEULE À L'ÉCRITURE (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce service était en lecture seule, et le disait : « rien dans la maquette
 * n'offre d'en créer ou d'en changer le statut […] un bouton qui n'écrirait
 * rien serait une case décorative ». C'était vrai tant que rien ne pouvait
 * porter le FICHIER — la fiche montrait Devis / NDA / Contrat cadre avec leur
 * statut, et rien derrière.
 *
 * Le stockage existe maintenant, donc les deux gestes existent : **déposer une
 * pièce** et **dire où elle en est**. Le second sans le premier aurait été le
 * défaut inverse — un statut qu'on fait avancer sur un document que personne ne
 * peut ouvrir.
 *
 * ⚠️ Ce service ne connaît PAS le stockage, et c'est délibéré (GA-07 — un
 * domaine n'appelle pas le service d'un autre) : il reçoit un identifiant
 * d'objet déjà rangé, et le garde. C'est le contrôleur, qui a tranché le droit,
 * qui fait se rencontrer les deux.
 *
 * ⚠️ Toute lecture ET toute écriture sont bornées par `workspace_id` ET par
 * `need_id`. Le second n'est pas redondant : sans lui, un identifiant de
 * document valide dans l'espace laisserait changer le statut d'une pièce qui
 * pend d'un AUTRE besoin — une erreur silencieuse, jamais un refus.
 */
@Injectable()
export class NeedDocumentsService {
  constructor(
    @InjectRepository(NeedDocumentEntity) private readonly documents: Repository<NeedDocumentEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
  ) {}

  async list(workspaceId: string, needId: string): Promise<NeedDocument[]> {
    await this.requireNeed(workspaceId, needId)

    const rows = await this.documents.find({
      where: { workspace_id: workspaceId, need_id: needId },
      order: { created_at: 'ASC' },
    })
    return rows.map(toNeedDocument)
  }

  /**
   * DÉPOSE un document sur un besoin.
   *
   * `storageObjectId` est OBLIGATOIRE ici : ce geste-là est « j'ai reçu le
   * devis signé, le voici ». Suivre un document qu'on n'a pas encore reçu reste
   * possible — la colonne est nullable et les lignes d'avant ce lot en
   * témoignent — mais ce n'est pas ce que fait ce chemin, et le confondre
   * rendrait un bouton « Déposer » capable de ne rien déposer.
   */
  async create(
    workspaceId: string,
    needId: string,
    input: { kind: NeedDocumentKind; name: string; storageObjectId: string },
  ): Promise<NeedDocument> {
    await this.requireNeed(workspaceId, needId)

    const saved = await this.documents.save(
      this.documents.create({
        workspace_id: workspaceId,
        need_id: needId,
        kind: input.kind,
        name: input.name,
        // `draft` est le défaut ORDINAIRE : une pièce déposée n'est pas encore
        // partie chez le client. Poser `sent` d'office affirmerait un envoi que
        // personne n'a fait.
        status: 'draft',
        storage_object_id: input.storageObjectId,
      }),
    )
    return toNeedDocument(saved)
  }

  /**
   * FAIT AVANCER un document : envoyé, en attente, signé, refusé.
   *
   * Aucune transition n'est interdite, et c'est un choix : un devis peut
   * repartir en brouillon parce qu'on s'est trompé de version, une NDA
   * « signée » peut redevenir « en attente » parce que le client a renvoyé une
   * autre page. Un automate de transitions ici aurait bloqué des corrections
   * légitimes en promettant une rigueur que le monde réel ne tient pas.
   */
  async updateStatus(
    workspaceId: string,
    needId: string,
    documentId: string,
    status: NeedDocumentStatus,
  ): Promise<NeedDocument> {
    const row = await this.documents.findOne({
      where: { id: documentId, workspace_id: workspaceId, need_id: needId },
    })
    // Défense en profondeur : le document d'un autre espace — ou d'un autre
    // besoin du même espace — n'existe pas ici.
    if (!row) throw new NotFoundException('Document introuvable sur ce besoin.')

    row.status = status
    return toNeedDocument(await this.documents.save(row))
  }

  /**
   * Le lien document → objet rangé, pour ce besoin.
   *
   * Un document SANS fichier est ABSENT de la table rendue : c'est une réponse
   * (« on suit une NDA qu'on n'a pas encore reçue »), pas un trou à combler.
   */
  async objectIdsOf(workspaceId: string, needId: string): Promise<Map<string, string>> {
    await this.requireNeed(workspaceId, needId)
    const rows = await this.documents.find({
      where: { workspace_id: workspaceId, need_id: needId },
      order: { created_at: 'ASC' },
    })
    return new Map(
      rows.flatMap(row => (row.storage_object_id ? [[row.id, row.storage_object_id] as [string, string]] : [])),
    )
  }

  /** Le besoin existe-t-il DANS cet espace ? Le seul chemin vers ses pièces. */
  private async requireNeed(workspaceId: string, needId: string): Promise<void> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Besoin introuvable')
  }
}
