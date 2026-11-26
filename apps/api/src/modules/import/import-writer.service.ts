import { writableContactName } from '../contacts/contact-display-name'
import { nameHoldersOfAccount } from '../contacts/contact-name-collision'
import { normalizeFullName } from '../contacts/contact-identity'
import { refusePlaceholderEmail } from '../contacts/placeholder-email'
import { ConflictException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import {
  IMPORT_CHECKPOINT_ROWS,
  PROJECT_STAGES,
  WRITABLE_IMPORT_OBJECTS,
  type WritableImportObject,
  dedupKeyOf,
  dedupKeysOf,
  dispatchFailureOutcome,
  normaliseAmountCents,
  normaliseCompanyName,
  normalizeTags,
  universalImportSourceOf,
  universalImportSourceRefKey,
  withDedupInputs,
  type ImportObject,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ContactResolutionCorrectionsService } from '../contacts/contact-resolution-corrections.service'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import type {
  ImportRejectedRow,
  ImportRowWriter,
  ImportSnapshot,
  ImportTargetListOutcome,
  ImportWriteOutcome,
} from './import.service'
import { ImportTargetListWriter, type ImportTargetListHandle } from './import-target-list.writer'

/**
 * L'écriture de l'import — et rien qui décide.
 *
 * La décision (ce qui sera créé, mis à jour, écarté, écrasé) vit dans le moteur
 * pur du contrat. Ici on écrit ce qu'il a décidé, on garde l'INSTANTANÉ de ce
 * qu'on remplace, et on ne prend aucune initiative. Cette séparation est ce qui
 * rend la simulation honnête : elle rejoue exactement ce chemin, sans réseau ni
 * base.
 *
 * ⚠️ Cinq objets écrivent aujourd'hui : les COMPTES, les CONTACTS, les
 * PROJETS, les BESOINS et le VIVIER (`talent`). Les autres sources sont
 * déclarées, elles se simulent, et leur écriture est REFUSÉE PAR SON NOM
 * plutôt que de rendre un succès muet.
 *
 * ⚠️ La liste vit dans le CONTRAT (`WRITABLE_IMPORT_OBJECTS`), pas ici : le
 * refus de l'`apply`, le refus de l'annulation et l'aperçu que le copilote
 * reçoit en avaient tous les trois besoin, et le troisième ne l'avait pas — il
 * annonçait des reprises qui ne s'écrivent pas.
 */
@Injectable()
export class ImportWriterService implements ImportRowWriter {
  private readonly logger = new Logger(ImportWriterService.name)

  /** Les objets dont l'écriture est branchée. Le reste est refusé, nommément. */
  static readonly WRITABLE: readonly ImportObject[] = WRITABLE_IMPORT_OBJECTS

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ConsultantEntity) private readonly talents: Repository<ConsultantEntity>,
    /** #2159.35 — `@Optional()`, comme les ports de `restitution.service.ts` :
     *  absent (un test qui construit ce service positionnellement, ou un
     *  déploiement où `ContactsModule` ne serait pas câblé), `existingKeys`
     *  rend le comportement byte-identique d'avant ce point — jamais un rejet
     *  deviné. */
    @Optional() private readonly contactCorrections?: ContactResolutionCorrectionsService,
    /** #3753 — la liste cible d'un fichier de comptes tiérés. `@Optional()` : sans elle, chemin byte-identique. */
    @Optional() private readonly targetLists?: ImportTargetListWriter,
    /** M2.2/M2.1 (Meyer 20/10) — les références source (`sync_links`). `@Optional()` : sans lui, chemin byte-identique. */
    @Optional() @InjectRepository(SyncLinkEntity) private readonly syncLinks?: Repository<SyncLinkEntity>,
    /** #2732.1 — les missions. `@Optional()` en dernier : les constructions positionnelles des specs restent valides. */
    @Optional() @InjectRepository(MissionEntity) private readonly missions?: Repository<MissionEntity>,
  ) {}

  /**
   * M2.1 (Meyer 20/10) — la référence du CRM d'origine, lue dans le fichier, rapproche une fiche déjà importée : un
   * réimport ne crée AUCUN doublon (#4052). MÊME clé et MÊME table que l'import universel sans CRM déclaré
   * (`universalImportSourceOf(null)` → `csv`, préfixe `fichier:`) : un fichier repris par l'un puis par l'autre se
   * reconnaît. Une référence absente ne rapproche rien — jamais une référence inventée.
   */
  private async refLinks(
    workspaceId: string,
    entityType: 'account' | 'contact',
    refs: readonly string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!this.syncLinks || refs.length === 0) return out
    const keys = [...new Set(refs.map(ref => refKey(ref)))]
    const links = await this.syncLinks.find({
      where: {
        workspace_id: workspaceId,
        provider: REF_SOURCE.provider,
        entity_type: entityType,
        external_id: In(keys),
      },
      select: ['external_id', 'internal_id'],
    })
    for (const link of links) out.set(link.external_id, link.internal_id)
    return out
  }

  /** Pose le lien référence → fiche ; un lien déjà posé n'est jamais réattribué (`orIgnore`). */
  private async writeRefLink(
    workspaceId: string,
    entityType: 'account' | 'contact',
    ref: string,
    internalId: string,
  ): Promise<void> {
    if (!this.syncLinks) return
    await this.syncLinks
      .createQueryBuilder()
      .insert()
      .values({
        workspace_id: workspaceId,
        provider: REF_SOURCE.provider,
        entity_type: entityType,
        external_id: refKey(ref),
        internal_id: internalId,
      })
      .orIgnore()
      .execute()
  }

  /**
   * Les sociétés que l'espace connaît, sous leur forme normalisée.
   *
   * Sert à la SIMULATION, pas à l'écriture : sans elle, le rapport annonce des
   * créations que l'import ne fera pas, et « 2 créations » devient « 0 créé »
   * sans un mot. Mesuré en recette live le 21/08.
   */
  async knownCompanyKeys(workspaceId: string): Promise<Set<string>> {
    const rows = await this.accounts.find({ where: { workspace_id: workspaceId }, select: ['company_name'] })
    return new Set(rows.map(row => normaliseCompanyName(row.company_name)))
  }

  /**
   * Les clés de déduplication DÉJÀ en base, pour que la simulation dise la
   * vérité sur ce qu'elle va mettre à jour.
   *
   * Sans elles, `simulateImport` recevait `existing: {}` — écrit en dur, avec un
   * commentaire affirmant que « la comparaison contre la BASE se fait au niveau
   * du contrôleur ». Le contrôleur ne la faisait pas. Conséquence mécanique :
   * `updates` et `overwrittenFields` valaient TOUJOURS zéro, aucun doublon
   * contre la base n'était jamais signalé, et la ligne « X valeurs seraient
   * remplacées » ne pouvait pas s'afficher une seule fois. La simulation
   * annonçait donc des créations là où l'import ferait des mises à jour.
   *
   * Seuls les deux objets réellement écrits sont couverts : pour les autres,
   * `apply` refuse par leur nom, et promettre une comparaison qu'aucune
   * écriture ne suivra serait une seconde forme du même mensonge.
   */
  async existingKeys(workspaceId: string, object: ImportObject): Promise<Record<string, string>> {
    const keys: Record<string, string> = {}
    if (object === 'account') {
      const rows = await this.accounts.find({
        where: { workspace_id: workspaceId },
        select: ['id', 'company_name', 'siren', 'website'],
      })
      // La PREMIÈRE clé qui matche décide (`dedupKeyOf`), et l'ordre est
      // siren → domaine → nom normalisé. On indexe les trois : c'est la ligne
      // du fichier qui choisira laquelle s'applique.
      for (const row of rows) for (const key of accountKeys(row)) keys[key] = row.id
      return keys
    }
    if (object === 'contact') {
      const rows = await this.contacts.find({
        where: { workspace_id: workspaceId },
        select: ['id', 'email'],
      })
      // #2159.35 — les fiches qu'un humain a déjà écartées d'un rapprochement
      // PAR E-MAIL (« ce n'est pas la même personne » — un standard partagé
      // désignait quelqu'un d'autre) : la LATEST version de leur registre
      // fait foi (une correction humaine gagne toujours, quelle que soit sa
      // date). `@Optional()` absent ⇒ ensemble vide, comportement inchangé.
      const rejected = (await this.contactCorrections?.rejectedContactIds(workspaceId)) ?? new Set<string>()
      // L'écriture ne dédoublonne les contacts que par e-mail : indexer aussi
      // `name+company` ferait promettre à la simulation une mise à jour que
      // `writeContacts` ne ferait pas.
      for (const row of rows) {
        if (rejected.has(row.id)) continue
        const email = (row.email ?? '').trim().toLowerCase()
        if (email) keys[`email:${email}`] = row.id
      }
      return keys
    }
    if (object === 'project') {
      // ⚠️ La clé du fichier est `normalizedName+label` : elle passe par le NOM
      // de la société, parce qu'un fichier ne porte jamais l'identifiant d'un
      // compte. Elle doit donc se construire ici EXACTEMENT comme l'écriture la
      // construira — sinon la simulation annonce une création et l'écriture fait
      // une mise à jour, ou l'inverse.
      const rows = await this.projects
        .createQueryBuilder('p')
        .innerJoin(AccountEntity, 'a', 'a.id = p.account_id')
        .where('p.workspace_id = :workspaceId', { workspaceId })
        .select('p.id', 'id')
        .addSelect('p.label', 'label')
        .addSelect('a.company_name', 'company_name')
        .getRawMany<{ id: string; label: string; company_name: string }>()
      for (const row of rows) {
        const key = projectKey(row.company_name, row.label)
        if (key) keys[key] = row.id
      }
      return keys
    }
    return keys
  }

  /**
   * Écrit des comptes.
   *
   * `status: 'imported'` — la quatrième valeur, ajoutée pour ce chemin. Écrire
   * `completed` affirmerait qu'un dossier de conquête existe, et les écrans qui
   * filtrent là-dessus l'ouvriraient sur du vide.
   */
  async writeAccounts(input: ImportWriteInput): Promise<ImportWriteOutcome> {
    const existing = await this.accounts.find({
      where: { workspace_id: input.workspaceId },
      select: ['id', 'company_name', 'siren', 'website', 'tags', ...PROFILE_FIELDS],
    })
    const byKey = new Map<string, AccountEntity>()
    for (const account of existing) {
      for (const key of accountKeys(account)) byKey.set(key, account)
    }
    // #2079.13 — AUCUNE fusion sur le nom seul. `normalizedName` est un repli
    // NÉCESSAIRE pour consolider, DANS CE FICHIER, plusieurs lignes de la même
    // société — mais appliqué à un compte déjà en base, il fusionnerait deux
    // homonymes qui ne partagent qu'un nom : « Acme Corp » chez un client n'est
    // pas « Acme Corp » chez un autre. On propose une fusion, on ne fusionne
    // jamais (doctrine). Les identifiants des comptes déjà en base, pour
    // refuser l'auto-fusion quand SEUL leur nom a matché.
    const existingIds = new Set(existing.map(account => account.id))

    // #3753 — la liste cible se pose AVANT la première ligne, et seulement si on la demande.
    const listHandle: ImportTargetListHandle | null =
      input.targetList && this.targetLists
        ? await this.targetLists.open(input.workspaceId, input.userId, input.targetList.name)
        : null
    const listOutcome: ImportTargetListOutcome | null = listHandle
      ? { id: listHandle.id, name: listHandle.name, added: 0, attachedToExisting: 0, nearDuplicates: [] }
      : null
    const attachToList = async (accountId: string, row: Record<string, unknown>, existed: boolean): Promise<void> => {
      if (!listHandle || !listOutcome || !this.targetLists) return
      if (await this.targetLists.attach(listHandle, input.workspaceId, accountId, row)) {
        listOutcome.added += 1
        if (existed) listOutcome.attachedToExisting += 1
      }
    }

    // M2.1 (Meyer 20/10) — la référence de la société (« Société - Référence interne », sinon la référence du fichier)
    // rapproche un compte déjà importé : un réimport ne crée aucun doublon (#4052).
    const accountRefOf = (row: Record<string, unknown>): string | null =>
      refOf(row['companyRef']) ?? refOf(row['sourceRef'])
    const accountRefs = await this.refLinks(
      input.workspaceId,
      'account',
      input.rows.map(accountRefOf).filter((ref): ref is string => ref !== null),
    )
    const existingById = new Map(existing.map(account => [account.id, account]))

    const tally = newTally()
    const outcome = await runRows(input, tally, async row => {
      const company = String(row['company'] ?? '').trim()
      if (!company) return
      const accountRef = accountRefOf(row)
      const refMatch = accountRef ? existingById.get(accountRefs.get(refKey(accountRef)) ?? '') : undefined
      // La MÊME dérivation que la simulation ET que l'index des comptes en
      // base. Elle était recopiée ici à la main, et la simulation ne la faisait
      // pas du tout : les deux côtés ne pouvaient pas se rencontrer, et le
      // rapport annonçait des créations sur des sociétés déjà présentes.
      //
      // #2079.10 — la ligne essaie SES clés dans l'ordre de `DEDUP_KEYS`
      // (siren → domaine → nom normalisé) et s'arrête à la première qui
      // rencontre un compte. Elle n'en essayait qu'UNE, la plus forte : une
      // ligne portant un SIREN que le compte en base n'a pas encore ne pouvait
      // jamais le retrouver par son domaine, et créait un doublon sur le signal
      // le plus fort après le SIREN. L'ordre reste celui du moteur — il décide
      // de la priorité, ici comme dans la simulation.
      const keys = dedupKeysOf('account', withDedupInputs('account', { ...row, company }))
      let matchedKey: string | undefined
      let candidate: AccountEntity | undefined
      for (const candidateKey of keys) {
        const found = byKey.get(candidateKey)
        if (found) {
          matchedKey = candidateKey
          candidate = found
          break
        }
      }
      // #2079.13 — un candidat déjà EN BASE, trouvé par le nom seul
      // (`normalizedName`, sans SIREN ni domaine), n'est jamais fusionné : la
      // ligne crée son propre compte, que la proposition de doublons pourra
      // signaler — un candidat créé PENDANT CETTE MÊME passe (pas encore dans
      // `existingIds`) continue lui de se consolider normalement.
      const match =
        refMatch ??
        (candidate && matchedKey?.startsWith('normalizedName:') && existingIds.has(candidate.id)
          ? undefined
          : candidate)
      if (match && accountRef && !refMatch) {
        await this.writeRefLink(input.workspaceId, 'account', accountRef, match.id)
        accountRefs.set(refKey(accountRef), match.id)
      }

      if (match) {
        // On ne remplit que les TROUS. Écraser une valeur existante avec celle
        // d'un fichier hérité est ce qui fait perdre les corrections faites à la
        // main depuis — et personne ne les retrouve après.
        const patch: Partial<AccountEntity> = {}
        if (!match.siren && typeof row['siren'] === 'string') patch.siren = row['siren']
        if (!match.website && typeof row['domain'] === 'string') patch.website = row['domain']
        // #4053.3 — le profil de la société (secteur, effectif, siège) : un TROU se remplit, une valeur
        // déjà posée (peut-être à la main) ne s'écrase jamais.
        for (const field of PROFILE_FIELDS) {
          if (!match[field] && typeof row[field] === 'string') patch[field] = row[field]
        }
        // #2159.26 — les étiquettes suivent la même règle : elles remplissent un
        // TROU (aucune étiquette), jamais n'écrasent celles posées depuis.
        const incomingTags = normalizeTags(row['tags'])
        if ((match.tags ?? []).length === 0 && incomingTags.length > 0) patch.tags = incomingTags
        if (Object.keys(patch).length === 0) {
          await attachToList(match.id, row, true)
          return
        }
        tally.snapshot.push({
          id: match.id,
          created: false,
          fields: {
            siren: match.siren,
            website: match.website,
            ...(patch.tags ? { tags: match.tags ?? [] } : {}),
            ...Object.fromEntries(PROFILE_FIELDS.filter(field => field in patch).map(field => [field, match[field]])),
          },
        })
        await this.accounts.update({ id: match.id, workspace_id: input.workspaceId }, patch)
        tally.updated += 1
        await attachToList(match.id, row, true)
        return
      }

      const entity = this.accounts.create({
        user_id: input.userId,
        workspace_id: input.workspaceId,
        company_name: company,
        siren: typeof row['siren'] === 'string' ? row['siren'] : null,
        website: typeof row['domain'] === 'string' ? row['domain'] : null,
        // #4053.3 — le profil de la société, tel que le fichier le porte.
        ...Object.fromEntries(
          PROFILE_FIELDS.filter(field => typeof row[field] === 'string').map(field => [field, row[field]]),
        ),
        status: 'imported',
        // #2159.26 — la cellule « Tags » du fichier, découpée et normalisée.
        tags: normalizeTags(row['tags']),
        // #2150.31 — MÊME défaut que #1408 sur `create()` (lancement d'analyse,
        // `accounts.service.ts:2146-2161`) : un compte créé sans `assigned_to`
        // n'est porté par personne, le cockpit qui lit le portefeuille par
        // responsable ne le voit pas, et le manager le compte comme une « zone
        // blanche » (#1460) alors qu'il vient d'être repris en masse. Ce chemin
        // (import CSV/Excel) était le seul des trois créations de compte à ne
        // jamais poser la colonne — pas un second geste « ajouter au
        // portefeuille » (GA-26), la même colonne posée par la même raison.
        assigned_to: input.userId,
      })
      const saved = await this.accounts.save(entity)
      // #2079.10 — le compte qui vient de naître est indexé sur TOUTES ses
      // clés, par la même dérivation que ceux déjà en base. Il ne l'était que
      // sur la plus forte : une seconde ligne de la même société sans SIREN
      // ne le retrouvait pas et posait un troisième compte.
      for (const savedKey of accountKeys(saved)) byKey.set(savedKey, saved)
      existingById.set(saved.id, saved)
      if (accountRef) {
        await this.writeRefLink(input.workspaceId, 'account', accountRef, saved.id)
        accountRefs.set(refKey(accountRef), saved.id)
      }
      tally.snapshot.push({ id: saved.id, created: true, fields: {} })
      tally.created += 1
      // #3753 — un candidat EN BASE trouvé par le nom seul n'a pas été fusionné
      // (voir plus haut) : on le PROPOSE comme quasi-doublon, sans rien lier.
      if (listOutcome && candidate && !match && existingIds.has(candidate.id)) {
        listOutcome.nearDuplicates.push({ company, existingAccountId: candidate.id, newAccountId: saved.id })
      }
      await attachToList(saved.id, row, false)
    })
    return listOutcome ? { ...outcome, targetList: listOutcome } : outcome
  }

  /**
   * Écrit des contacts, rattachés à un compte EXISTANT.
   *
   * Une ligne dont la société n'est ni dans l'espace ni dans l'import précédent
   * est écartée avec `unknown_company` — l'une des sept raisons de la liste
   * fermée. C'est le §7.3 en pratique : « les sociétés avant les contacts, sinon
   * toutes les associations sautent ». Créer un compte au passage produirait des
   * doublons de comptes, ce qui est pire que la ligne perdue.
   */
  async writeContacts(input: ImportWriteInput): Promise<ImportWriteOutcome> {
    const accounts = await this.accounts.find({
      where: { workspace_id: input.workspaceId },
      select: ['id', 'company_name', 'website'],
    })
    const accountByName = new Map(accounts.map(a => [normaliseCompanyName(a.company_name), a.id]))

    // #4599.2 — un gabarit (`prenom.nom@…`) n'est l'adresse de personne : ni cherché, ni rapproché, ni écrit.
    const emails = input.rows.map(row => contactEmailOf(row)).filter(Boolean)
    const known =
      emails.length > 0
        ? await this.contacts.find({
            where: { workspace_id: input.workspaceId, email: In(emails) },
            select: ['id', 'email', 'tags'],
          })
        : []
    // #4053.8 — la MÊME reconnaissance que la simulation (`existingKeys`) : une fiche qu'un humain a
    // REJETÉE d'un rapprochement par e-mail (#2159.35) n'est pas « la même personne ». La simulation
    // l'écartait déjà, l'écriture la mettait à jour : « 1 création » annoncée, « 0 » obtenu.
    const rejected = (await this.contactCorrections?.rejectedContactIds(input.workspaceId)) ?? new Set<string>()
    const contactByEmail = new Map(
      known.filter(c => !rejected.has(c.id)).map(c => [(c.email ?? '').toLowerCase(), c.id]),
    )
    // #2159.26 — les étiquettes déjà posées, pour ne remplir qu'un TROU.
    const tagsByContact = new Map(known.map(c => [c.id, c.tags ?? []]))

    // M2.1 (Meyer 20/10) — les références déjà connues : celle du contact, et celle de sa société.
    const contactRefs = await this.refLinks(
      input.workspaceId,
      'contact',
      input.rows.map(row => refOf(row['sourceRef'])).filter((ref): ref is string => ref !== null),
    )
    const accountRefs = await this.refLinks(
      input.workspaceId,
      'account',
      input.rows.map(row => refOf(row['companyRef'])).filter((ref): ref is string => ref !== null),
    )

    const tally = newTally()
    // #4479 — les noms déjà portés, par compte, lus une fois au premier besoin.
    const nameHoldersByAccount = new Map<string, Map<string, string>>()
    return runRows(input, tally, async row => {
      const email = contactEmailOf(row)
      const company = String(row['company'] ?? '').trim()
      const companyRef = refOf(row['companyRef'])
      const accountId =
        (company ? accountByName.get(normaliseCompanyName(company)) : undefined) ??
        (companyRef ? accountRefs.get(refKey(companyRef)) : undefined)
      if (!accountId) {
        tally.skippedUnknownCompany += 1
        return
      }

      const contactRef = refOf(row['sourceRef'])
      const existingId =
        (contactRef ? contactRefs.get(refKey(contactRef)) : undefined) ??
        (email ? contactByEmail.get(email) : undefined)
      if (existingId) {
        if (contactRef && !contactRefs.has(refKey(contactRef))) {
          await this.writeRefLink(input.workspaceId, 'contact', contactRef, existingId)
          contactRefs.set(refKey(contactRef), existingId)
        }
        // Mise à jour : on remplit les trous, on n'écrase rien.
        // #2159.26 — une fiche SANS étiquette reçoit celles du fichier ; une
        // fiche qui en porte déjà les garde (posées à la main depuis, peut-être).
        const incomingTags = normalizeTags(row['tags'])
        const currentTags = tagsByContact.get(existingId) ?? []
        if (currentTags.length === 0 && incomingTags.length > 0) {
          tally.snapshot.push({ id: existingId, created: false, fields: { tags: currentTags } })
          await this.contacts.update({ id: existingId, workspace_id: input.workspaceId }, { tags: incomingTags })
          tagsByContact.set(existingId, incomingTags)
        }
        tally.updated += 1
        return
      }

      // #4586 — jamais l'adresse pour nom : la partie locale lisible (marquée dérivée), sinon « à compléter ».
      const { name: fullName, derived: nameDerived } = writableContactName(
        String(withDedupInputs('contact', row)['name'] ?? ''),
        email,
      )
      // #4479 — la clé `idx_contacts_account_normalized_name` : UN nom normalisé par compte. Une ligne
      // dont le nom est déjà porté (en base, ou plus haut dans CE fichier) est une fiche CONNUE : on la
      // repère, on ne la modifie pas (jamais de fusion automatique) et l'import va au bout au lieu de
      // s'arrêter sur un 23505.
      const nameKey = normalizeFullName(fullName)
      let holders = nameHoldersByAccount.get(accountId)
      if (!holders) {
        holders = await nameHoldersOfAccount(this.contacts, accountId)
        nameHoldersByAccount.set(accountId, holders)
      }
      if (nameKey && holders.has(nameKey)) {
        tally.updated += 1
        return
      }

      const entity = this.contacts.create({
        account_id: accountId,
        user_id: input.userId,
        workspace_id: input.workspaceId,
        // M2.1 — « Prénom » + « Nom » d'un export de gestion se composent (même dérivation que la simulation).
        full_name: fullName,
        ...(nameDerived ? { raw_data: { nameDerivedFromEmail: true } } : {}),
        email: email || null,
        phone: typeof row['phone'] === 'string' ? row['phone'] : null,
        title: typeof row['title'] === 'string' ? row['title'] : null,
        // #2159.26 — la cellule « Tags » du fichier, découpée et normalisée.
        tags: normalizeTags(row['tags']),
        // La PROVENANCE, et pas `manual`. Un contact repris en masse n'a été
        // vérifié par personne ; le ranger avec les saisies à la main efface la
        // seule information qui permet, plus tard, de savoir à qui faire
        // confiance.
        source: 'import',
      })
      const saved = await this.contacts.save(entity)
      if (nameKey) holders.set(nameKey, saved.id)
      if (email) contactByEmail.set(email, saved.id)
      if (contactRef) {
        await this.writeRefLink(input.workspaceId, 'contact', contactRef, saved.id)
        contactRefs.set(refKey(contactRef), saved.id)
      }
      tally.snapshot.push({ id: saved.id, created: true, fields: {} })
      tally.created += 1
    })
  }
  /**
   * #1889 — Écrit des projets, rattachés à un compte EXISTANT.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * LE MÊME §7.3 QUE LES CONTACTS : LES SOCIÉTÉS D'ABORD
   * ─────────────────────────────────────────────────────────────────────────────
   * Une ligne dont la société n'est pas déjà dans l'espace est écartée avec
   * `unknown_company`. Créer le compte au passage produirait des doublons de
   * comptes — pire que la ligne perdue, parce qu'un doublon de compte se
   * propage dans tout le dossier de conquête.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * CE QU'ON N'INVENTE PAS, ET C'EST L'ESSENTIEL
   * ─────────────────────────────────────────────────────────────────────────────
   * · **`kind: 'imported'`**, jamais l'une des cinq natures dérivées. Une ligne
   *   reprise d'un fichier n'a été lue par aucune analyse ; la ranger en
   *   « douleur » la ferait compter dans un total qu'elle n'a pas mérité.
   * · **L'étape n'est reprise que si le fichier écrit l'une des NÔTRES.** Un
   *   « Négociation » de l'ancien outil n'est pas notre `negotiation` : les
   *   étapes se renomment par espace, et faire correspondre deux vocabulaires
   *   par ressemblance est exactement la devinette que le dépôt refuse. Sinon
   *   l'étape reste `detected` — la valeur qui dit « détecté, personne ne l'a
   *   encore regardé », et qui ne porte aucun montant.
   * · **Le montant n'est écrit que s'il est un nombre fini.** `null` reste
   *   `null` : le pipe valorisé ne somme que des montants réellement saisis, et
   *   un zéro de remplissage y ferait entrer une affaire à 0 €.
   * · **La clôture espérée vient de `endDate` seule**, et jamais d'un cycle
   *   moyen (la colonne le dit : « saisie, jamais déduite »).
   *
   * ⚠️ Une ligne déjà présente ne REMPLACE rien : elle remplit les trous
   * (détail, montant, clôture) et ne touche ni l'étape ni le libellé. Un projet
   * a une vie commerciale après son import ; l'écraser avec un export hérité
   * efface le travail fait depuis, et personne ne le retrouve.
   *
   * ⚠️ ASYMÉTRIE CONNUE, écrite ici pour qu'elle ne se redécouvre pas : l'index
   * unique de la table est `(account_id, kind, md5(label))`. La clé de l'import
   * est plus LARGE — même compte, même libellé, quelle que soit la nature — pour
   * qu'un ré-import ne pose pas une seconde ligne identique à l'écran. Elle ne
   * protège que ce sens : une matérialisation d'analyse qui dériverait plus tard
   * le même libellé sous une autre nature passerait, elle, sans conflit. C'est
   * la doctrine du dépôt — on PROPOSE une fusion, on ne fusionne jamais.
   */
  async writeProjects(input: ImportWriteInput): Promise<ImportWriteOutcome> {
    const accounts = await this.accounts.find({
      where: { workspace_id: input.workspaceId },
      select: ['id', 'company_name'],
    })
    const accountByName = new Map(accounts.map(a => [normaliseCompanyName(a.company_name), a.id]))

    const existing = await this.existingKeys(input.workspaceId, 'project')

    const tally = newTally()
    return runRows(input, tally, async row => {
      const company = String(row['company'] ?? '').trim()
      const label = String(row['label'] ?? '').trim()
      if (!label) return

      const accountId = company ? accountByName.get(normaliseCompanyName(company)) : undefined
      if (!accountId) {
        tally.skippedUnknownCompany += 1
        return
      }

      // La MÊME dérivation que la simulation, appelée et non recopiée.
      const key = dedupKeyOf('project', withDedupInputs('project', { ...row, company }))
      const matchId = key ? existing[key] : undefined

      const amountCents = toAmountCents(row['amount'])
      const closeOn = toIsoDate(row['endDate'])
      const detail = typeof row['detail'] === 'string' && row['detail'].trim() ? row['detail'].trim() : null

      if (matchId) {
        const current = await this.projects.findOne({
          where: { id: matchId },
          select: ['id', 'detail', 'amount_cents', 'expected_close_on'],
        })
        if (!current) return
        const patch: ProjectImportPatch = {}
        if (!current.detail && detail) patch.detail = detail
        if (current.amount_cents === null && amountCents !== null) patch.amount_cents = amountCents
        if (!current.expected_close_on && closeOn) patch.expected_close_on = closeOn
        if (Object.keys(patch).length === 0) return
        tally.snapshot.push({
          id: current.id,
          created: false,
          fields: {
            detail: current.detail,
            amount_cents: current.amount_cents,
            expected_close_on: current.expected_close_on,
          },
        })
        await this.projects.update({ id: current.id, workspace_id: input.workspaceId }, patch)
        tally.updated += 1
        return
      }

      const entity = this.projects.create({
        workspace_id: input.workspaceId,
        account_id: accountId,
        kind: 'imported',
        label,
        detail,
        // La PROVENANCE, comme pour un contact repris : ni une analyse, ni une
        // saisie à la main. C'est ce qui permet, plus tard, de savoir à quoi
        // faire confiance.
        source: 'import',
        stage: toKnownStage(row['stage']),
        amount_cents: amountCents,
        currency: amountCents !== null ? 'EUR' : null,
        expected_close_on: closeOn,
      })
      const saved = await this.projects.save(entity)
      if (key) existing[key] = saved.id
      tally.snapshot.push({ id: saved.id, created: true, fields: {} })
      tally.created += 1
    })
  }

  /**
   * #2148.25/#2850 — Écrit des besoins, rattachés à un compte EXISTANT.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * TOUJOURS UNE CRÉATION, JAMAIS UNE MISE À JOUR — ET C'EST VOULU
   * ─────────────────────────────────────────────────────────────────────────────
   * `DEDUP_KEYS.need` est vide dans le contrat (§7.6) : « deux besoins
   * identiques le même jour SONT deux besoins ». Contrairement aux contacts et
   * aux projets, il n'y a donc ni recherche de doublon ni mise à jour à faire
   * ici — chaque ligne valide devient une ligne neuve, comme `writeContacts`
   * le fait déjà pour la création pure.
   *
   * ⚠️ MÊME PORTE QUE LES PROJETS : une ligne dont la société n'est pas déjà
   * dans l'espace est écartée avec `unknown_company`, jamais devinée.
   *
   * `source: 'csv_import'` est l'une des onze valeurs DÉJÀ posées par la
   * contrainte SQL (`project_needs_source_check`, migration
   * `1789537604211-NeedFields.ts`) — aucune migration nouvelle : la colonne
   * anticipait cet appelant avant qu'il existe.
   */
  async writeNeeds(input: ImportWriteInput): Promise<ImportWriteOutcome> {
    const accounts = await this.accounts.find({
      where: { workspace_id: input.workspaceId },
      select: ['id', 'company_name'],
    })
    const accountByName = new Map(accounts.map(a => [normaliseCompanyName(a.company_name), a.id]))

    const tally = newTally()
    return runRows(input, tally, async row => {
      const company = String(row['company'] ?? '').trim()
      const title = String(row['title'] ?? '').trim()
      if (!title) return

      const accountId = company ? accountByName.get(normaliseCompanyName(company)) : undefined
      if (!accountId) {
        tally.skippedUnknownCompany += 1
        return
      }

      const entity = this.needs.create({
        workspace_id: input.workspaceId,
        account_id: accountId,
        title,
        // `owner_id` reste `null` : rien dans une ligne de fichier ne dit QUI
        // porte ce besoin — le deviner assignerait un commercial à sa place.
        source: 'csv_import',
        provenance: 'human',
      })
      const saved = await this.needs.save(entity)
      tally.snapshot.push({ id: saved.id, created: true, fields: {} })
      tally.created += 1
    })
  }

  /**
   * #2732.1 + #5022.1 (recette prod 31/10) — Écrit des MISSIONS, rattachées à un compte EXISTANT.
   *
   * La reprise des missions se simulait et ne s'écrivait pas : l'écran disait « terminé » et /missions restait vide.
   * MÊME porte que les projets et les besoins : une société qui n'est pas déjà dans l'espace est ÉCARTÉE, jamais
   * accompagnée d'un compte inventé. Chaque ligne refusée est NOMMÉE (`rejected` : numéro de ligne du fichier,
   * motif, société) — jamais un silence.
   *
   * Rien n'est deviné : pas de consultant affecté (le fichier ne dit pas lequel de nos talents c'est), pas de
   * porteur, pas de coût. Le TJM du fichier est le prix de vente (`daily_rate`). Un ré-import ne double pas :
   * `DEDUP_KEYS.mission` (compte + rôle + dates) — la ligne déjà là est refusée « already_exists », jamais fusionnée.
   *
   * Les valeurs posées (`active`, `ready_to_start`) sont DÉJÀ dans la contrainte SQL des missions : aucune valeur neuve
   * ne descend vers la base (GA-11). `import_sessions.type` accepte déjà `mission` (migration UniversalImport).
   */
  async writeMissions(input: ImportWriteInput): Promise<ImportWriteOutcome> {
    const repo = this.missions
    if (!repo) throw new ConflictException('La reprise des missions n’a pas d’écriture branchée.')
    const accounts = await this.accounts.find({
      where: { workspace_id: input.workspaceId },
      select: ['id', 'company_name'],
    })
    const accountByName = new Map(accounts.map(a => [normaliseCompanyName(a.company_name), a.id]))
    const known = await repo.find({
      where: { workspace_id: input.workspaceId, account_id: In([...accountByName.values()]) },
      select: ['id', 'account_id', 'role_title', 'started_on', 'ends_on'],
    })
    const keyOf = (accountId: string, role: string, start: string | null, end: string | null) =>
      [accountId, role.toLowerCase(), start ?? '', end ?? ''].join('|')
    const existing = new Set(known.map(m => keyOf(m.account_id, (m.role_title ?? '').trim(), m.started_on, m.ends_on)))
    const today = new Date().toISOString().slice(0, 10)

    const tally = newTally()
    const rejected: ImportRejectedRow[] = []
    const outcome = await runRows(input, tally, async row => {
      const line = input.rows.indexOf(row) + 1
      const company = String(row['company'] ?? '').trim()
      const role = String(row['role'] ?? row['label'] ?? '').trim()
      if (!company) {
        rejected.push({ row: line, reason: 'missing_company', detail: null })
        return
      }
      const accountId = accountByName.get(normaliseCompanyName(company))
      if (!accountId) {
        tally.skippedUnknownCompany += 1
        rejected.push({ row: line, reason: 'unknown_company', detail: company })
        return
      }
      if (!role) {
        rejected.push({ row: line, reason: 'missing_label', detail: company })
        return
      }
      const startedOn = toIsoDate(row['startDate'])
      const endsOn = toIsoDate(row['endDate'])
      if (startedOn && endsOn && endsOn < startedOn) {
        rejected.push({ row: line, reason: 'end_before_start', detail: company })
        return
      }
      const key = keyOf(accountId, role, startedOn, endsOn)
      if (existing.has(key)) {
        rejected.push({ row: line, reason: 'already_exists', detail: company })
        return
      }
      const rate =
        typeof row['dailyRate'] === 'number'
          ? row['dailyRate']
          : Number(String(row['dailyRate'] ?? '').replace(',', '.'))
      const entity = repo.create({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        account_id: accountId,
        label: role,
        role_title: role,
        // Une mission qui n'a pas commencé n'est pas « en cours » ; sans date de début on pose « en cours », la valeur
        // d'une mission saisie à la main, jamais un statut deviné d'un champ absent.
        status: startedOn && startedOn > today ? 'ready_to_start' : 'active',
        started_on: startedOn,
        ends_on: endsOn,
        daily_rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      })
      const saved = await repo.save(entity)
      existing.add(key)
      tally.snapshot.push({ id: saved.id, created: true, fields: {} })
      tally.created += 1
    })
    return rejected.length > 0 ? { ...outcome, rejected } : outcome
  }

  /**
   * #2148.25/#2850 (reste, 27/09) — Écrit le vivier (`talent`), sans compte.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI CET OBJET N'A PAS ATTENDU UNE DÉCISION DE DÉDUP
   * ─────────────────────────────────────────────────────────────────────────────
   * Les trois lots précédents (25-26/09) ont classé `talent`/CV HORS LOT au
   * même titre que `need`, en jugeant le risque de dédup « trop incertain sans
   * décision produit ». Relecture du contrat : `DEDUP_KEYS.talent` n'est PAS
   * vide, contrairement à `need` — `email`/`phone`/`name+lastEmployer` sont
   * déclarées depuis toujours (`import.ts`). Il n'y avait rien à trancher,
   * seulement un appelant à écrire.
   *
   * ⚠️ MÊME RESTRICTION QUE `writeContacts` : l'écriture n'indexe la base que
   * sur les clés qui sont des COLONNES réelles (`email`, `phone`) — pas sur
   * `name+lastEmployer`, qui n'a pas de colonne dédiée ici et resterait une
   * comparaison approximative sur un champ jamais stocké tel quel. Un talent qui
   * ne matche que par ce troisième critère crée une fiche neuve, comme un
   * contact qui ne matche que par `name+company` aujourd'hui.
   *
   * `review_status: 'needs_review'` — la règle que l'entité documente
   * elle-même : une fiche née d'une extraction (ici, un import en masse) n'est
   * jamais rangée sous le défaut `qualified`, réservé aux fiches saisies à la
   * main. Aucune migration : `email`, `phone`, `full_name`, `source`,
   * `review_status` existent depuis `1789374912846-TalentPool`/`1789567342915-
   * TalentIntake` — la colonne anticipait cet appelant avant qu'il existe.
   */
  async writeTalents(input: ImportWriteInput): Promise<ImportWriteOutcome> {
    const emails = input.rows.map(row => String(row['email'] ?? '').toLowerCase()).filter(Boolean)
    const phones = input.rows.map(row => String(row['phone'] ?? '').trim()).filter(Boolean)
    const known =
      emails.length > 0 || phones.length > 0
        ? await this.talents.find({
            where: [
              ...(emails.length > 0 ? [{ workspace_id: input.workspaceId, email: In(emails) }] : []),
              ...(phones.length > 0 ? [{ workspace_id: input.workspaceId, phone: In(phones) }] : []),
            ],
            select: ['id', 'email', 'phone'],
          })
        : []
    const byEmail = new Map(known.filter(t => t.email).map(t => [(t.email ?? '').toLowerCase(), t.id]))
    const byPhone = new Map(known.filter(t => t.phone).map(t => [(t.phone ?? '').trim(), t.id]))

    const tally = newTally()
    return runRows(input, tally, async row => {
      const email = String(row['email'] ?? '').toLowerCase()
      const phone = String(row['phone'] ?? '').trim()
      const name = String(row['name'] ?? row['fullName'] ?? '').trim()

      const existingId = (email ? byEmail.get(email) : undefined) ?? (phone ? byPhone.get(phone) : undefined)
      if (existingId) {
        const patch: Partial<ConsultantEntity> = {}
        if (phone) patch.phone = phone
        if (Object.keys(patch).length === 0) {
          tally.updated += 1
          return
        }
        tally.snapshot.push({ id: existingId, created: false, fields: {} })
        await this.talents.update({ id: existingId, workspace_id: input.workspaceId }, patch)
        tally.updated += 1
        return
      }

      const entity = this.talents.create({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        full_name: name || null,
        email: email || null,
        phone: phone || null,
        title: typeof row['title'] === 'string' && row['title'].trim() ? row['title'].trim() : null,
        // La PROVENANCE, comme pour un besoin repris : ni une analyse, ni une
        // saisie à la main.
        source: 'csv_import',
        // Née d'une extraction en masse, jamais rangée sous le défaut
        // `qualified` — la règle que l'entité documente elle-même.
        review_status: 'needs_review',
      })
      const saved = await this.talents.save(entity)
      if (email) byEmail.set(email, saved.id)
      if (phone) byPhone.set(phone, saved.id)
      tally.snapshot.push({ id: saved.id, created: true, fields: {} })
      tally.created += 1
    })
  }

  /* ---------------------------------------------------------------------- */
  /*  L'ANNULATION — la garde du scénario « un import détruit trois ans de    */
  /*  données CRM »                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * L'état actuel des objets d'un instantané, pour que la DÉCISION d'annuler
   * puisse se prendre sur des faits.
   *
   * `lastWriteBy` vient de `field_provenance` : c'est la seule source qui sache
   * si un HUMAIN a retouché l'objet depuis l'import. Sans elle, on annulerait
   * une correction faite à la main — la seule chose qu'un rollback ne doit pas
   * pouvoir faire, parce qu'elle est invisible et qu'elle n'existe nulle part
   * ailleurs.
   *
   * Une provenance illisible vaut `null`, donc « pas touché par un humain » :
   * ⚠️ le repli va dans le sens de l'ANNULATION. C'est assumé — l'inverse
   * (tout protéger au moindre doute) rendrait l'annulation inutile, et
   * l'annulation est précisément le filet du scénario le plus grave.
   */
  async currentStateOf(
    object: RevertibleObject,
    ids: readonly string[],
  ): Promise<Record<string, { updatedAt: Date | null; lastWriteBy: 'human' | 'connector' | null }>> {
    if (ids.length === 0) return {}
    const repo = this.repoOf(object)
    const rows = await repo.find({ where: { id: In([...ids]) }, select: ['id', 'updated_at'] })
    const state: Record<string, { updatedAt: Date | null; lastWriteBy: 'human' | 'connector' | null }> = {}
    for (const row of rows) state[row.id] = { updatedAt: row.updated_at ?? null, lastWriteBy: null }

    try {
      const provenance = await repo.manager.query<{ entity_id: string; source: string }[]>(
        `SELECT DISTINCT ON (entity_id) entity_id, source
           FROM field_provenance
          WHERE entity_type = $1 AND entity_id = ANY($2)
          ORDER BY entity_id, updated_at DESC`,
        [object, [...ids]],
      )
      for (const row of provenance) {
        const entry = state[row.entity_id]
        if (entry && (row.source === 'human' || row.source === 'connector')) entry.lastWriteBy = row.source
      }
    } catch (error) {
      // La provenance manque : on le DIT bruyamment plutôt que d'annuler en
      // croyant savoir. Le repli reste l'annulation, mais il ne doit pas être
      // silencieux.
      this.logger.error('Provenance illisible avant annulation d’import', { error, tags: { object } })
    }
    return state
  }

  /**
   * Remet les objets dans l'état d'AVANT l'import.
   *
   * Deux gestes, et un seul est une écriture destructive :
   *  · un objet MODIFIÉ retrouve les valeurs de l'instantané ;
   *  · un objet CRÉÉ est **archivé**, jamais supprimé. Effacer serait
   *    irréversible, et l'annulation d'une annulation n'existe pas. Un compte
   *    archivé reste consultable et se réactive.
   *
   * ⚠️ **Cette phrase disait « ni les contacts ni les projets n'ont d'état
   * d'archive », et elle était FAUSSE** — mesuré en production le 11/09/2026 :
   * une session d'import de projets affichée « annulé · 3 créé(s) », et les
   * trois projets toujours dans le pipe, avec leur montant. Les deux objets ont
   * bien un état d'archive, écrit et documenté ailleurs dans ce dépôt : un
   * contact a `deleted_at` (« sort de toutes les listes mais garde sa ligne »),
   * un projet a l'étape `dormant` avec son issue `abandoned`. C'est le
   * commentaire qui manquait à la vérité, pas la base — et c'est sur lui que le
   * lot suivant décidait.
   *
   * L'aiguillage est désormais EXHAUSTIF par le type, comme `repoOf` : rendre
   * un nouvel objet writable sans lui donner d'annulation ne compile plus. Un
   * import qui écrit sans pouvoir s'annuler est le scénario que toute cette
   * section existe pour empêcher — et la porte d'écriture s'est élargie aux
   * projets le 11/09 sans que celle du retour ne suive.
   */
  async revert(input: {
    object: RevertibleObject
    snapshot: readonly ImportSnapshot[]
    ids: readonly string[]
  }): Promise<{ restored: number; archived: number; leftInPlace: number }> {
    const wanted = new Set(input.ids)
    let restored = 0
    let archived = 0
    let leftInPlace = 0

    for (const entry of input.snapshot) {
      if (!wanted.has(entry.id)) continue
      if (entry.created) {
        // `affected === 0` = la ligne n'existe plus (supprimée depuis l'import) :
        // il n'y a rien à archiver, et le dire vaut mieux que compter une
        // archive qui n'a pas eu lieu. C'est le seul cas qui alimente encore
        // `leftInPlace`, et il est REEL — jamais un objet qu'on aurait su
        // archiver mais qu'on aurait laissé.
        const affected = await this.archiveCreated(input.object, entry.id)
        if (affected > 0) archived += 1
        else leftInPlace += 1
        continue
      }
      const repo = this.repoOf(input.object)
      // Les valeurs d'AVANT, telles qu'elles ont été relevées. Un champ absent
      // de l'instantané n'est pas touché : on ne restaure que ce qu'on a
      // réellement remplacé.
      // Les valeurs de l'instantané sont un enregistrement libre : elles ont été
      // RELEVÉES sur la ligne, colonne par colonne, donc leur forme est celle de
      // l'entité. Le typage explicite dit ce qu'on écrit au lieu de l'éteindre.
      await repo.update(
        { id: entry.id },
        entry.fields as QueryDeepPartialEntity<
          AccountEntity & ContactEntity & ProjectEntity & ProjectNeedEntity & ConsultantEntity
        >,
      )
      restored += 1
    }
    return { restored, archived, leftInPlace }
  }

  /**
   * Le dépôt d'un objet annulable.
   *
   * Exhaustif par le TYPE : ajouter un objet à `WRITABLE_IMPORT_OBJECTS` sans
   * lui donner de dépôt ne compile pas. La version d'avant était un ternaire
   * binaire — tout ce qui n'était pas `account` tombait sur les contacts, et un
   * troisième objet s'y serait écrit en silence.
   */
  /**
   * Archiver un objet CRÉÉ par l'import — jamais le supprimer.
   *
   * Exhaustif par le TYPE, exactement comme {@link repoOf} : un objet rendu
   * writable sans son geste d'archive ne compile pas. Chaque branche utilise
   * l'état d'archive que le reste du dépôt utilise déjà pour cet objet, jamais
   * un état inventé pour l'occasion :
   *  · un compte passe `archived` — il reste consultable et se réactive ;
   *  · un contact prend `deleted_at` — sa ligne reste, les activités et
   *    positionnements qui le citent aussi (voir `contact.entity.ts`) ;
   *  · un projet passe `dormant` avec l'issue `abandoned` et sa date de
   *    clôture — il sort du pipe et des totaux sans disparaître du dossier.
   *    `abandoned` et non `lost` : personne n'a perdu, l'import a été défait,
   *    et compter un abandon comme une perte fausserait la transformation.
   *  · un besoin reçoit `archived_at` — la MÊME colonne que le rangement
   *    manuel (#2173.49, décision Louis 17/09/2026 : « un rangement neutre,
   *    `status` ne bouge JAMAIS pour ce geste ») : l'annulation d'un import
   *    range le besoin exactement comme le geste humain le ferait, jamais un
   *    état inventé pour l'occasion.
   *  · un talent reçoit `archived_at` — la MÊME colonne que `archive()` /
   *    `archiveBulk()` de `ConsultantsService` (« sorti du vivier ACTIF,
   *    données conservées », §13.2) : il sort du vivier sans disparaître.
   *    `archived_reason` reste `null` : aucun humain n'a donné de raison, en
   *    inventer une romprait le champ (texte libre, jamais un code deviné).
   *
   * Les deux valeurs de projet sont DÉJÀ dans la contrainte SQL
   * (`opportunities_stage_check`, `opportunities_outcome_check`, migration
   * `1789344812907`) : aucune valeur neuve ne descend vers la base ici.
   */
  private async archiveCreated(object: RevertibleObject, id: string): Promise<number> {
    switch (object) {
      case 'account':
        // #4053.9 — les DEUX colonnes que pose `AccountsService.archive` : la liste lit le tri
        // commercial, et un compte archivé à demi restait sous « À trier », « Archiver » grisé.
        return affectedRows(await this.accounts.update({ id }, { status: 'archived', commercial_status: 'archived' }))
      case 'contact':
        return affectedRows(await this.contacts.update({ id }, { deleted_at: new Date() }))
      case 'project':
        return affectedRows(
          await this.projects.update({ id }, { stage: 'dormant', outcome: 'abandoned', closed_at: new Date() }),
        )
      case 'need':
        return affectedRows(await this.needs.update({ id }, { archived_at: new Date() }))
      case 'talent':
        return affectedRows(await this.talents.update({ id }, { archived_at: new Date() }))
      case 'mission':
        // #2732.1 — « archivée » : l'état d'archive que la table des statuts porte déjà ; on n'efface pas une mission.
        return this.missions ? affectedRows(await this.missions.update({ id }, { status: 'archived' })) : 0
    }
  }

  private repoOf(
    object: RevertibleObject,
  ): Repository<AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity> {
    switch (object) {
      case 'account':
        return this.accounts as Repository<
          AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity
        >
      case 'contact':
        return this.contacts as Repository<
          AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity
        >
      case 'project':
        return this.projects as Repository<
          AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity
        >
      case 'need':
        return this.needs as Repository<
          AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity
        >
      case 'talent':
        return this.talents as Repository<
          AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity
        >
      case 'mission':
        return this.missions as unknown as Repository<
          AccountEntity | ContactEntity | ProjectEntity | ProjectNeedEntity | ConsultantEntity
        >
    }
  }
}

