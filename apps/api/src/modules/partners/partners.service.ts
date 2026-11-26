import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  partnerScore,
  rank1Recommendation,
  type AccountPartner,
  type CreateAccountPartner,
  type MarketEsnObserved,
  type QualifyAccountPartner,
  type Rank1Incumbent,
  type SellingPosture,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { EsnDirectoryService } from '../esn-directory/esn-directory.service'
import { PARTNERS_FEATURE_FLAG, type PartnersFeatureFlag } from './module-tokens'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { ownerDisplayName } from '../delivery/delivery.service'
import { applyDeclaredSubcontracting } from './declared-subcontracting'
import { buildAccessBySiren, type AccessBySiren } from './partner-access-by-siren'
import { type ObservedEsnLine, mergePartnerEvidence, type PartnerEvidence } from './observed-esn'

/** #1624.9 — le drapeau de déploiement progressif de #1624.7. Nommé UNE fois :
 *  un littéral recopié au call-site et dans un test divergerait au premier
 *  renommage côté opérateur Reflag. */
export const MARKET_MEMORY_PARTNERS_FLAG = 'market_memory_partners_enabled'

/** #1818.2 — ce qu'`attachLogos` ajoute à une ligne, UNE FOIS le rapprochement
 *  jugé sans ambiguïté. Les deux voyagent ensemble : `website` n'est que le
 *  repli favicon d'affichage du MÊME compte que `logo_url`, jamais d'un autre.
 *
 *  #2151.42 / #2166.38 — `workspace_account_id` voyage sur le MÊME
 *  rapprochement (un seul compte de l'espace porte ce nom normalisé), mais
 *  répond à une question différente : « cette ESN est-elle déjà un compte que
 *  mon espace connaît ? » — vraie même quand ce compte connu ne porte ni logo
 *  ni site à afficher. */
type LogoMatch = { logo_url: string | null; website: string | null; workspace_account_id: string }

export type PartnerLandscape = {
  partners: (AccountPartner & { score: number } & PartnerEvidence)[]
  /**
   * Les sociétés de services OBSERVÉES autour de ce compte — une TROISIÈME
   * nature de preuve, à côté de ce qu'un humain a déclaré et de ce que
   * l'analyse a détecté (#1579).
   *
   * ⚠️ Une liste vide couvre DEUX situations que cet écran rend de la même
   * façon, et c'est délibéré : « pas assez d'observations sur ce compte » et
   * « la mémoire marché n'a pas pu être lue ». Ailleurs — un compteur, une
   * ligne de désambiguïsation — les deux se rendent différemment, parce qu'un
   * « 0 » sur une panne y mentirait. Ici, dans les deux cas, il n'y a rien à
   * montrer et le bloc n'apparaît pas : afficher « la mémoire est indisponible »
   * sur un onglet d'accès serait un message technique adressé à personne.
   */
  // #1818.2 — le logo voyage AVEC la ligne observée. Sans l'écrire dans le
  // type, la donnée serait produite par le service et invisible au composant —
  // le défaut « un composant juste que personne ne NOURRIT », déjà payé ici.
  observed: (ObservedEsnLine & Partial<LogoMatch>)[]
  /** Une recommandation PAR ENTITÉ : le §2 R5 place le rang 1 sur l'entité, pas
   *  sur le compte. Une seule recommandation pour « EDF » mélangerait une DSI
   *  verrouillée et une filiale ouverte. */
  recommendations: {
    entity_id: string | null
    entity_name: string
    rank1_incumbent: Rank1Incumbent
    play: 'direct' | 'through_partner' | 'displace' | 'find_out' | 'target_other_subsidiary' | 'differentiate'
    partner: string | null
    reason: string
  }[]
}

/**
 * Le paysage des ESN présentes sur un compte (PDF 2 §4.1, décision D11).
 *
 * Le calcul est PUR (`partnerScore`, `rank1Recommendation`) : ce sont les deux
 * dernières des cinq fonctions que le PDF 1 avait nommées sans les écrire,
 * faute de consommateur. Cet onglet est ce consommateur.
 */
