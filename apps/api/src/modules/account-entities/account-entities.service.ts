import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  DEFAULT_ENTITY_NAME,
  accountEntityIdentityProblem,
  entityLabelKey,
  normaliseEntityLabel,
  normaliseSiret,
  resolveEntityIdForContact,
  siteHeadcountProvenanceProblem,
  type AccountBillingProfile,
  type AccountEntity,
  type CreateAccountEntity,
  type CreateSite,
  type Site,
  type UpdateAccountEntity,
} from '@bellum/contracts'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { SiteEntity } from '../../database/entities/site.entity'

/**
 * Les entités et les sites d'un compte (PDF 2 §2).
 *
 * Le service reçoit l'espace en PARAMÈTRE et ne le résout pas lui-même : la
 * règle §3.2 veut qu'un service n'aille pas chercher le service d'un autre
 * module, et le contrôleur est la couche qui connaît l'appelant.
 *
 * Ce qu'il ne fait PAS, délibérément : créer une entité à partir d'un libellé
 * qu'un modèle a écrit. Le pipeline remplit `contacts.entity` en texte libre ;
 * un rattachement automatique par ressemblance remplirait le compte de
 * divisions jumelles (« Direction Innovation » / « Direction de l'Innovation »)
 * que personne n'a validées. Un libellé inconnu envoie donc le contact au
 * périmètre non déterminé, où il reste VISIBLE et rattachable à la main.
 */