/**
 * Les objets dont l'écriture est branchée, vus par l'ANNULATION.
 *
 * Le MÊME type que la liste du contrat, jamais réécrit : un objet qui devient
 * writable devient annulable dans le même geste, et le compilateur le rappelle
 * en exigeant son dépôt dans `repoOf`. Un import qui écrit sans pouvoir
 * s'annuler est le scénario que toute cette section existe pour empêcher.
 */
/** Combien de lignes un `UPDATE` a réellement touchées. `affected` est
 *  `number | null | undefined` selon le driver : un `null` se lit « je ne sais
 *  pas », jamais « zéro » — et ici on préfère alors créditer l'archive, parce
 *  que la requête est partie et que compter un échec qu'on n'a pas constaté
 *  ferait annoncer « laissé en place » à tort. */
function affectedRows(result: { affected?: number | null }): number {
  return result.affected ?? 1
}

/** #4053.3 — les colonnes du PROFIL d'un compte qu'un fichier peut renseigner (secteur, effectif, siège). */
const REF_SOURCE = universalImportSourceOf(null)
const refKey = (ref: string): string => universalImportSourceRefKey(REF_SOURCE, ref)
/** La référence lue dans une cellule : vide ⇒ `null`, jamais une chaîne vide qui rapprocherait tout. */
const refOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

