import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  canErasePerson,
  sharedCompanyKey,
  isContactOwner,
  type PersonErasureResult,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@bellum/contracts'
import { DataSource, ILike, In, Not, Raw, type EntityManager, type FindOptionsWhere } from 'typeorm'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { PersonalContactEntity } from '../../database/entities/personal-contact.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactMergeEntity } from '../../database/entities/contact-merge.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { EmailSuppressionEntity } from '../../database/entities/email-suppression.entity'
import { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { LinkedInInteractionEntity } from '../../database/entities/linkedin-interaction.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { OrgGraphCorrectionEntity } from '../../database/entities/org-graph-correction.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { isPersonErasureKeyConfigured, PersonErasureKeyUnavailableError } from '../../common/person-erasure-hmac'
import { normalizeLinkedinUrl } from './contact-identity'
import { getPersonContactCache, type PersonRef } from './person-contact-cache'
import {
  erasedPersonGraphNodeIds,
  purgePersonFromAnalysis,
  type ErasedPersonIdentity,
} from './person-erasure-analysis-purge'
import { correctionNamesErasedPerson } from './person-erasure-corrections-purge'
import { CONTEXT_PACK_ORIGINAL_ERASER, type ContextPackOriginalEraser } from './person-erasure-context-pack-originals'
import { erasedEmailFingerprint, isErasedPerson, personErasureFingerprints } from './person-erasure-fingerprint'
import { purgeErasedPersonFromSharedBase } from '../shared-base/shared-company-facts-writes'
import { sharedPersonFingerprints } from '../shared-base/shared-person-fingerprint'

/** Les jokers de `ILIKE` pris au pied de la lettre dans un nom ou un profil. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

/** #3989 — la ligne de la base commune dont cette fiche est la copie, ou `null`. */
function sharedFactIdOf(row: ContactEntity): string | null {
  const id = (row.raw_data as { sharedFactId?: unknown } | null)?.sharedFactId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function apolloIdOf(row: ContactEntity): string | null {
  const id = (row.raw_data as { apolloId?: unknown } | null)?.apolloId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

/**
 * #2297.51 — la raison DÉDIÉE d'une opposition posée PAR l'effacement (et non
 * choisie par la personne elle-même, comme `unsubscribe`) : `email_suppressions`
 * ne porte aucune contrainte SQL sur `reason` (`text` nu), une valeur nouvelle
 * ne demande donc pas d'élargir de CHECK (GA-11/12 ne s'applique pas ici).
 */
const ERASURE_OPPOSITION_REASON = 'erasure'

function fingerprintsOf(workspaceId: string, row: ContactEntity): string[] {
  return personErasureFingerprints(workspaceId, {
    fullName: row.full_name,
    email: row.email,
    linkedinUrl: row.linkedin_url,
    apolloId: apolloIdOf(row),
    accountId: row.account_id,
  })
}

/**
 * #2297 — EFFACER UNE PERSONNE PROSPECTÉE (RGPD art. 17), décision Louis du
 * 19/09/2026 (QCM, point 1).
 *
 * Jusqu'ici, seule la suppression de COMPTE existait (`PrivacyDeletionService`,
 * qui anonymise). Une personne prospectée qui demandait l'effacement de SES
 * données n'avait aucun geste en face d'elle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE EXCEPTION À « ON ARCHIVE, ON NE SUPPRIME PAS » (doctrine c67)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout le reste du produit archive — un fait périmé redevient inconnu, il ne
 * disparaît pas. Ici on SUPPRIME, parce que la personne l'a demandé et que la
 * loi le lui accorde : la fiche, son enrichissement et son archive (colonnes de
 * la fiche), ses activités nominatives, son journal réseau, son arrêt, les
 * tâches et étapes de plan qui la visent, l'historique de fusion qui porte son
 * nom, et la mémoire de Laura qui la cite. Les liens vers elle depuis des
 * objets d'affaire qui NE sont PAS à elle (un besoin, une mission, un envoi de
 * CV) sont coupés, l'objet reste. Les tables à clé étrangère suivent seules
 * (cascade ou mise à NULL, migrations).
 *
 * LA PERSONNE, PAS SEULEMENT LA FICHE : ses doublons déjà fusionnés dans cette
 * fiche, et ses autres fiches de l'espace qui partagent une clé d'identité
 * (même adresse, même profil, même identifiant fournisseur — la règle de
 * `contactIdentityKeys`, rien de plus large) partent du même geste. Effacer une
 * fiche en laissant son double sur un autre compte n'effacerait personne.
 *
 * CE QUI RESTE, et rien d'autre : une trace `person_erasures` — qui a effacé,
 * quand, et des EMPREINTES non réversibles qui empêchent la RECOLLECTE
 * (`person-erasure-fingerprint.ts`, vérifiées à l'entrée de la collecte et de
 * l'enrichissement).
 *
 * Refusé en DÉMONSTRATION, avant toute écriture : la salle est partagée entre
 * visiteurs, et une fiche effacée le serait pour tous les suivants.
 *
 * #2297.51 — l'organigramme déjà calculé et tout le dossier des comptes où
 * elle figure (`accounts.raw_analysis` et ses voisins) sont purgés DANS le
 * geste, sans attendre un rejeu (`purgeAccountDossiers`).
 *
 * #2297.51 — son opposition (`email_suppressions`) est CONSERVÉE, c'est elle qui
 * empêche un envoi ; mais son adresse n'y reste qu'en EMPREINTE
 * (`keepOppositionAsFingerprint`).
 */
@Injectable()
export class PersonErasureService {
  private readonly logger = new Logger(PersonErasureService.name)

  constructor(
    private readonly dataSource: DataSource,
    /** #4573 — les originaux des imports de pack de l'espace (port, GA-07). Absent : rien à effacer de ce côté. */
    @Optional()
    @Inject(CONTEXT_PACK_ORIGINAL_ERASER)
    private readonly eraseContextPackOriginals?: ContextPackOriginalEraser,
  ) {}

  async erase(input: {
    contactId: string
    userId: string
    workspaceId: string
    role: WorkspaceRole
    extraPermissions: readonly WorkspacePermission[]
  }): Promise<PersonErasureResult> {
    const { contactId, userId, workspaceId } = input
    // Bornée à l'espace ACTIF : une fiche d'un autre espace est introuvable,
    // pas « interdite » — la réponse ne confirme pas qu'elle existe.
    const contact = await this.dataSource
      .getRepository(ContactEntity)
      .findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) throw new NotFoundException('Contact introuvable')

    const workspace = await this.dataSource.getRepository(WorkspaceEntity).findOne({ where: { id: workspaceId } })
    if (workspace?.is_demo) {
      throw new BadRequestException("L'effacement d'une personne ne s'exerce pas dans un espace de démonstration.")
    }

    // #2297 — le choix de Louis (19/09) : administrateur de l'espace, ou porteur
    // de la fiche. La règle vit dans `person-erasure.ts` (contracts), lue aussi
    // par l'écran.
    if (
      !canErasePerson({
        role: input.role,
        extraPermissions: input.extraPermissions,
        ownsContact: isContactOwner(contact, userId),
      })
    ) {
      throw new ForbiddenException(
        "Seul un administrateur de l'espace ou le porteur de la fiche peut effacer cette personne.",
      )
    }

    // #2297.51 — sans sa clé d'empreinte, l'effacement ne se replie sur rien :
    // 503, et pas une ligne n'est écrite. Supprimer sans pouvoir poser
    // d'empreinte laisserait la personne revenir à la prochaine analyse ; poser
    // un SHA-256 nu rouvrirait le dictionnaire que la clé ferme.
    if (!isPersonErasureKeyConfigured()) throw new PersonErasureKeyUnavailableError()

    const erasedAt = new Date()
    const { erasedCount, copiesErased, people } = await this.dataSource.transaction(async manager => {
      const rows = await this.samePerson(manager, workspaceId, contact)
      await this.eraseRows(manager, workspaceId, rows, userId, erasedAt)
      // #3989 — la base commune et les copies qu'en ont reçues les autres espaces.
      const copies = await this.propagateToSharedBase(manager, workspaceId, rows, erasedAt)
      return { erasedCount: rows.length, copiesErased: copies, people: rows.map(cachedPersonOf) }
    })

    // CACHE-API (15/10) — le cache des coordonnées achetées (API, tous espaces) et celui des
    // contacts révélés côté IA : une personne effacée n'est plus JAMAIS resservie depuis un cache.
    // Meilleur effort et hors transaction : une panne de Redis ne défait pas l'effacement.
    const contactCache = getPersonContactCache()
    for (const person of people) {
      await contactCache.purgePerson(person)
      await contactCache.purgeIaKeys(person)
    }

    // #4573 — un original de pack suit le sort de sa donnée. Son corps n'est jamais lu : on ne peut pas prouver qu'il
    // ne la cite pas, donc l'effacement emporte les originaux de l'espace (une COPIE — la donnée importée reste).
    // Hors transaction, comme les caches : une panne du seau ne défait pas l'effacement, le chemin reste pour le suivant.
    if (this.eraseContextPackOriginals) {
      try {
        const originals = await this.eraseContextPackOriginals(workspaceId)
        if (originals.deferred > 0) {
          this.logger.error(
            `#4573 — ${originals.deferred} original(aux) de pack non effacé(s) sur l'espace ${workspaceId}`,
          )
        }
      } catch {
        this.logger.error(`#4573 — originaux de pack non effacés sur l'espace ${workspaceId} (stockage indisponible)`)
      }
    }

    // Aucun nom, aucune adresse dans le journal : l'espace et un compte.
    this.logger.log(
      `Effacement RGPD art. 17 : ${erasedCount} fiche(s) supprimée(s) sur l'espace ${workspaceId}, ${copiesErased} copie(s) reçue(s) par la base commune`,
    )
    return { erased: true, erased_at: erasedAt.toISOString() }
  }

  /**
   * Tout ce que l'effacement supprime DANS UN ESPACE, puis la trace qui empêche
   * la recollecte. Le même chemin pour l'espace qui efface et pour chaque espace
   * qui avait reçu une copie par la base commune (#3989) — un seul calcul, deux
   * chemins divergeraient. `erasedBy` est `null` quand aucun membre de CET
   * espace n'a fait le geste (copie reçue).
   */
  private async eraseRows(
    manager: EntityManager,
    workspaceId: string,
    rows: readonly ContactEntity[],
    erasedBy: string | null,
    erasedAt: Date,
  ): Promise<void> {
    if (rows.length === 0) return
    const ids = rows.map(row => row.id)
    const fingerprints = [...new Set(rows.flatMap(row => fingerprintsOf(workspaceId, row)))]

    // Ce qui la NOMME, supprimé. Les participants d'une activité supprimée
    // partent en cascade ; ceux d'une activité d'un autre interlocuteur où
    // elle figurait partent ici.
    await manager.delete(ActivityEntity, { contact_id: In(ids) })
    await manager.delete(ActivityParticipantEntity, { contact_id: In(ids) })
    await manager.delete(LinkedInInteractionEntity, { contact_id: In(ids) })
    await manager.delete(ContactStopEntity, { contact_id: In(ids) })
    await manager.delete(TaskEntity, { contact_id: In(ids) })
    await manager.delete(ActionPlanItemEntity, { contact_id: In(ids) })
    // L'historique de fusion porte le nom du perdant en clair.
    await manager.delete(ContactMergeEntity, { winner_id: In(ids) })
    await manager.delete(ContactMergeEntity, { loser_id: In(ids) })
    // La mémoire de Laura qui la cite : par le lien, puis par son nom COMPLET.
    // Jamais par un prénom seul — « Claire » viderait la mémoire de toutes
    // les Claire de l'espace.
    await manager.delete(MemoryPinnedFactEntity, { contact_id: In(ids) })
    const fullNames = [...new Set(rows.map(row => row.full_name.trim()))].filter(
      name => name.split(/\s+/).filter(Boolean).length >= 2,
    )
    for (const name of fullNames) {
      await manager.delete(MemoryPinnedFactEntity, {
        workspace_id: workspaceId,
        fact: ILike(`%${escapeLike(name)}%`),
      })
    }
    // Les objets d'affaire qui ne sont PAS à elle gardent leur existence :
    // seul le lien vers elle est coupé (colonnes sans clé étrangère).
    await manager.update(ProjectNeedEntity, { contact_id: In(ids) }, { contact_id: null })
    await manager.update(WorkflowRunEntity, { contact_id: In(ids) }, { contact_id: null })
    await manager.update(CvVersionEntity, { sent_to_contact_id: In(ids) }, { sent_to_contact_id: null })
    await manager.update(MissionEntity, { billing_contact_id: In(ids) }, { billing_contact_id: null })

    // #2297.51 — son opposition RESTE (c'est elle qui empêche qu'on lui écrive
    // encore), mais plus aucune adresse en clair : l'empreinte à la place.
    await this.keepOppositionAsFingerprint(manager, workspaceId, rows, erasedAt)
    // #2297.51 — l'organigramme et tout le dossier des comptes où elle
    // figure, purgés TOUT DE SUITE, sans relancer d'analyse.
    await this.purgeAccountDossiers(manager, workspaceId, rows)

    // La fiche elle-même — son enrichissement et son archive avec elle.
    await manager.delete(ContactEntity, { id: In(ids) })

    // #2927 — ses copies PERSONNELLES (`personal_contacts`, de n'importe quel propriétaire de l'espace) :
    // l'effacement d'une personne ne laisse pas une fiche privée la nommer encore.
    await this.erasePersonalCopies(manager, workspaceId, rows)

    // La trace, sans aucune donnée de la personne (contrainte SQL à l'appui).
    await manager.insert(PersonErasureEntity, {
      workspace_id: workspaceId,
      erased_by: erasedBy,
      erased_at: erasedAt,
      fingerprints,
    })
  }

  /**
   * #3989 — L'EFFACEMENT TRAVERSE LA BASE COMMUNE (décision Louis 11/10/2026 :
   * « purge dans la table commune ET dans tous les espaces qui l'ont reçue par
   * elle ; l'empreinte empêche la recollecte »).
   *
   *  1. ses lignes de la base commune partent, retrouvées par EMPREINTE de
   *     portée « base commune » (`sharedPersonFingerprints` — clés fortes
   *     partout, nom borné à la société), et l'empreinte reste
   *     (`shared_person_erasures`) : le versement nocturne ne la reverse plus ;
   *  2. chaque COPIE qu'un autre espace en avait reçue (source `shared_base`,
   *     `raw_data.sharedFactId`) est effacée là-bas par le MÊME chemin
   *     (`eraseRows`), trace comprise — sa recollecte y est bloquée aussi.
   *
   * Ce qu'un autre espace a collecté LUI-MÊME n'est pas une copie et n'est pas
   * touché : cet espace n'a rien reçu de la base commune. Rend le nombre de
   * copies effacées.
   */
  private async propagateToSharedBase(
    manager: EntityManager,
    workspaceId: string,
    rows: readonly ContactEntity[],
    erasedAt: Date,
  ): Promise<number> {
    const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => !!id))]
    const accounts = accountIds.length
      ? await manager.find(AccountEntity, {
          where: { id: In(accountIds), workspace_id: workspaceId },
          select: { id: true, siren: true, website: true },
        })
      : []
    const companyOf = new Map(accounts.map(account => [account.id, sharedCompanyKey(account)]))
    const prints = [
      ...new Set(
        rows.flatMap(row =>
          sharedPersonFingerprints({
            fullName: row.full_name,
            email: row.email,
            linkedinUrl: row.linkedin_url,
            apolloId: apolloIdOf(row),
            companyKey: (row.account_id && companyOf.get(row.account_id)) || null,
          }),
        ),
      ),
    ]
    const purged = await purgeErasedPersonFromSharedBase(manager, prints)
    const factIds = [...new Set([...purged, ...rows.map(sharedFactIdOf).filter((id): id is string => !!id)])]
    if (factIds.length === 0) return 0

    // Par l'entité (GA-405 : aucune lecture brute de plus sur cette table), toutes
    // les copies de ces lignes communes HORS de l'espace qui efface — ses propres
    // fiches viennent d'être effacées par `eraseRows`.
    const copies = await manager.find(ContactEntity, {
      where: {
        source: 'shared_base',
        workspace_id: Not(workspaceId),
        raw_data: Raw(alias => `${alias}->>'sharedFactId' = ANY(:factIds)`, { factIds }),
      },
    })
    const byWorkspace = new Map<string, ContactEntity[]>()
    for (const copy of copies) {
      if (!copy.workspace_id) continue
      byWorkspace.set(copy.workspace_id, [...(byWorkspace.get(copy.workspace_id) ?? []), copy])
    }
    let erased = 0
    for (const [otherWorkspaceId, copyRows] of byWorkspace) {
      await this.eraseRows(manager, otherWorkspaceId, copyRows, null, erasedAt)
      erased += copyRows.length
    }
    return erased
  }

  /**
   * #2297.51 — L'OPPOSITION EST TOUJOURS POSÉE (décision Louis du 19/09/2026,
   * « Oui, en créer une »). Chaque adresse connue de la personne finit sur une
   * ligne `email_suppressions` en EMPREINTE — qu'elle se soit désabonnée avant
   * ou non. Sans cette garantie, une adresse jamais désabonnée resterait
   * parfaitement écrivable APRÈS l'effacement de la personne qui la portait :
   * l'effacement de la fiche ne fermerait pas la porte de l'envoi.
   *
   * Trois cas, par adresse :
   *   - une opposition en clair existe déjà → CONSERVÉE (même id, même raison,
   *     même date), son adresse remplacée par l'empreinte, `erased_at` posée ;
   *   - une empreinte est déjà posée (personne recréée puis effacée à
   *     nouveau) → rien à dupliquer, seules les lignes en clair restantes
   *     partent ;
   *   - AUCUNE ligne n'existe → une ligne est CRÉÉE directement en empreinte,
   *     raison dédiée `ERASURE_OPPOSITION_REASON` (jamais `unsubscribe`, que la
   *     personne n'a pas choisi elle-même).
   *
   * `erased_at` posée dans les trois cas — la base refuse alors toute adresse
   * en clair sur cette ligne (`email_suppressions_erased_form_check`). Le
   * contrôle d'envoi (`SuppressionService`, sa lecture d'opposition) lit les
   * deux formes.
   *
   * Les adresses sont comparées en minuscules : c'est la forme que
   * `SuppressionService.suppress`, seul autre écrivain de la table, enregistre.
   */
  private async keepOppositionAsFingerprint(
    manager: EntityManager,
    workspaceId: string,
    rows: readonly ContactEntity[],
    erasedAt: Date,
  ): Promise<void> {
    const emails = [...new Set(rows.map(row => (row.email ?? '').trim().toLowerCase()))].filter(email =>
      email.includes('@'),
    )
    if (emails.length === 0) {
      // #2297.51 — aucune adresse connue : rien à opposer. La trace le dit,
      // plutôt que de laisser croire à une opposition posée en silence.
      this.logger.log('Effacement RGPD art. 17 : aucune adresse connue, aucune opposition à poser')
      return
    }
    for (const email of emails) {
      const print = erasedEmailFingerprint(workspaceId, email)
      if (!print) continue
      const lines = await manager.find(EmailSuppressionEntity, {
        where: { workspace_id: workspaceId, email: In([email, print]) },
        order: { created_at: 'ASC' },
      })
      const clear = lines.filter(line => line.email !== print)
      const alreadyPrinted = lines.some(line => line.email === print)
      if (clear.length === 0) {
        if (!alreadyPrinted) {
          await manager.insert(EmailSuppressionEntity, {
            workspace_id: workspaceId,
            email: print,
            erased_at: erasedAt,
            reason: ERASURE_OPPOSITION_REASON,
          })
        }
        continue
      }
      const kept = alreadyPrinted ? undefined : clear[0]
      const rest = alreadyPrinted ? clear : clear.slice(1)
      if (kept) await manager.update(EmailSuppressionEntity, { id: kept.id }, { email: print, erased_at: erasedAt })
      if (rest.length) await manager.delete(EmailSuppressionEntity, { id: In(rest.map(line => line.id)) })
    }
  }

  /**
   * #2297.51 — L'ORGANIGRAMME PURGÉ TOUT DE SUITE. Les comptes où elle a une
   * fiche perdent son nom partout dans leur dossier : `raw_analysis` (le
   * graphe `org.orgGraph`, l'organigramme hérité, le registre, les contacts
   * classés, le plan, la prose), sa version précédente `previous_raw_analysis`,
   * et les deux ardoises d'organigramme qui survivent aux rejeux
   * (`org_declared_people` — sinon le prochain run la réinjecterait —, et
   * `org_rejected_items`). La règle vit dans `person-erasure-analysis-purge.ts`.
   *
   * Dans la transaction de l'effacement, lignes VERROUILLÉES : une analyse qui
   * écrirait le dossier au même instant attend, elle ne réécrit pas l'ancien
   * blob par-dessus. Aucune analyse n'est relancée. Seuls les comptes de SES
   * fiches : un homonyme ailleurs n'a rien demandé.
   */
  private async purgeAccountDossiers(
    manager: EntityManager,
    workspaceId: string,
    rows: readonly ContactEntity[],
  ): Promise<void> {
    const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => !!id))]
    if (accountIds.length === 0) return
    const identity: ErasedPersonIdentity = {
      fullNames: rows.map(row => row.full_name),
      emails: rows.map(row => row.email),
      linkedinUrls: rows.map(row => row.linkedin_url),
      apolloIds: rows.map(apolloIdOf),
      contactIds: rows.map(row => row.id),
    }
    const accounts = await manager.find(AccountEntity, {
      where: { id: In(accountIds), workspace_id: workspaceId },
      select: {
        id: true,
        raw_analysis: true,
        previous_raw_analysis: true,
        org_declared_people: true,
        org_rejected_items: true,
      },
      lock: { mode: 'pessimistic_write' },
    })
    for (const account of accounts) {
      const { value, changed } = purgePersonFromAnalysis(
        {
          raw_analysis: account.raw_analysis,
          previous_raw_analysis: account.previous_raw_analysis,
          org_declared_people: account.org_declared_people,
          org_rejected_items: account.org_rejected_items,
        },
        identity,
      )
      // #2297.51 — sur le dossier tel qu'il était AVANT sa purge : c'est là que
      // vivent ses identifiants de graphe (`orgGraph.people[].id`), les mêmes
      // que le ledger de corrections référence. Indépendant de `changed` — une
      // correction peut la désigner même quand le texte du dossier ne la NOMME
      // plus littéralement.
      const nodeIds = erasedPersonGraphNodeIds([account.raw_analysis, account.previous_raw_analysis], identity)
      await this.purgeOrgGraphCorrections(manager, workspaceId, account.id, nodeIds)
      if (!changed) continue
      await manager.update(
        AccountEntity,
        { id: account.id },
        {
          raw_analysis: value.raw_analysis ?? {},
          previous_raw_analysis: value.previous_raw_analysis ?? null,
          org_declared_people: value.org_declared_people ?? [],
          org_rejected_items: value.org_rejected_items ?? [],
        },
      )
    }
  }

  /**
   * #2297.51 — `ORG_GRAPH_CORRECTIONS` EST PURGÉE (décision Louis du
   * 19/09/2026, point 2). Détail et pourquoi dans l'en-tête de
   * `person-erasure-corrections-purge.ts` : une correction est PAR
   * CONSTRUCTION une donnée qui nomme quelqu'un, et l'effacement RGPD est la
   * SEULE exception écrite, à la fois à « une correction humaine gagne
   * toujours » (`orgCorrectionHoldsField`) et à « on archive, on ne supprime
   * pas » (`revertedAt`) — doctrine c67, agent_docs/doctrine.md.
   *
   * DELETE, pas une pierre tombale : contrairement à une annulation normale
   * (qui pose `revertedAt` et garde la ligne lisible), c'est ici la ligne
   * elle-même qui EST la donnée personnelle.
   *
   * Bornée au COMPTE : seules les corrections de CE compte, jamais celles d'un
   * homonyme ailleurs — même portée que le reste de l'effacement.
   */
  private async purgeOrgGraphCorrections(
    manager: EntityManager,
    workspaceId: string,
    accountId: string,
    nodeIds: ReadonlySet<string>,
  ): Promise<void> {
    if (nodeIds.size === 0) return
    const corrections = await manager.find(OrgGraphCorrectionEntity, { where: { workspaceId, accountId } })
    const toDelete = corrections.filter(row =>
      correctionNamesErasedPerson({ objectId: row.objectId, oldValue: row.oldValue, newValue: row.newValue }, nodeIds),
    )
    if (toDelete.length) {
      await manager.delete(OrgGraphCorrectionEntity, { id: In(toDelete.map(row => row.id)) })
    }
  }

  /**
   * La fiche, ses doublons déjà fusionnés en elle, et ses autres fiches de
   * l'espace qui partagent une de ses clés d'identité. La requête ratisse
   * large (profil par sous-chaîne) ; le tri se fait par EMPREINTE, la même
   * règle que la collecte — un homonyme ailleurs n'est jamais emporté.
   */
  private async erasePersonalCopies(
    manager: EntityManager,
    workspaceId: string,
    rows: readonly ContactEntity[],
  ): Promise<void> {
    const emails = [...new Set(rows.map(row => (row.email ?? '').trim().toLowerCase()).filter(e => e.includes('@')))]
    const linkedins = [...new Set(rows.map(row => (row.linkedin_url ?? '').trim()).filter(Boolean))]
    if (emails.length) await manager.delete(PersonalContactEntity, { workspace_id: workspaceId, email: In(emails) })
    if (linkedins.length) {
      await manager.delete(PersonalContactEntity, { workspace_id: workspaceId, linkedin_url: In(linkedins) })
    }
  }

  private async samePerson(
    manager: EntityManager,
    workspaceId: string,
    contact: ContactEntity,
  ): Promise<ContactEntity[]> {
    const merges = await manager.find(ContactMergeEntity, { where: { winner_id: contact.id } })
    const loserIds = merges.map(merge => merge.loser_id).filter(id => id !== contact.id)
    const losers = loserIds.length ? await manager.find(ContactEntity, { where: { id: In(loserIds) } }) : []

    const email = (contact.email ?? '').trim().toLowerCase()
    const linkedin = normalizeLinkedinUrl(contact.linkedin_url)
    const apolloId = apolloIdOf(contact)
    const where: FindOptionsWhere<ContactEntity>[] = []
    if (email.includes('@')) {
      where.push({ workspace_id: workspaceId, email: Raw(alias => `lower(${alias}) = :email`, { email }) })
    }
    if (linkedin) where.push({ workspace_id: workspaceId, linkedin_url: ILike(`%${escapeLike(linkedin)}%`) })
    if (apolloId) {
      where.push({
        workspace_id: workspaceId,
        raw_data: Raw(alias => `${alias}->>'apolloId' = :apolloId`, { apolloId }),
      })
    }
    const candidates = where.length ? await manager.find(ContactEntity, { where }) : []

    const erased = new Set(fingerprintsOf(workspaceId, contact))
    const same = candidates.filter(row => isErasedPerson(fingerprintsOf(workspaceId, row), erased))

    const byId = new Map<string, ContactEntity>()
    for (const row of [contact, ...losers, ...same]) if (!byId.has(row.id)) byId.set(row.id, row)
    return [...byId.values()]
  }
}

/** Ce qui retrouve la personne dans les caches de coordonnées (nom, profil, identifiant fournisseur). */
function cachedPersonOf(row: ContactEntity): PersonRef & { apolloId?: string } {
  const [firstName, ...rest] = (row.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  const apolloId = (row.raw_data as { apolloId?: unknown } | null)?.apolloId
  return {
    ...(firstName ? { firstName } : {}),
    ...(rest.length > 0 ? { lastName: rest.join(' ') } : {}),
    ...(row.entity ? { organizationName: row.entity } : {}),
    ...(row.linkedin_url ? { linkedinUrl: row.linkedin_url } : {}),
    ...(typeof apolloId === 'string' && apolloId.trim() ? { apolloId } : {}),
  }
}