@Injectable()
export class AccountEntitiesService {
  constructor(
    @InjectRepository(AccountEntityRow)
    private readonly entities: Repository<AccountEntityRow>,
    @InjectRepository(SiteEntity)
    private readonly sites: Repository<SiteEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  /**
   * Les divisions d'un compte, après réconciliation.
   *
   * La réconciliation est faite ICI, à la lecture, et c'est délibéré : les
   * contacts s'écrivent par une demi-douzaine de chemins (analyse, import CSV,
   * enrichissement, saisie manuelle, reprise CRM), et brancher la création
   * d'entité sur chacun garantirait d'en oublier un — c'est exactement la
   * famille de défauts que ce dépôt a déjà payée plusieurs fois. Un seul
   * endroit, idempotent, qui rattrape tout le monde. Même mécanique que les
   * routines, dont la première consultation de l'écran matérialise les défauts.
   */
  async listEntities(workspaceId: string, accountId: string): Promise<{ items: AccountEntity[] }> {
    await this.reconcileAccount(workspaceId, accountId)
    const rows = await this.entities.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      // Le périmètre non déterminé EN DERNIER : c'est le fourre-tout, pas la
      // division qu'on veut lire en premier.
      order: { is_default: 'ASC', name: 'ASC' },
    })
    return { items: rows.map(toEntityWire) }
  }

  /**
   * Crée les entités que les libellés déjà saisis nomment, et rattache les
   * contacts qui n'ont pas encore de clé.
   *
   * Ne crée RIEN d'autre : un libellé absent ne fabrique pas de division, et un
   * contact déjà rattaché n'est jamais redéplacé — quelqu'un a pu le corriger à
   * la main, et une réconciliation qui écrase une correction humaine est pire
   * que pas de réconciliation.
   */
  async reconcileAccount(workspaceId: string, accountId: string): Promise<void> {
    const contacts = await this.contacts.find({
      where: { account_id: accountId, workspace_id: workspaceId },
      select: ['id', 'entity', 'entity_id'],
    })
    const orphans = contacts.filter(contact => !contact.entity_id)
    if (orphans.length === 0) return

    const existing = await this.entities.find({ where: { workspace_id: workspaceId, account_id: accountId } })
    const byKey = new Map(existing.map(row => [entityLabelKey(row.name), row.id]))
    let fallbackId = existing.find(row => row.is_default)?.id ?? null

    const missing = new Map<string, string>()
    let needsFallback = false
    for (const contact of orphans) {
      const label = normaliseEntityLabel(contact.entity)
      if (!label) {
        needsFallback = true
        continue
      }
      const key = entityLabelKey(label)
      // La PREMIÈRE graphie rencontrée gagne. Laisser la dernière écraser les
      // précédentes rendrait le nom de la division dépendant de l'ordre de
      // lecture — « DSI Groupe » un jour, « dsi  groupe » le lendemain.
      if (!byKey.has(key) && !missing.has(key)) missing.set(key, label)
    }

    if (missing.size > 0) {
      const created = await this.entities.save(
        [...missing.values()].map(name =>
          this.entities.create({
            workspace_id: workspaceId,
            account_id: accountId,
            name,
            kind: 'unknown',
            is_default: false,
            rank1_incumbent: 'unknown',
          }),
        ),
      )
      for (const row of created) byKey.set(entityLabelKey(row.name), row.id)
    }
    if (needsFallback && !fallbackId) {
      fallbackId = (await this.ensureDefaultEntity(workspaceId, accountId)).id
    }

    // Les orphelins d'une MÊME division s'écrivent en UNE requête (#3473 : un
    // UPDATE par contact faisait attendre l'onglet Accès sur un gros compte).
    // `entity_id IS NULL` reste dans la clause : une correction humaine posée
    // entre la lecture et l'écriture n'est jamais écrasée.
    const idsByEntity = new Map<string, string[]>()
    for (const contact of orphans) {
      const label = normaliseEntityLabel(contact.entity)
      const entityId = label ? (byKey.get(entityLabelKey(label)) ?? fallbackId) : fallbackId
      if (!entityId) continue
      const ids = idsByEntity.get(entityId)
      if (ids) ids.push(contact.id)
      else idsByEntity.set(entityId, [contact.id])
    }
    for (const [entityId, ids] of idsByEntity) {
      await this.contacts.update({ id: In(ids), entity_id: IsNull() }, { entity_id: entityId })
    }
  }

  /**
   * L'IDENTITÉ LÉGALE, refusée plutôt que rattrapée (31/08/2026).
   *
   * Le jugement vit dans `accountEntityIdentityProblem` (contrats, testé à
   * part) : ce service NORMALISE et REFUSE, il ne décide pas ce qui est
   * acceptable — une seconde règle écrite ici divergerait de celle que la
   * saisie du navigateur applique déjà.
   *
   * ⚠️ Le SIREN de comparaison est celui qui SERA en base après ce patch, pas
   * celui qui y est. Sans ça, saisir « nouveau SIREN + son SIRET » en un seul
   * geste échouerait en comparant le SIRET neuf à l'ancien SIREN.
   */
  private normalisedIdentity(
    input: Pick<UpdateAccountEntity, 'siret' | 'identity_source' | 'identity_checked_on'>,
    effectiveSiren: string | null,
  ): string | null {
    const problem = accountEntityIdentityProblem({
      siret: input.siret ?? null,
      siren: effectiveSiren,
      identity_source: input.identity_source ?? null,
      identity_checked_on: input.identity_checked_on ?? null,
    })
    return problem
  }

  async createEntity(workspaceId: string, accountId: string, input: CreateAccountEntity): Promise<AccountEntity> {
    const name = input.name.trim()
    await this.assertNameFree(workspaceId, accountId, name)
    const siren = input.siren?.trim() || null
    const identityProblem = this.normalisedIdentity(input, siren)
    if (identityProblem) throw new BadRequestException(identityProblem)
    if (input.is_billing === true) await this.clearBillingDesignation(workspaceId, accountId)
    const saved = await this.entities.save(
      this.entities.create({
        workspace_id: workspaceId,
        account_id: accountId,
        name,
        kind: input.kind ?? 'unknown',
        siren,
        // ⚠️ `normaliseSiret` REND `null` sur tout ce qui n'est pas quatorze
        // chiffres — mais le refus a déjà eu lieu au-dessus. Ici, il ne fait
        // que retirer les séparateurs de saisie : la valeur stockée est celle
        // qu'on compare, jamais celle qu'on affiche.
        siret: normaliseSiret(input.siret),
        identity_source: input.identity_source ?? null,
        identity_checked_on: input.identity_checked_on ?? null,
        domain: input.domain?.trim().toLowerCase() || null,
        is_default: false,
        rank1_incumbent: input.rank1_incumbent ?? 'unknown',
        rank1_note: input.rank1_note?.trim() || null,
        is_billing: input.is_billing ?? false,
        legal_name: input.legal_name?.trim() || null,
        // ⚠️ `??` et non `||` : voir `toEntityWire`. `0` = comptant.
        payment_terms_days: input.payment_terms_days ?? null,
        contract_expires_on: input.contract_expires_on ?? null,
        billing_contact_id: input.billing_contact_id ?? null,
      }),
    )
    return toEntityWire(saved)
  }

  async updateEntity(workspaceId: string, id: string, input: UpdateAccountEntity): Promise<AccountEntity> {
    const row = await this.entities.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Entité introuvable dans cet espace.')

    // Patch PRESENT-ONLY : un champ absent du corps n'est pas un champ à vider.
    if (input.name !== undefined) {
      const name = input.name.trim()
      // Renommer le périmètre non déterminé le ferait disparaître des écrans
      // qui le reconnaissent, et les contacts orphelins avec lui.
      if (row.is_default) throw new BadRequestException('Le périmètre non déterminé ne se renomme pas.')
      if (name.toLowerCase() !== row.name.toLowerCase()) {
        await this.assertNameFree(workspaceId, row.account_id, name)
      }
      row.name = name
    }
    if (input.kind !== undefined) row.kind = input.kind

    // L'IDENTITÉ LÉGALE (31/08/2026). Jugée AVANT toute écriture, et sur l'état
    // RÉSULTANT : le SIREN comparé est celui que ce patch pose s'il en pose un.
    const effectiveSiren = input.siren !== undefined ? input.siren?.trim() || null : row.siren
    // ⚠️ Jugée SEULEMENT si le patch touche l'identité. Une ligne écrite avant
    // la contrainte du 31/08 peut porter un couple incomplet ; la juger à
    // chaque écriture rendrait l'entité INMODIFIABLE — renommer une division
    // échouerait sur un défaut que le renommage n'a pas causé et ne peut pas
    // réparer. Corriger l'identité reste possible, et c'est le seul geste que
    // ce contrôle doit garder.
    const touchesIdentity =
      input.siren !== undefined ||
      input.siret !== undefined ||
      input.identity_source !== undefined ||
      input.identity_checked_on !== undefined
    const identityProblem = !touchesIdentity
      ? null
      : this.normalisedIdentity(
          {
            siret: input.siret !== undefined ? input.siret : row.siret,
            // La colonne est un `text` libre en base (la contrainte SQL en tient la
            // liste) ; le contrat en tient la LISTE côté code. Le cast dit lequel
            // des deux fait autorité pour le typage, et la contrainte reste seule
            // juge de ce qui entre.
            identity_source:
              input.identity_source !== undefined
                ? input.identity_source
                : (row.identity_source as CreateAccountEntity['identity_source']),
            // ⚠️ `String(...).slice(0, 10)` : une colonne `date` peut remonter en
            // `Date` selon le pilote, et le jugement compare des chaînes. Même
            // précaution que `contract_expires_on` juste à côté.
            identity_checked_on:
              input.identity_checked_on !== undefined ? input.identity_checked_on : toDay(row.identity_checked_on),
          },
          effectiveSiren,
        )
    if (identityProblem) throw new BadRequestException(identityProblem)

    if (input.siren !== undefined) row.siren = effectiveSiren
    if (input.siret !== undefined) row.siret = normaliseSiret(input.siret)
    if (input.identity_source !== undefined) row.identity_source = input.identity_source ?? null
    if (input.identity_checked_on !== undefined) row.identity_checked_on = input.identity_checked_on ?? null
    if (input.domain !== undefined) row.domain = input.domain?.trim().toLowerCase() || null
    if (input.rank1_incumbent !== undefined) row.rank1_incumbent = input.rank1_incumbent
    if (input.rank1_note !== undefined) row.rank1_note = input.rank1_note?.trim() || null

    // LE DOSSIER DE FACTURATION — même règle présent-seulement que ci-dessus.
    if (input.is_billing !== undefined) {
      // Désigner une payeuse RETIRE l'ancienne d'abord. L'index partiel unique
      // tient l'invariant en base ; sans ce retrait il le tiendrait en LEVANT
      // une erreur, et l'utilisateur qui change de payeur recevrait un 500 au
      // lieu de voir son choix appliqué. Rien à déloger dans l'autre sens.
      if (input.is_billing) await this.clearBillingDesignation(workspaceId, row.account_id)
      row.is_billing = input.is_billing
    }
    if (input.legal_name !== undefined) row.legal_name = input.legal_name?.trim() || null
    // ⚠️ `??` et non `||` : `0` est un délai SAISI (comptant). Un `||` le
    // rendrait `null`, donc « conditions de règlement inconnues » — un bloqueur
    // que personne ne pourrait lever, puisque la valeur est déjà saisie.
    if (input.payment_terms_days !== undefined) row.payment_terms_days = input.payment_terms_days ?? null
    if (input.contract_expires_on !== undefined) row.contract_expires_on = input.contract_expires_on ?? null
    if (input.billing_contact_id !== undefined) row.billing_contact_id = input.billing_contact_id ?? null

    return toEntityWire(await this.entities.save(row))
  }

  /**
   * Retire la désignation de payeuse sur TOUTES les entités du compte.
   *
   * Vise `is_billing: true` et non le compte entier : une mise à jour qui
   * toucherait chaque division réécrirait `updated_at` sur des lignes que
   * personne n'a modifiées, et ferait remonter des entités inchangées en tête
   * de tout écran trié par date.
   */
  private async clearBillingDesignation(workspaceId: string, accountId: string): Promise<void> {
    await this.entities.update(
      { workspace_id: workspaceId, account_id: accountId, is_billing: true },
      {
        is_billing: false,
      },
    )
  }

  /**
   * LES DOSSIERS DE FACTURATION DE TOUT L'ESPACE — une lecture, pas vingt-cinq.
   *
   * L'écran du portefeuille affiche vingt-cinq lignes et défile à l'infini :
   * une requête PAR LIGNE ferait vingt-cinq allers-retours pour une colonne, et
   * le double au défilement suivant. Cette route rend donc l'ensemble d'un
   * coup, comme `GET /delivery/expansion` le fait déjà pour les missions.
   *
   * ⚠️ Elle ne rend QUE les entités DÉSIGNÉES. Un compte absent de la réponse
   * n'a pas de payeur — c'est le bloqueur `missing_billing_entity`, et c'est
   * l'écran qui le nomme. Rendre une ligne vide par compte ferait porter à
   * cette route un jugement qui appartient à `assessAccountBillingReadiness`.
   */
  async listBillingProfiles(workspaceId: string): Promise<{ items: AccountBillingProfile[] }> {
    const rows = await this.entities.find({ where: { workspace_id: workspaceId, is_billing: true } })
    const items: AccountBillingProfile[] = rows.map(row => ({
      entityId: row.id,
      accountId: row.account_id,
      legalName: row.legal_name ?? null,
      siren: row.siren ?? null,
      // L'ÉTABLISSEMENT et la preuve d'identité (31/08/2026) — ce que la carte
      // du portefeuille affiche sous le nom, et ce que sa pastille affirme.
      siret: row.siret ?? null,
      identitySource: (row.identity_source ?? null) as AccountBillingProfile['identitySource'],
      identityCheckedOn: toDay(row.identity_checked_on),
      // ⚠️ `??` et non `||` : `0` est un délai SAISI (comptant).
      paymentTermsDays: row.payment_terms_days ?? null,
      contractExpiresOn: toDay(row.contract_expires_on),
      billingContactId: row.billing_contact_id ?? null,
    }))
    return { items }
  }

  async deleteEntity(workspaceId: string, id: string): Promise<{ deleted: true }> {
    const row = await this.entities.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Entité introuvable dans cet espace.')
    // Supprimer le périmètre non déterminé laisserait les contacts sans
    // rattachement possible — l'invariant du §2 est qu'un contact appartient
    // TOUJOURS à une entité.
    if (row.is_default) throw new BadRequestException('Le périmètre non déterminé ne se supprime pas.')
    await this.entities.delete({ id })
    return { deleted: true }
  }

  /**
   * L'entité d'accueil du compte, créée si elle n'existe pas encore.
   *
   * Créée À LA DEMANDE et non pour tous les comptes d'avance : un compte dont
   * chaque contact porte sa division n'a pas besoin d'un fourre-tout vide qui
   * s'afficherait dans tous les sélecteurs.
   */
  async ensureDefaultEntity(workspaceId: string, accountId: string): Promise<AccountEntity> {
    const existing = await this.entities.findOne({
      where: { workspace_id: workspaceId, account_id: accountId, is_default: true },
    })
    if (existing) return toEntityWire(existing)
    const saved = await this.entities.save(
      this.entities.create({
        workspace_id: workspaceId,
        account_id: accountId,
        name: DEFAULT_ENTITY_NAME,
        kind: 'unknown',
        is_default: true,
        rank1_incumbent: 'unknown',
      }),
    )
    return toEntityWire(saved)
  }

  /**
   * Rattache un contact à une entité de SON compte.
   *
   * `entityId = null` ne débranche pas le contact : il le renvoie au périmètre
   * non déterminé, créé au besoin. Le laisser sans entité rouvrirait exactement
   * le trou que le §2 ferme.
   *
   * ⚠️ #1473 — SAUF pour un contact à qualifier, qui n'a pas de compte : il
   * n'existe alors aucun périmètre où le renvoyer, et `entity_id` rend `null`.
   * Le rattacher à une entité NOMMÉE échoue déjà plus haut, par la comparaison
   * de comptes (`null` n'est le compte d'aucune entité) — ce qui est le bon
   * refus : ça le ferait apparaître au comité d'une entreprise choisie au
   * hasard.
   */
  async attachContact(
    workspaceId: string,
    contactId: string,
    entityId: string | null,
  ): Promise<{ entity_id: string | null }> {
    const contact = await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')

    if (entityId) {
      const entity = await this.entities.findOne({ where: { id: entityId, workspace_id: workspaceId } })
      if (!entity) throw new NotFoundException('Entité introuvable dans cet espace.')
      // Rattacher un contact à l'entité d'un AUTRE compte le ferait apparaître
      // dans le comité d'une entreprise où il ne travaille pas.
      if (entity.account_id !== contact.account_id) {
        throw new BadRequestException("Cette entité n'appartient pas au compte du contact.")
      }
      await this.contacts.update(
        { id: contactId },
        { entity_id: entity.id, entity: entity.is_default ? null : entity.name },
      )
      return { entity_id: entity.id }
    }

    // #1473 — une entité est une filiale / BU D'UN COMPTE. Un contact à
    // qualifier n'en a pas, et lui en fabriquer une le rattacherait en douce à
    // une entreprise que personne n'a nommée. On DÉTACHE, ce qui est l'état
    // vrai, et le rattachement redeviendra possible dès qu'un compte sera posé.
    if (!contact.account_id) {
      await this.contacts.update({ id: contactId }, { entity_id: null, entity: null })
      return { entity_id: null }
    }

    const fallback = await this.ensureDefaultEntity(workspaceId, contact.account_id)
    await this.contacts.update({ id: contactId }, { entity_id: fallback.id, entity: null })
    return { entity_id: fallback.id }
  }

  /**
   * À quelle entité rattacher un contact que le pipeline vient d'écrire.
   *
   * Sert au moment de la persistance des contacts d'une analyse : le libellé
   * libre est comparé aux entités CONNUES du compte, et rien n'est créé à
   * partir d'un texte de modèle.
   */
  async resolveForLabel(workspaceId: string, accountId: string, label: string | null): Promise<string | null> {
    const { items } = await this.listEntities(workspaceId, accountId)
    const resolved = resolveEntityIdForContact(items, label)
    if (resolved) return resolved
    // Aucun périmètre non déterminé encore : on le crée plutôt que de laisser
    // le contact sans entité.
    const fallback = await this.ensureDefaultEntity(workspaceId, accountId)
    return fallback.id
  }

  async listSites(workspaceId: string, accountId: string): Promise<{ items: Site[] }> {
    const rows = await this.sites.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      order: { label: 'ASC' },
    })
    return { items: rows.map(toSiteWire) }
  }

  async createSite(workspaceId: string, accountId: string, input: CreateSite): Promise<Site> {
    const label = input.label.trim()
    const clash = await this.sites
      .createQueryBuilder('site')
      .where('site.workspace_id = :workspaceId', { workspaceId })
      .andWhere('site.account_id = :accountId', { accountId })
      .andWhere('lower(site.label) = lower(:label)', { label })
      .getOne()
    if (clash) throw new BadRequestException('Un site de ce nom est déjà retenu sur ce compte.')

    // Une confiance d'effectif sans source est une opinion présentée comme une
    // mesure. Refusé AVANT l'écriture : une ligne déjà posée ne se relit pas.
    const provenance = siteHeadcountProvenanceProblem(input)
    if (provenance) throw new BadRequestException(provenance)

    const saved = await this.sites.save(
      this.sites.create({
        workspace_id: workspaceId,
        account_id: accountId,
        entity_id: input.entity_id ?? null,
        label,
        city: input.city?.trim() || null,
        postal_code: input.postal_code?.trim() || null,
        country: input.country?.trim().toUpperCase() || null,
        siret: input.siret?.trim() || null,
        // Un effectif absent reste `null`. Un 0 se lirait « site vide » et
        // ferait renoncer à y staffer.
        headcount: input.headcount ?? null,
        // Le contexte industriel (addendum Stelya §8). Il était LU par `siteFit`
        // depuis le 24/08 et écrivable par personne : la fonction répondait donc
        // « inconnu » sur tous les sites, ce qui ressemblait exactement à une
        // base pas encore remplie.
        site_type: input.site_type ?? null,
        activity_sector_codes: input.activity_sector_codes ?? [],
        industrial_function_codes: input.industrial_function_codes?.map(code => code.trim()) ?? [],
        headcount_confidence: input.headcount_confidence ?? null,
        headcount_source: input.headcount_source?.trim() || null,
        // Jamais `now()` par défaut : un effectif importé d'un registre date de
        // ce registre, pas du jour de l'import. Absent = on ne sait pas quand.
        headcount_observed_at: input.headcount_observed_at ? new Date(input.headcount_observed_at) : null,
      }),
    )
    return toSiteWire(saved)
  }

  async deleteSite(workspaceId: string, id: string): Promise<{ deleted: true }> {
    const row = await this.sites.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Site introuvable dans cet espace.')
    await this.sites.delete({ id })
    return { deleted: true }
  }

  private async assertNameFree(workspaceId: string, accountId: string, name: string): Promise<void> {
    const clash = await this.entities
      .createQueryBuilder('entity')
      .where('entity.workspace_id = :workspaceId', { workspaceId })
      .andWhere('entity.account_id = :accountId', { accountId })
      .andWhere('lower(entity.name) = lower(:name)', { name })
      .getOne()
    // Deux entités du même nom sur un compte seraient deux vérités du même
    // périmètre, et le rattachement d'un contact un tirage au sort.
    if (clash) throw new BadRequestException('Une entité de ce nom existe déjà sur ce compte.')
  }
}