const PROFILE_FIELDS = ['sector', 'employees', 'headquarters'] as const

type RevertibleObject = WritableImportObject

type ImportWriteInput = Parameters<ImportRowWriter['writeAccounts']>[0]

/** Les compteurs d'un passage d'écriture, mutés ligne à ligne. */
type Tally = { created: number; updated: number; skippedUnknownCompany: number; snapshot: ImportSnapshot[] }

function newTally(): Tally {
  return { created: 0, updated: 0, skippedUnknownCompany: 0, snapshot: [] }
}

/**
 * La boucle d'écriture, et le point de reprise qu'elle pose en chemin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE CHANGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant elle, une exception à la ligne 4 000 sur 17 000 remontait telle quelle :
 * les 4 000 lignes restaient en base, l'instantané mourait avec la pile, et
 * l'annulation devenait impossible dans le cas exact pour lequel elle existe.
 *
 * Maintenant : on s'arrête, on rend ce qui a été fait, et on dit **où** et
 * **avec quel degré de certitude**. `dispatchFailureOutcome` tranche le seul
 * point qui compte — la requête a-t-elle pu PARTIR ? Une connexion jamais
 * établie est rejouable ; une requête partie sans réponse est un `unknown`, et
 * `unknown` ARRÊTE la reprise.
 *
 * Le point de reprise s'écrit tous les {@link IMPORT_CHECKPOINT_ROWS} : un
 * point posé uniquement à la fin ne survit à rien, puisque c'est la fin qui
 * n'arrive pas.
 */