@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name)

  constructor(
    @InjectRepository(AccountPartnerEntity)
    private readonly partners: Repository<AccountPartnerEntity>,
    @InjectRepository(AccountEntityRow)
    private readonly entities: Repository<AccountEntityRow>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // #3404.5 — une ENTITÉ (hors GA-07, §3.2), jamais `PartnerPipelineService` :
    // seulement de quoi vérifier qu'un `partner_relation_id` posé désigne une
    // relation du même espace.
    @InjectRepository(PartnerRelationEntity)
    private readonly partnerRelations: Repository<PartnerRelationEntity>,
    private readonly marketMemory: MarketMemoryService,
    private readonly esnDirectory: EsnDirectoryService,
    // #1624.9 — un JETON, pas le service : GA-07 est un cliquet au plafond et
    // la CI l'a dit (255 pour 254). La composition vit dans le module.
    @Inject(PARTNERS_FEATURE_FLAG) private readonly isFeatureOn: PartnersFeatureFlag,
  ) {}

  /**
   * #3181.4 (épopée #3247) — LE LIEN SIREN partenaire↔client, pour un pool de SIREN d'un coup :
   * trois lectures bornées de l'espace (comptes sous ces SIREN, leurs ESN déclarées, relations
   * d'espace), jamais une requête par candidat. Voir `buildAccessBySiren`.
   *
   * #3247 (décision Louis 14/10, ÉLARGISSEMENT) — la lecture des comptes porte AUSSI sur
   * `group_head_siren: In(sirens)` : un candidat jamais ajouté au portefeuille (donc absent de
   * `siren: In(sirens)`) peut être la tête de groupe d'une FILIALE possédée — `group_head_siren`
   * est déjà persisté par l'analyse Phase 1 (Pappers), zéro appel ajouté. Toujours borné à CET
   * espace (GA-43), jamais une écriture CRM.
   */
  async accessBySiren(workspaceId: string, sirens: readonly string[]): Promise<Record<string, AccessBySiren>> {
    const [accounts, relations] = await Promise.all([
      this.accounts.find({
        where: [
          { workspace_id: workspaceId, siren: In([...sirens]) },
          { workspace_id: workspaceId, group_head_siren: In([...sirens]) },
        ],
        select: { id: true, siren: true, group_head_siren: true },
      }),
      this.partnerRelations.find({
        where: { workspaceId },
        select: { id: true, siren: true, name: true, stage: true },
      }),
    ])
    const partnerRows =
      accounts.length === 0
        ? []
        : await this.partners.find({
            where: {
              workspace_id: workspaceId,
              account_id: In(accounts.map(account => account.id)),
              dismissed_at: IsNull(),
            },
          })
    return buildAccessBySiren({ sirens, accounts, partnerRows, relations })
  }

  async landscape(workspaceId: string, accountId: string, userId?: string): Promise<PartnerLandscape> {
    const [rows, entities, sellingPosture] = await Promise.all([
      // `dismissed_at IS NULL` : une ESN qu'un utilisateur a corrigée d'un
      // « Ce n'est pas exact » ne remonte plus. Sans ce filtre, la correction
      // se lirait comme sans effet, et il la referait à chaque visite.
      this.partners.find({
        where: { workspace_id: workspaceId, account_id: accountId, dismissed_at: IsNull() },
        order: { name: 'ASC' },
      }),
      this.entities.find({ where: { workspace_id: workspaceId, account_id: accountId }, order: { name: 'ASC' } }),
      // #3205.6 (épopée #3239) — le positionnement DÉCLARÉ de l'ESN
      // utilisatrice, pour choisir entre « déplacer » et « se différencier »
      // (`rank1Recommendation`). `undefined` sans profil généré : le
      // comportement historique (`displace`) ne change pas.
      userId ? this.sellingPostureOf(userId) : Promise.resolve(undefined),
    ])

    // #2298.7 — le déclarant de CHAQUE ligne, résolu en une seule requête
    // groupée (même geste que `logoIndex` ci-dessous et `ownersOf` de
    // `delivery.service.ts`) : vingt-cinq lignes qui résolvaient chacune leur
    // profil referaient vingt-cinq fois la même lecture.
    const declaredByNames = await this.declaredByNamesOf(rows.map(row => row.declared_by))
    const partners = rows.map(row => {
      const wire = toWire(row, declaredByNames.get(row.declared_by ?? '') ?? null)
      return { ...wire, score: partnerScore(wire) }
    })
    // Trié par score : la première ligne est celle qui commande la stratégie.
    partners.sort((left, right) => right.score - left.score)

    // #3205.6 (épopée #3239) — « viser une autre filiale » se calcule en DEUX
    // PASSES : la première établit, pour chaque entité, si son périmètre est
    // OUVERT (`direct`/`through_partner`) sans encore connaître les entités
    // sœurs — la seconde relit cette première passe pour nommer, sur une
    // entité verrouillée, une AUTRE entité du MÊME compte déjà ouverte.
    // Jamais une filiale devinée hors de ce que le compte a déjà structuré
    // (`AccountEntityRow`).
    const firstPass = entities.map(entity => {
      const scoped = partners.filter(partner => partner.entity_id === entity.id || partner.entity_id === null)
      const rank1Incumbent = (entity.rank1_incumbent ?? 'unknown') as Rank1Incumbent
      const verdict = rank1Recommendation({ rank1Incumbent, partners: scoped })
      return { entity, scoped, rank1Incumbent, verdict }
    })
    const openEntityName = firstPass.find(
      ({ verdict }) => verdict.play === 'direct' || verdict.play === 'through_partner',
    )?.entity.name

    const recommendations = firstPass.map(({ entity, scoped, rank1Incumbent, verdict }) => {
      // Une AUTRE entité ouverte ne se nomme jamais elle-même, et ne joue que
      // sur un périmètre verrouillé (`displace` en première passe) : une
      // entité déjà ouverte, ou dont on ignore l'état, garde son verdict.
      const otherOpenEntity = verdict.play === 'displace' && openEntityName !== entity.name ? openEntityName : undefined
      const finalVerdict =
        otherOpenEntity || sellingPosture
          ? rank1Recommendation({ rank1Incumbent, partners: scoped, otherOpenEntity, sellingPosture })
          : verdict
      return {
        entity_id: entity.id,
        entity_name: entity.name,
        rank1_incumbent: rank1Incumbent,
        play: finalVerdict.play,
        partner: finalVerdict.partner ?? null,
        reason: finalVerdict.reason,
      }
    })

    // #1605 — UNE ligne par ESN, toutes ses preuves conservées. La liste des
    // partenaires porte désormais ses origines de preuve, et le bloc « observées »
    // ne garde que ce que l'espace ne connaît PAS encore. Voir
    // `mergePartnerEvidence` pour ce que ça change par rapport à #1579.
    const observedRaw = await this.observedEsn(workspaceId, accountId)
    const merged = mergePartnerEvidence(partners, observedRaw)

    // #1624.7 / #1624.9 — le rang DÉCLARÉ du référentiel ESN, derrière un
    // drapeau de déploiement PROGRESSIF (par espace, jamais global) : une
    // capacité neuve qui rapproche par nom mérite d'être vérifiée sur quelques
    // espaces avant d'atteindre tout le monde. Éteint par défaut — aucun appel
    // au référentiel n'est fait tant que personne ne l'a armé pour cet espace.
    const declaredSubcontractingOn = this.isFeatureOn(MARKET_MEMORY_PARTNERS_FLAG, workspaceId)
    const withDeclaredSubcontracting = declaredSubcontractingOn
      ? applyDeclaredSubcontracting(
          merged.partners,
          await this.esnDirectory.factsByName(merged.partners.map(p => EsnDirectoryService.normalize(p.name))),
          EsnDirectoryService.normalize,
        )
      : merged.partners

    // #1818.2 — le logo, quand un compte déjà analysé de l'espace porte SANS
    // AMBIGUÏTÉ ce nom. Voir `attachLogos` pour la règle et sa raison.
    // #1818.2 — UNE seule lecture de comptes pour les DEUX listes de l'écran.
    // Les appeler séparément ferait deux requêtes identiques par rendu.
    // Rien à orner ⇒ aucune requête. La Map vide traverse `attachLogosWith`
    // sans rien changer, ce qui évite un ternaire dont les deux branches
    // n'auraient pas le même type.
    const index =
      withDeclaredSubcontracting.length > 0 || merged.unmatched.length > 0
        ? await this.logoIndex(workspaceId)
        : new Map<string, LogoMatch[]>()
    const withLogos = this.attachLogosWith(withDeclaredSubcontracting, partner => partner.name, index)
    // #1818.2 — les sociétés OBSERVÉES portent un logo elles aussi. Elles en
    // étaient privées parce qu'elles nomment leur société `esnName` et non
    // `name` : la moitié de l'écran gardait ses pastilles à initiale sans que
    // rien ne le dise.
    const observed = this.attachLogosWith(merged.unmatched, line => line.esnName, index)

    return { partners: withLogos, recommendations, observed }
  }

  /**
   * #1818.2 — LE LOGO D'UN PARTENAIRE, QUAND LE RAPPROCHEMENT PAR NOM EST
   * SANS AMBIGUÏTÉ.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE RAPPROCHEMENT, ET PAS UN AUTRE
   * ─────────────────────────────────────────────────────────────────────────
   * `AccountPartner` ne porte ni domaine ni site (`account-partner.entity.ts`),
   * et `esn_directory.domain` est une colonne documentée comme jamais écrite
   * (`unwritten-columns.ts` : « 93 % des domaines dérivés du nom étaient
   * faux, jamais repris »). Deviner un domaine depuis un nom a déjà été
   * essayé, puis retiré — ce n'est donc pas repris ici. La seule piste
   * câblable : quand l'ESN partenaire a ELLE-MÊME été analysée comme compte
   * de ce même espace, elle porte un vrai `logo_url`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LA RÈGLE D'AMBIGUÏTÉ — EXACTEMENT CELLE DES HOMONYMES THALES (#1756.3)
   * ─────────────────────────────────────────────────────────────────────────
   * Le lot 14 a mesuré en production trois « THALES » de SIREN distincts qui
   * recopiaient tous les 272 parcours du groupe aérospatial sur deux
   * homonymes sans rapport, parce que le rapprochement se faisait sur le nom
   * normalisé seul. La doctrine interdit une jointure automatique sur nom
   * seul et dit qu'un rapprochement inféré ne fusionne jamais deux entités
   * distinctes : « on PROPOSE une fusion de doublons, on ne fusionne
   * JAMAIS ».
   *
   * Appliquée ici : le rapprochement ne vaut QUE quand exactement UN compte
   * analysé de l'espace porte ce nom normalisé.
   *  - deux comptes ou plus → aucun des deux ne l'emporte (impossible de
   *    savoir lequel, si un seul, est le bon) : `logo_url` reste absent ;
   *  - aucun compte → `logo_url` reste absent ;
   *  - un compte, mais sans `logo_url` ni `website` → rien à afficher, la
   *    ligne ressort inchangée.
   * Dans les trois cas, la pastille à initiale reste — jamais un logo
   * deviné, jamais une image construite depuis un nom.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * COÛT — POURQUOI UNE LECTURE PAR ESPACE, PAS PAR PARTENAIRE
   * ─────────────────────────────────────────────────────────────────────────
   * Une lecture unique de tous les comptes de l'espace (colonnes projetées :
   * nom, logo, site), plutôt qu'une requête par ligne de `landscape.partners`
   * — cet onglet en affiche rarement plus d'une poignée, et le coût d'une
   * lecture complète de l'espace est le même que celui déjà payé par
   * `landscape()` pour les entités du compte, juste au-dessus.
   */
  private async logoIndex(workspaceId: string): Promise<Map<string, LogoMatch[]>> {
    const accountRows = await this.accounts.find({
      where: { workspace_id: workspaceId },
      select: { id: true, company_name: true, logo_url: true, website: true },
    })

    const byNormalizedName = new Map<string, LogoMatch[]>()
    for (const row of accountRows) {
      const key = EsnDirectoryService.normalize(row.company_name)
      if (!key) continue
      const bucket = byNormalizedName.get(key) ?? []
      bucket.push({ logo_url: row.logo_url, website: row.website, workspace_account_id: row.id })
      byNormalizedName.set(key, bucket)
    }
    return byNormalizedName
  }

  /**
   * ⚠️ #1818.2 — l'extracteur de nom est un PARAMÈTRE, et c'est ce qui a
   * manqué à la première version.
   *
   * Les deux listes de cet écran ne nomment pas leur société de la même façon :
   * une ligne déclarée porte `name`, une ligne OBSERVÉE porte `esnName`. La
   * contrainte `T extends { name: string }` excluait donc silencieusement la
   * moitié de l'écran — « une famille câblée à moitié », où chaque composant a
   * son test et où chacun passe.
   */
  private attachLogosWith<T>(
    rows: T[],
    nameOf: (row: T) => string,
    index: Map<string, LogoMatch[]>,
  ): (T & Partial<LogoMatch>)[] {
    return rows.map(row => {
      const matches = index.get(EsnDirectoryService.normalize(nameOf(row))) ?? []
      // Ambiguïté (0 ou 2+ comptes du même nom) : ni logo ni relation
      // workspace, la ligne ressort inchangée — même contrat que #1756.3
      // (`companies.controller.ts`).
      if (matches.length !== 1) return row as T & Partial<LogoMatch>
      const [match] = matches as [LogoMatch]
      // #2151.42 / #2166.38 — la relation workspace voyage DÈS que le
      // rapprochement est sans ambiguïté : un compte connu sans logo reste un
      // compte connu.
      const withWorkspaceRelation = { ...row, workspace_account_id: match.workspace_account_id }
      if (!match.logo_url && !match.website) return withWorkspaceRelation as T & Partial<LogoMatch>
      return { ...withWorkspaceRelation, logo_url: match.logo_url, website: match.website }
    })
  }

  /**
   * Les sociétés de services observées autour de ce compte (#1579).
   *
   * Best-effort STRICT : toute impasse rend une liste vide et l'onglet
   * fonctionne exactement comme avant — compte introuvable, entreprise non
   * résolue, couverture sous le seuil, mémoire en erreur. Un onglet d'accès qui
   * tomberait parce qu'un référentiel de marché est indisponible serait une
   * dépendance qu'on n'a pas voulue.
   */
  private async observedEsn(workspaceId: string, accountId: string): Promise<MarketEsnObserved[]> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      // #1617 — `registry_country` départage deux homonymes du corpus. La
      // colonne existait déjà sur le compte ; cette projection ne la lisait pas.
      select: { id: true, company_name: true, website: true, registry_country: true },
    })
    if (!account?.company_name) return []

    const read = await this.marketMemory.coverageFor({
      ref: accountId,
      name: account.company_name,
      website: account.website ?? null,
      country: account.registry_country ?? null,
    })
    if (read.status !== 'ok' || !read.coverage.covered) return []

    // #1605 — rendu BRUT : la confrontation à ce que l'espace connaît déjà se
    // fait dans `mergePartnerEvidence`, à un seul endroit, avec la même clé.
    return [...read.coverage.esnObserved]
  }

  /**
   * #2298.7 — `userId` est QUI déclare cette relation : renseigné à
   * l'ÉCRITURE, jamais reconstitué après coup (voir le docblock de
   * `AccountPartnerEntity.declared_by`). `created_at` (`@CreateDateColumn`,
   * inchangé) porte déjà QUAND.
   */
  /**
   * #2298.7 — QUI a déclaré chaque ligne, résolu en NOM — même geste que
   * `ownersOf` (`delivery.service.ts:2195.13`) : une lecture groupée de
   * `profiles`, jamais une par ligne.
   *
   * ⚠️ AVEC try/catch, comme `ownersOf` : le nom du déclarant est une
   * DÉCORATION, pas l'identité de la ligne — une table `profiles` illisible ne
   * doit pas faire tomber tout l'onglet, elle doit juste laisser la mention
   * absente (le NOM manque, la ligne et sa date restent).
   */
  private async declaredByNamesOf(userIds: readonly (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      const rows = await this.partners.manager.query<
        { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[]
      >(`SELECT user_id, first_name, last_name, email FROM profiles WHERE user_id = ANY($1::uuid[])`, [ids])
      return new Map(
        (rows ?? []).flatMap(row => {
          const name = ownerDisplayName(row.first_name, row.last_name, row.email)
          return name ? ([[row.user_id, name]] as const) : []
        }),
      )
    } catch (error) {
      this.logger.error('Déclarants de relation illisibles', { error })
      return new Map()
    }
  }

  /**
   * #3205.6 (épopée #3239) — le positionnement DÉCLARÉ de l'ESN utilisatrice
   * (`profile_context.sellingPosture`), pour `rank1Recommendation`. MÊME
   * geste fail-soft que `declaredByNamesOf` ci-dessus : une lecture directe de
   * `profiles`, jamais le service de génération (celui-là dépend de
   * l'IA/gateways/analytics — l'injecter ici alourdirait ce module pour une
   * simple lecture). `undefined` sans profil généré ou en cas d'erreur : le
   * comportement historique (`displace`) ne change pas.
   */
  private async sellingPostureOf(userId: string): Promise<SellingPosture | undefined> {
    try {
      const rows = await this.partners.manager.query<{ selling_posture: string | null }[]>(
        `SELECT profile_context->>'sellingPosture' AS selling_posture FROM profiles WHERE user_id = $1`,
        [userId],
      )
      return (rows?.[0]?.selling_posture as SellingPosture | null | undefined) ?? undefined
    } catch (error) {
      this.logger.error('Positionnement ESN illisible', { error })
      return undefined
    }
  }

  async create(
    workspaceId: string,
    accountId: string,
    input: CreateAccountPartner,
    userId: string,
  ): Promise<AccountPartner> {
    const name = input.name.trim()
    const clash = await this.partners
      .createQueryBuilder('partner')
      .where('partner.account_id = :accountId', { accountId })
      .andWhere('lower(partner.name) = lower(:name)', { name })
      .getOne()
    // Deux lignes pour la même ESN donneraient deux rangs contradictoires, et
    // la recommandation dépendrait de l'ordre de lecture.
    if (clash) throw new BadRequestException('Cette ESN est déjà déclarée sur ce compte.')

    const saved = await this.partners.save(
      this.partners.create({
        workspace_id: workspaceId,
        account_id: accountId,
        entity_id: input.entity_id ?? null,
        name,
        rank: input.rank ?? 'unknown',
        relationship: input.relationship ?? 'unknown',
        note: input.note?.trim() || null,
        // Saisi à la main : `declared`. Le pipeline, lui, écrit `analysis`, et
        // l'écran fait la différence — un concurrent repéré par une analyse et
        // jamais confirmé n'a pas la même autorité qu'un partenaire déclaré.
        source: 'declared',
        placements: input.placements ?? 0,
        // #2298.7 — QUI. `landscape()` le résout en nom ; cette ligne ne
        // porte jamais que l'id.
        declared_by: userId,
      }),
    )
    return toWire(saved)
  }

  /**
   * #2122.46 — QUALIFIER une relation que l'espace connaît DÉJÀ : dire ce que
   * cette ESN est POUR NOUS sur ce compte (son rang, et de quel côté elle est).
   *
   * `create` ne pouvait pas le faire — il refuse un nom déjà présent par un 400
   * (deux lignes pour la même ESN donneraient deux rangs contradictoires). Une
   * ligne posée par le pipeline, `rank: 'unknown'` et `relationship: 'unknown'`,
   * n'avait donc AUCUN geste positif. C'est pourtant exactement celle qu'il y a
   * à qualifier, et `partnerScore` lit ces deux champs : la qualifier change ce
   * que l'écran met en tête.
   *
   * ⚠️ `source` reste ce qu'il était, et c'est délibéré (voir le docblock de
   * `partners-qualify.spec.ts`) : le basculer en `declared` fermerait « Ce n'est
   * pas exact » et couperait le rafraîchissement du pipeline. La correction
   * humaine n'en a pas besoin pour tenir — l'upsert de `seedDetectedPartners`
   * ne réécrit NI `rank` NI `relationship`.
   */
  async qualify(workspaceId: string, id: string, input: QualifyAccountPartner): Promise<AccountPartner> {
    const row = await this.partners.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Partenaire introuvable dans cet espace.')
    // Une ligne écartée porte une pierre tombale : la requalifier la ferait
    // revenir par la fenêtre, alors que quelqu'un a dit qu'elle était fausse.
    if (row.dismissed_at) {
      throw new BadRequestException('Cette ESN a été écartée : rétablis-la avant de la qualifier.')
    }
    if (input.rank !== undefined) row.rank = input.rank
    if (input.relationship !== undefined) row.relationship = input.relationship
    // #2316.34 — LE FAIT TERRAIN. `undefined` laisse la note intacte, `null`
    // ou une chaîne blanche l'efface — même geste que `create` ci-dessus.
    if (input.note !== undefined) row.note = input.note?.trim() || null
    // #2316.22-.27 — LES CINQ CRITÈRES DE QUALIFICATION RANG 2. `undefined`
    // laisse le critère intact, `null` le repasse à « non mesuré », un
    // booléen le tranche — même geste que les trois champs ci-dessus.
    if (input.rank2_scope_accessible !== undefined) row.rank2_scope_accessible = input.rank2_scope_accessible
    if (input.rank2_brief_precise !== undefined) row.rank2_brief_precise = input.rank2_brief_precise
    if (input.rank2_contact_accountable !== undefined) row.rank2_contact_accountable = input.rank2_contact_accountable
    if (input.rank2_economics_clear !== undefined) row.rank2_economics_clear = input.rank2_economics_clear
    if (input.rank2_next_steps_ready !== undefined) row.rank2_next_steps_ready = input.rank2_next_steps_ready
    // #3205.4 (épopée #3239) — même geste : `undefined` laisse intact, `null`
    // ou une chaîne blanche efface, une valeur la pose.
    if (input.competitive_risk !== undefined) row.competitive_risk = input.competitive_risk?.trim() || null
    if (input.complementarity !== undefined) row.complementarity = input.complementarity?.trim() || null
    if (input.next_verification_at !== undefined) {
      row.next_verification_at = input.next_verification_at ? new Date(input.next_verification_at) : null
    }
    // #3404.5 — LE LIEN VERS LA RELATION GOUVERNÉE. `undefined` laisse le lien
    // intact, `null` le rompt ; un id doit désigner une relation du MÊME
    // espace, jamais une relation d'un autre workspace devinée par son id.
    if (input.partner_relation_id !== undefined) {
      if (input.partner_relation_id !== null) {
        const relation = await this.partnerRelations.findOne({
          where: { id: input.partner_relation_id, workspaceId },
        })
        if (!relation) {
          throw new BadRequestException('Cette relation partenaire n’existe pas dans cet espace.')
        }
      }
      row.partner_relation_id = input.partner_relation_id
    }
    return toWire(await this.partners.save(row))
  }

  async remove(workspaceId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.partners.delete({ id, workspace_id: workspaceId })
    if (!result.affected) throw new NotFoundException('Partenaire introuvable dans cet espace.')
    return { deleted: true }
  }

  /**
   * « Ce n'est pas exact » — l'utilisateur corrige une ESN détectée par l'analyse.
   *
   * On ne SUPPRIME pas : le run suivant recréerait la ligne, et la correction
   * serait défaite chaque semaine sans que personne comprenne pourquoi. On pose
   * une pierre tombale que l'écriture du pipeline sait respecter.
   *
   * Une ligne DÉCLARÉE ne s'écarte pas par ce chemin : elle se supprime, parce
   * que son auteur est celui qui la retire. Les deux gestes ne disent pas la
   * même chose, et les confondre ferait disparaître des lignes que personne
   * n'aurait voulu perdre.
   */
  async dismiss(workspaceId: string, id: string, reason: string): Promise<AccountPartner> {
    const trimmed = reason.trim()
    if (!trimmed) throw new BadRequestException('Dis pourquoi : un écartement sans motif est invérifiable.')
    const row = await this.partners.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Partenaire introuvable dans cet espace.')
    if (row.source !== 'analysis') {
      throw new BadRequestException('Cette ESN a été déclarée à la main : supprime-la plutôt que de l’écarter.')
    }
    row.dismissed_at = new Date()
    row.dismissed_reason = trimmed
    return toWire(await this.partners.save(row))
  }
}

