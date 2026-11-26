import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common'
import {
  canErasePerson,
  isContactOwner,
  type ConsultantErasureResult,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@bellum/contracts'
import { DataSource, ILike, In, type EntityManager } from 'typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantAccountConsentEntity } from '../../database/entities/consultant-account-consent.entity'
import { ConsultantCvRewriteEntity } from '../../database/entities/consultant-cv-rewrite.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { ConsultantPushFeedbackEntity } from '../../database/entities/consultant-push-feedback.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { MarketVerificationReceiptEntity } from '../../database/entities/market-verification-receipt.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { MissionAssignmentEntity } from '../../database/entities/mission-assignment.entity'
import { OutgoingPaymentEntity } from '../../database/entities/outgoing-payment.entity'
import { PartnerCvPushEntity } from '../../database/entities/partner-cv-push.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { ReverseMarketDismissalEntity } from '../../database/entities/reverse-market-dismissal.entity'
import { ShortlistEntryEntity } from '../../database/entities/shortlist.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { TalentIdentityDecisionEntity } from '../../database/entities/talent-identity-decision.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { isPersonErasureKeyConfigured, PersonErasureKeyUnavailableError } from '../../common/person-erasure-hmac'
import { StorageClient } from '../storage/storage.client'
import { isErasedPerson, personErasureFingerprints } from '../contacts/person-erasure-fingerprint'
import { applyConsultantScope } from './consultant-scope'

/** Les jokers de `ILIKE` pris au pied de la lettre dans un nom. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

/**
 * Les empreintes d'un consultant : les MÊMES clés d'identité que celles d'un
 * contact (e-mail, profil public, nom), calculées par le MÊME code — un second
 * calcul dériverait, et la personne reviendrait par celui qui a dérivé. Un
 * consultant n'est vu chez aucun compte client : sa clé de nom vaut pour le
 * seul « compte » vide (`account:-`), jamais pour un homonyme d'une société.
 */
export function consultantErasureFingerprints(
  workspaceId: string,
  person: { full_name: string | null; email: string | null; public_profile_url: string | null },
): string[] {
  return personErasureFingerprints(workspaceId, {
    fullName: person.full_name,
    email: person.email,
    linkedinUrl: person.public_profile_url,
  })
}

/**
 * #3781 — « cette personne entrante a-t-elle été effacée ? », posée à l'ENTRÉE
 * d'une fiche (création, dépôt de CV) — la même question que la collecte de
 * contacts (`ContactsService.erasedFingerprints`), sur la MÊME table. Une
 * personne effacée n'est jamais recréée sans qu'on le lui demande : l'écran
 * dit pourquoi, il ne la recrée pas en silence.
 *
 * Sans espace, ou sans effacement dans l'espace, rien ne se calcule et la clé
 * d'empreinte n'est pas exigée. Avec des effacements mais sans clé : 503, comme
 * la collecte — on ne laisse pas revenir sans vérification.
 */
export async function isErasedConsultantIdentity(
  manager: EntityManager,
  workspaceId: string | null,
  person: { full_name: string | null; email: string | null; public_profile_url: string | null },
): Promise<boolean> {
  if (!workspaceId) return false
  const rows = await manager.find(PersonErasureEntity, {
    where: { workspace_id: workspaceId },
    select: { fingerprints: true },
  })
  const erased = new Set(rows.flatMap(row => row.fingerprints ?? []))
  if (erased.size === 0) return false
  if (!isPersonErasureKeyConfigured()) throw new PersonErasureKeyUnavailableError()
  return isErasedPerson(consultantErasureFingerprints(workspaceId, person), erased)
}

/**
 * #3781 — EFFACER DES PERSONNES DU VIVIER (RGPD art. 17), « supprimer
 * définitivement les archivés ou même les normaux » (retour bêta, 06/10/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANCHÉ SANS LOUIS : « SUPPRIMER » = L'EFFACEMENT RGPD, PAS UN DELETE
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctrine c67 : on archive, on ne supprime pas — SAUF l'effacement RGPD d'une
 * personne à sa demande. Un consultant est une personne ; le geste « supprimer
 * définitivement » emprunte donc le chemin que la doctrine a déjà ouvert pour
 * un contact (`PersonErasureService`) : mêmes droits (`canErasePerson`),
 * même refus en démonstration, même clé d'empreinte exigée (503 sans elle,
 * aucune ligne écrite), même trace `person_erasures` — qui a effacé, quand, et
 * des empreintes non réversibles, JAMAIS une donnée de la personne.
 *
 * L'ancien `DELETE /consultants/:id` n'est plus que le chemin d'une seule
 * fiche sans trace : il laissait des lignes orphelines (aucune clé étrangère
 * sur les affectations, les paiements…) et aucune empreinte — la personne
 * revenait au prochain import. Le geste d'écran passe désormais ici, y compris
 * pour UNE fiche.
 *
 * CE QUI PART, avec la fiche : ses compétences, expériences, documents (texte
 * extrait ET, depuis #4034, le fichier ORIGINAL rangé au stockage), versions de CV et réécritures, ses
 * messages préparés, ses candidatures, ses retours, ses décisions d'identité,
 * ses affectations TERMINÉES, ce que Laura retenait d'elle (par le lien,
 * puis par son nom COMPLET — jamais par un prénom seul), ses valeurs de champs
 * libres et son journal de modifications.
 *
 * CE QUI RESTE, parce que ce n'est pas à elle : les paiements sortants et les
 * feuilles de temps — pièces financières à conservation légale — dont le lien
 * vers elle est coupé (paiements) ou ne désigne plus personne (feuilles :
 * l'identifiant n'a plus de fiche à rejoindre, c'est un pseudonyme sans clé).
 *
 * UN GESTE, UN RÉSULTAT PAR PROFIL : une fiche refusée (hors espace, droit
 * manquant, affectation en cours) revient dans `skipped` avec sa raison et ne
 * fait pas échouer les autres.
 */
@Injectable()
export class ConsultantErasureService {
  private readonly logger = new Logger(ConsultantErasureService.name)

  constructor(
    private readonly dataSource: DataSource,
    /** #4034.6 — le magasin des ORIGINAUX de CV ; absent, rien n'y a été rangé. */
    @Optional() private readonly storage?: StorageClient,
  ) {}

  async eraseMany(input: {
    ids: readonly string[]
    userId: string
    workspaceId: string | null
    role: WorkspaceRole
    extraPermissions: readonly WorkspacePermission[]
  }): Promise<ConsultantErasureResult> {
    const { userId, workspaceId } = input
    const unique = [...new Set(input.ids)]
    // Sans espace actif, rien ne se borne : on refuse, on n'ouvre rien.
    if (!workspaceId) throw new ForbiddenException('Aucun espace actif : effacement impossible.')

    const workspace = await this.dataSource.getRepository(WorkspaceEntity).findOne({ where: { id: workspaceId } })
    if (workspace?.is_demo) {
      throw new BadRequestException("L'effacement d'une personne ne s'exerce pas dans un espace de démonstration.")
    }
    // Sans sa clé d'empreinte, l'effacement ne se replie sur rien : 503 AVANT
    // toute écriture — supprimer sans pouvoir poser d'empreinte laisserait la
    // personne revenir au prochain import.
    if (!isPersonErasureKeyConfigured()) throw new PersonErasureKeyUnavailableError()

    const found = await applyConsultantScope(
      this.dataSource.getRepository(ConsultantEntity).createQueryBuilder('c').where('c.id IN (:...ids)', {
        ids: unique,
      }),
      'c',
      workspaceId,
      userId,
    ).getMany()
    const byId = new Map(found.map(row => [row.id, row]))

    const skipped: ConsultantErasureResult['skipped'] = []
    const allowed: ConsultantEntity[] = []
    const today = new Date().toISOString().slice(0, 10)
    const openAssignments = await this.openAssignmentCounts(
      found.map(row => row.id),
      today,
    )
    for (const id of unique) {
      const row = byId.get(id)
      if (!row) {
        skipped.push({ consultant_id: id, reason: 'not_found' })
        continue
      }
      const owns = isContactOwner({ user_id: row.user_id, assigned_to: row.owner_user_id }, userId)
      if (!canErasePerson({ role: input.role, extraPermissions: input.extraPermissions, ownsContact: owns })) {
        skipped.push({ consultant_id: id, reason: 'forbidden' })
        continue
      }
      if ((openAssignments.get(id) ?? 0) > 0) {
        skipped.push({ consultant_id: id, reason: 'blocked' })
        continue
      }
      allowed.push(row)
    }
    if (allowed.length === 0) return { erased: [], erased_at: null, skipped }

    const erasedAt = new Date()
    const storagePaths = await this.dataSource.transaction(async manager =>
      this.eraseRows(manager, workspaceId, allowed, userId, erasedAt),
    )
    // #4034.6 — les ORIGINAUX de CV partent APRÈS la transaction : un retour
    // en arrière de la base ne laisse jamais une ligne pointer vers un fichier
    // déjà effacé. Un refus du magasin n'annule pas l'effacement ; il se
    // journalise sans rien de la personne (un compte, l'espace).
    if (storagePaths.length > 0 && this.storage) {
      const removed = await this.storage.remove(storagePaths)
      if (!removed) {
        this.logger.error(
          `#4034.6 — ${storagePaths.length} original(aux) de CV non effacé(s) du stockage sur l'espace ${workspaceId}`,
        )
      }
    }

    // Aucun nom, aucune adresse dans le journal : l'espace et un compte.
    this.logger.log(`Effacement RGPD art. 17 : ${allowed.length} consultant(s) effacé(s) sur l'espace ${workspaceId}`)
    return { erased: allowed.map(row => row.id), erased_at: erasedAt.toISOString(), skipped }
  }

  private async openAssignmentCounts(ids: readonly string[], today: string): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map()
    const rows = await this.dataSource.query<{ consultant_id: string; n: string }[]>(
      `SELECT consultant_id, count(*)::text AS n
         FROM mission_assignments
        WHERE consultant_id = ANY($1::uuid[])
          AND starts_on <= $2::date
          AND (ends_on IS NULL OR ends_on >= $2::date)
        GROUP BY consultant_id`,
      [ids, today],
    )
    return new Map(rows.map(row => [row.consultant_id, Number(row.n)]))
  }

  private async eraseRows(
    manager: EntityManager,
    workspaceId: string,
    rows: readonly ConsultantEntity[],
    userId: string,
    erasedAt: Date,
  ): Promise<string[]> {
    const ids = rows.map(row => row.id)
    // Une empreinte par personne : calculées AVANT la suppression de la ligne.
    const fingerprints = [...new Set(rows.flatMap(row => consultantErasureFingerprints(workspaceId, row)))]
    // #4034.6 — les chemins des ORIGINAUX, lus AVANT que leurs documents partent.
    const storageRows = await manager.query<{ storage_path: string | null }[]>(
      `SELECT storage_path FROM consultant_documents
        WHERE consultant_id = ANY($1::uuid[]) AND storage_path IS NOT NULL`,
      [ids],
    )
    const storagePaths = (storageRows ?? []).map(row => row.storage_path).filter((path): path is string => !!path)

    // Ce qui la NOMME, supprimé — les tables à clé étrangère suivraient seules
    // (cascade), l'explicite garde la liste lisible et couvre celles qui n'en
    // ont pas.
    await manager.delete(ConsultantSkillEntity, { consultant_id: In(ids) })
    await manager.delete(ConsultantExperienceEntity, { consultant_id: In(ids) })
    await manager.delete(ConsultantDocumentEntity, { consultant_id: In(ids) })
    await manager.delete(ConsultantCvRewriteEntity, { consultant_id: In(ids) })
    await manager.delete(ConsultantPushFeedbackEntity, { consultant_id: In(ids) })
    await manager.delete(ConsultantAccountConsentEntity, { consultant_id: In(ids) })
    await manager.delete(CvVersionEntity, { consultant_id: In(ids) })
    await manager.delete(TalentPreparedMessageEntity, { consultant_id: In(ids) })
    await manager.delete(TalentIdentityDecisionEntity, { talent_id: In(ids) })
    await manager.delete(TalentIdentityDecisionEntity, { other_talent_id: In(ids) })
    await manager.delete(SubmissionEntity, { consultant_id: In(ids) })
    await manager.delete(PartnerCvPushEntity, { consultant_id: In(ids) })
    await manager.delete(ReverseMarketDismissalEntity, { consultant_id: In(ids) })
    await manager.delete(MarketVerificationReceiptEntity, { consultant_id: In(ids) })
    await manager.delete(ShortlistEntryEntity, { consultant_id: In(ids) })
    // Les affectations TERMINÉES (les ouvertes ont bloqué le geste plus haut).
    await manager.delete(MissionAssignmentEntity, { consultant_id: In(ids) })
    // Des pièces financières à conservation légale : le lien est coupé, la
    // pièce reste.
    await manager.update(OutgoingPaymentEntity, { consultant_id: In(ids) }, { consultant_id: null })

    // Les tables sans entité propre, bornées à l'espace.
    await manager.query(`DELETE FROM custom_field_values WHERE workspace_id = $1 AND entity_id = ANY($2::uuid[])`, [
      workspaceId,
      ids,
    ])
    await manager.query(
      `DELETE FROM record_field_audit WHERE entity_type = 'consultant' AND entity_id = ANY($1::uuid[])`,
      [ids],
    )
    await manager.query(
      `DELETE FROM expertise_groundings
        WHERE workspace_id = $1 AND source_type = 'consultant' AND source_id = ANY($2::uuid[])`,
      [workspaceId, ids],
    )

    // La mémoire de Laura qui la cite : par le lien, puis par son nom COMPLET.
    // Jamais par un prénom seul — « Claire » viderait la mémoire de toutes les
    // Claire de l'espace.
    await manager.delete(MemoryPinnedFactEntity, { workspace_id: workspaceId, consultant_id: In(ids) })
    const fullNames = [...new Set(rows.map(row => (row.full_name ?? '').trim()))].filter(
      name => name.split(/\s+/).filter(Boolean).length >= 2,
    )
    for (const name of fullNames) {
      await manager.delete(MemoryPinnedFactEntity, {
        workspace_id: workspaceId,
        fact: ILike(`%${escapeLike(name)}%`),
      })
    }

    // La fiche elle-même — sa photo et son CV avec elle.
    // `ids` vient de la lecture CLOISONNÉE plus haut (`applyConsultantScope`),
    // qui couvre aussi une fiche sans espace appartenant à l'appelant.
    await manager.delete(ConsultantEntity, { id: In(ids) })

    // La trace, sans aucune donnée de la personne (contrainte SQL à l'appui).
    // Un consultant sans e-mail, profil ni nom n'a aucune clé d'identité : rien
    // à empreindre, la contrainte exige au moins une empreinte.
    if (fingerprints.length > 0) {
      await manager.insert(PersonErasureEntity, {
        workspace_id: workspaceId,
        erased_by: userId,
        erased_at: erasedAt,
        fingerprints,
      })
    }
    return storagePaths
  }
}