async function runRows(
  input: ImportWriteInput,
  tally: Tally,
  writeOne: (row: Record<string, unknown>) => Promise<void>,
): Promise<ImportWriteOutcome> {
  let processedRows = input.startAt
  for (let index = input.startAt; index < input.rows.length; index += 1) {
    const row = input.rows[index]
    if (!row) break
    try {
      await writeOne(row)
    } catch (error) {
      return {
        ...tally,
        processedRows,
        failure: {
          row: index,
          outcome: dispatchFailureOutcome(error),
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
    processedRows = index + 1
    if (input.checkpoint && (processedRows - input.startAt) % IMPORT_CHECKPOINT_ROWS === 0) {
      await input.checkpoint({ ...tally, processedRows, failure: null })
    }
  }
  return { ...tally, processedRows, failure: null }
}

/**
 * Les SEULS champs qu'un ré-import peut poser sur un projet existant.
 *
 * Un type étroit, et pas `Partial<ProjectEntity>` : le second laisserait écrire
 * l'étape, le libellé ou le résultat d'une affaire depuis un fichier hérité.
 * Trois trous se remplissent, rien d'autre ne bouge.
 */
type ProjectImportPatch = {
  detail?: string
  amount_cents?: string
  expected_close_on?: string
}

/**
 * La clé de dédup d'un projet déjà en base — la MÊME forme que celle du fichier.
 *
 * `dedupKeyOf('project', …)` compose `normalizedName+label:<valeurs>`, en
 * minuscules et détourées. La recomposer ici à la main serait une deuxième
 * dérivation ; elle est donc écrite une fois, et les deux côtés l'appellent.
 */
function projectKey(companyName: string | null, label: string | null): string | null {
  if (!companyName || !label) return null
  return dedupKeyOf('project', { normalizedName: normaliseCompanyName(companyName), label })
}

/**
 * Le montant en CENTIMES, ou `null`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ MESURÉ EN PRODUCTION LE 11/09/2026 : UN FACTEUR 100
 * ─────────────────────────────────────────────────────────────────────────────
 * Un import de recette portant « 180000 » a écrit `1 800 000 000` centimes, soit
 * 18 millions d'euros pour une affaire à 180 k€. La cause : la ligne qui arrive
 * ici est DÉJÀ normalisée — `applyNormalisation` a fait tourner la règle
 * `amount_cents` (`normaliseAmountCents`, `import-engine.ts`) et rend un NOMBRE
 * de centimes. Multiplier par cent une seconde fois était une deuxième
 * dérivation du même calcul, et deux dérivations divergent toujours.
 *
 * La distinction est donc sur le TYPE, et elle n'est pas cosmétique :
 * · un NOMBRE vient de la règle de normalisation → il est déjà en centimes ;
 * · une CHAÎNE veut dire que l'opérateur a DÉSACTIVÉ la règle (`disabledRules`)
 *   → on appelle la même fonction que le moteur, jamais une conversion écrite
 *   à la main ici.
 *
 * ⚠️ `null` n'est jamais `0` : la colonne le dit en toutes lettres (« NULL =
 * jamais saisi, jamais 0 »), et le pipe valorisé ne somme que ce qui a été
 * réellement saisi. Une cellule vide, illisible, nulle ou négative vaut `null`.
 */
function toAmountCents(raw: unknown): string | null {
  const cents = typeof raw === 'number' ? raw : typeof raw === 'string' ? normaliseAmountCents(raw) : null
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return null
  return String(Math.round(cents))
}

/** Une date ISO `YYYY-MM-DD`, ou `null`. La normalisation du moteur est déjà passée. */
function toIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

/**
 * L'étape du fichier — et SEULEMENT si c'est l'une des nôtres.
 *
 * Aucune correspondance devinée : « Négociation » dans l'ancien outil n'est pas
 * notre `negotiation`, les libellés d'étape se renomment par espace, et
 * rapprocher deux vocabulaires par ressemblance est la devinette que ce dépôt
 * refuse partout ailleurs. Ce qu'on ne reconnaît pas retombe sur `detected` :
 * « détecté, personne ne l'a encore regardé ».
 */
function toKnownStage(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (PROJECT_STAGES as readonly string[]).includes(value) ? value : 'detected'
}

/**
 * Les clés de dédup d'un compte DÉJÀ EN BASE, dans l'ordre du §7.6 — par le
 * MÊME moteur que la ligne du fichier (#2079.10).
 *
 * Cette fonction posait ses trois clés à la main. Deux d'entre elles tombaient
 * juste par accident ; la troisième, non : elle écrivait
 * `domain:${website.toLowerCase()}` avec la valeur BRUTE, là où la ligne passe
 * par `normaliseDomain` (`withDedupInputs`). Un compte enregistré
 * « https://www.acme.fr/ » ne rencontrait donc jamais une ligne portant
 * « acme.fr », et l'import créait un second compte pour une société déjà
 * suivie — sur le signal le plus fort après le SIREN.
 *
 * Le compte est projeté en LIGNE (`company` / `siren` / `website`), puis passe
 * exactement par où la ligne passe. Une dérivation vit à un seul endroit ; les
 * deux côtés de la comparaison doivent venir de celui-là, sinon comparer ne
 * veut rien dire.
 *
 * ⚠️ `dedupKeysOf` et non `dedupKeyOf` : le compte en base est INDEXÉ sur
 * toutes ses clés (une ligne qui n'a que le nom doit le retrouver), là où la
 * ligne n'en cherche qu'une, la plus forte. Deux questions, une dérivation.
 *
 * ⚠️ Ça ne touche PAS #2079.13 : le refus de fusionner sur le nom seul regarde
 * QUELLE clé a matché (`normalizedName:`), pas la façon de la calculer.
 */
function accountKeys(account: Pick<AccountEntity, 'company_name' | 'siren' | 'website'>): string[] {
  return dedupKeysOf(
    'account',
    withDedupInputs('account', {
      company: account.company_name,
      siren: account.siren ?? undefined,
      website: account.website ?? undefined,
    }),
  )
}

/** #4599.2 — l'adresse d'une ligne de contact, en minuscules ; un gabarit sort vide (la ligne reste, sans adresse). */
function contactEmailOf(row: Record<string, unknown>): string {
  return refusePlaceholderEmail(String(row['email'] ?? '')).email?.toLowerCase() ?? ''
}