function toWire(row: AccountPartnerEntity, declaredByName: string | null = null): AccountPartner {
  return {
    id: row.id,
    account_id: row.account_id,
    entity_id: row.entity_id ?? null,
    name: row.name,
    rank: row.rank as AccountPartner['rank'],
    relationship: row.relationship as AccountPartner['relationship'],
    note: row.note ?? null,
    source: row.source as AccountPartner['source'],
    placements: row.placements ?? 0,
    // `null` et non « faible » : une ligne saisie à la main n'a été évaluée par
    // personne, et lui prêter un doute serait un jugement que nul n'a porté.
    certainty: (row.certainty as AccountPartner['certainty']) ?? null,
    scope: row.scope ?? null,
    detected_at: row.detected_at instanceof Date ? row.detected_at.toISOString() : (row.detected_at ?? null),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    // #2298.7 — QUI a déclaré, résolu en nom par `declaredByNamesOf`. `null`
    // sur une ligne du pipeline, ou déclarée avant que `declared_by` existe.
    declared_by_name: declaredByName,
    // #2316.22-.27 — `null` = non mesuré, jamais deviné.
    rank2_scope_accessible: row.rank2_scope_accessible ?? null,
    rank2_brief_precise: row.rank2_brief_precise ?? null,
    rank2_contact_accountable: row.rank2_contact_accountable ?? null,
    rank2_economics_clear: row.rank2_economics_clear ?? null,
    rank2_next_steps_ready: row.rank2_next_steps_ready ?? null,
    // #3205.4 (épopée #3239) — `null` = non évalué/non renseigné, jamais deviné.
    competitive_risk: row.competitive_risk ?? null,
    complementarity: row.complementarity ?? null,
    next_verification_at:
      row.next_verification_at instanceof Date
        ? row.next_verification_at.toISOString()
        : (row.next_verification_at ?? null),
    // #3404.5 — le lien vers `partner_relations`, `null` = non rapprochée.
    partner_relation_id: row.partner_relation_id ?? null,
  }
}