function toEntityWire(row: AccountEntityRow): AccountEntity {
  return {
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    kind: (row.kind ?? 'unknown') as AccountEntity['kind'],
    siren: row.siren ?? null,
    // L'IDENTITÉ LÉGALE (31/08/2026). Le SIRET est stocké normalisé, donc rendu
    // tel quel ; la date passe par `toDay` parce qu'une colonne `date` remonte
    // en `Date` selon le pilote et qu'un `2026-04-15T00:00:00.000Z` à l'écran
    // ferait croire à une heure de vérification qui n'existe pas.
    siret: row.siret ?? null,
    identity_source: (row.identity_source ?? null) as AccountEntity['identity_source'],
    identity_checked_on: toDay(row.identity_checked_on),
    domain: row.domain ?? null,
    is_default: Boolean(row.is_default),
    rank1_incumbent: (row.rank1_incumbent ?? 'unknown') as AccountEntity['rank1_incumbent'],
    rank1_note: row.rank1_note ?? null,
    is_billing: Boolean(row.is_billing),
    legal_name: row.legal_name ?? null,
    // ⚠️ `??` et non `||` : `0` est un délai de règlement SAISI (comptant), et
    // `||` le transformerait en `null`, c'est-à-dire en « conditions inconnues ».
    payment_terms_days: row.payment_terms_days ?? null,
    contract_expires_on: row.contract_expires_on ? String(row.contract_expires_on).slice(0, 10) : null,
    billing_contact_id: row.billing_contact_id ?? null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  }
}

function toSiteWire(row: SiteEntity): Site {
  return {
    id: row.id,
    account_id: row.account_id,
    entity_id: row.entity_id ?? null,
    label: row.label,
    city: row.city ?? null,
    postal_code: row.postal_code ?? null,
    country: row.country ?? null,
    siret: row.siret ?? null,
    headcount: row.headcount ?? null,
    site_type: (row.site_type ?? null) as Site['site_type'],
    activity_sector_codes: row.activity_sector_codes ?? [],
    industrial_function_codes: row.industrial_function_codes ?? [],
    headcount_confidence: (row.headcount_confidence ?? null) as Site['headcount_confidence'],
    headcount_source: row.headcount_source ?? null,
    // Une DATE d'observation, pas la date d'écriture : « l'effectif était de 320
    // en mars » et « on a écrit 320 aujourd'hui » ne disent pas la même chose.
    headcount_observed_at: row.headcount_observed_at ? toIso(row.headcount_observed_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  }
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * Un JOUR calendaire (`YYYY-MM-DD`), ou `null`.
 *
 * Une colonne `date` remonte en `Date` avec certains pilotes et en `string`
 * avec d'autres. Rendre l'un ou l'autre selon l'environnement ferait afficher
 * « 2026-04-15T00:00:00.000Z » — une heure de vérification que personne n'a
 * relevée, sur un fuseau que personne n'a choisi.
 *
 * ⚠️ `null` reste `null` : une date absente n'est pas l'époque Unix, et c'est
 * exactement la différence entre « jamais vérifié » et « vérifié en 1970 ».
 */
function toDay(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return String(value instanceof Date ? value.toISOString() : value).slice(0, 10)
}
