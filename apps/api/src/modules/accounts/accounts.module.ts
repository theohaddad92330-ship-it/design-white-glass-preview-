import { forwardRef, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import { PublicRegistryAnnouncementEntity, SireneSnapshotEntity } from '../../database/entities/public-registry.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { NeedPlayEntity } from '../../database/entities/need-play.entity'
// #2556 — les trois tables que la déduction « compte connu » et ses
// mouvements lisent (`AccountKnownService`) : missions (tout statut),
// activités (échange/note), interventions (`renewal_at_risk`, scopées via
// les missions du compte). Entités, pas services — hors du périmètre GA-07.
import { ActivityEntity } from '../../database/entities/activity.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { AnalysisModule } from '../analysis/analysis.module'
import { ContactsModule } from '../contacts/contacts.module'
import { CreditsModule } from '../credits/credits.module'
import { IaModule } from '../ia/ia.module'
import { AccountGroupPerimeterController } from './account-group-perimeter.controller'
import { PilotageModule } from '../pilotage/pilotage.module'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { DeliveryModule } from '../delivery/delivery.module'
import { AccountIntelligenceModule } from '../account-intelligence/account-intelligence.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { CommonAccountsModule } from '../common-accounts/common-accounts.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { SignalHistoryModule } from '../signal-history/signal-history.module'
import { ActionsModule } from '../actions/actions.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { DiscoverNotesModule } from '../discover-notes/discover-notes.module'
import { AccountKnownService } from './account-known.service'
import { AccountChangesService } from './account-changes.service'
import { AccountSignalLinesService } from './account-signal-lines.service'
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { AccountStrategy5PService } from './account-strategy-5p.service'
import { AccountInterestPenetrabilityService } from './account-interest-penetrability.service'
import { AccountVariationSignalsService } from './account-variation-signals.service'
import { EntityResolutionCorrectionsController } from './entity-resolution-corrections.controller'
import { EntityResolutionCorrectionsService } from './entity-resolution-corrections.service'
import { EntityResolutionCorrectionEntity } from '../../database/entities/entity-resolution-correction.entity'
import { AccountShareService } from './account-share.service'
import { AccountsController } from './accounts.controller'
import { AccountTimelineService } from './account-timeline.service'
import { FirstEuroService } from './first-euro.service'
import { AccountDeclaredPartnerService } from './account-declared-partner.service'
import { AccountsService } from './accounts.service'
import { NeedPlayService } from './need-play.service'
import { SharePublicController } from './share-public.controller'
import { SharePublicService } from './share-public.service'
import { AccessFactEntity } from '../../database/entities/access-fact.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
// #2150.14/.18 — le favori de compte, rétabli (revirement assumé de #1800).
import { UserFavoriteEntity } from '../favorites/user-favorite.entity'
import { AccountFavoritesController } from './account-favorites.controller'
import { OutsidePersonRevealController } from './outside-person-reveal.controller'
// #2127.37 — « Masquer cette suggestion », persistant et par personne.
import { SimilarAccountDismissalEntity } from '../../database/entities/similar-account-dismissal.entity'
import { AccountCrmFusionController } from './account-crm-fusion.controller'
import { AccountCrmFusionService } from './account-crm-fusion.service'
import { WorkspaceProgressController } from './workspace-progress.controller'
import { WorkspaceProgressService } from './workspace-progress.service'

@Module({
  imports: [
    ConfigModule,
    AccountFactsModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      // #3920.9 — les relevés d'effectif Sirene, lus par les signaux de variation.
      SireneSnapshotEntity,
      // #3915.30 — les marchés attribués relus (DECP), comptés comme la liste de la fiche.
      PublicRegistryAnnouncementEntity,
      AccountShareEntity,
      // #2284.67-.69 — la correction d'identité versionnée par l'espace.
      EntityResolutionCorrectionEntity,
      // Les ESN détectées par l'analyse atterrissent ici (tome 1 §14). Le
      // module partners reste propriétaire de la LECTURE et des gestes humains ;
      // l'analyse, elle, est le producteur, et écrit ce qu'elle produit.
      AccountPartnerEntity,
      // Les faits d'accès déduits de la commande publique. L'injection est
      // `@Optional()` : sans cette ligne, Nest passe `undefined` et
      // `seedAccessFacts` ne fait RIEN, en silence — aucun crash, aucun log,
      // et un verrouillage qui ne se calcule jamais.
      AccessFactEntity,
      ContactEntity,
      NeedPlayEntity,
      // Timeline unifiée (addendum p59-60) : elle FUSIONNE trois tables déjà
      // écrites ailleurs, elle n'en crée aucune.
      UserActionEntity,
      ProjectEntity,
      WorkflowRunEntity,
      // La provenance des champs de fiche, pour que `applyResearch` cesse
      // d'écraser une correction humaine. Sans cette ligne, l'injection
      // `@Optional()` reste `undefined` et le correctif ne s'appliquerait
      // NULLE PART en production (GA-20).
      FieldProvenanceEntity,
      // #3671 — retours « faux » relus à l'actualisation (garde de fait corrigé).
      AccountFeedbackEntity,
      // #2150.14/.18 — le favori de compte : `AccountsService.setAccountFavorite`
      // et le filtre `favorite: 'mine'` ont besoin du repository.
      UserFavoriteEntity,
      // #2127.37 — masquer/démasquer une suggestion « compte similaire ».
      SimilarAccountDismissalEntity,
      // #2556 — voir le commentaire d'import plus haut.
      ActivityEntity,
      InterventionEntity,
      MissionEntity,
    ]),
    forwardRef(() => AnalysisModule),
    ContactsModule,
    // Phase 2: WorkspaceContextService resolves the caller's active workspace so
    // the accounts controller can scope its reads by `workspace_id`.
    WorkspaceModule,
    // Scoring hybride « comptes similaires » : lecture seule du profil vendeur
    // (module léger, sans Auth/Mailer — voir EsnProfileReaderModule).
    EsnProfileReaderModule,
    // #1577 — le contrôleur pose le nombre de parcours observés sur les lignes
    // de la page. Le module exporte un service en LECTURE SEULE ; c'est la
    // seule porte vers la mémoire marché, et l'arbitrage des homonymes (#1617)
    // vit derrière elle.
    MarketMemoryModule,
    // Lot 793 — le référentiel pivot (BM-A ↔ DF ↔ groupe) : le CONTRÔLEUR en fait une porte liée à l'espace.
    CommonAccountsModule,
    // Le cloisonnement de périmètre (BU / agence). C'est le CONTRÔLEUR qui
    // compose les deux domaines — GA-07 interdit un import service → service,
    // pas la composition au bord.
    BusinessUnitModule,
    // #1618 — la facade croisee. Sans cet import, le module etait juste, teste,
    // et importe par son SEUL test : du code que personne n'appelle.
    AccountIntelligenceModule,
    // #1576 — les missions SIGNÉES de l'espace, pour la raison « compte jumeau »
    // des suggestions. Le module exporte `AccountMissionsService` ; `delivery`
    // n'importe pas `accounts`, il n'y a donc pas de cycle.
    DeliveryModule,
    // Historique de signal (V2 §11) : « détecté le … » sur le flux de veille.
    SignalHistoryModule,
    // #2123.46 — alias déprécié `POST :id/plan/actions` : il écrit par la porte
    // canonique des actions du plan. `actions` n'importe pas `accounts`, pas de
    // cycle (et `SignalHistoryModule` l'importe déjà).
    ActionsModule,
    // Plan d'attaque d'un besoin (D9) : le seul appel modèle de l'écran Besoins,
    // et le seul débit de crédit.
    IaModule,
    CreditsModule,
    // LA PHOTO MENSUELLE (31/08/2026), pour que le bandeau du portefeuille
    // puisse dire « +5 ce mois » au lieu de l'inventer. Le module de pilotage
    // reste PROPRIÉTAIRE de ce qui est photographié ; il n'exporte que la
    // lecture. L'orchestration vit dans le CONTRÔLEUR, pas dans le service —
    // c'est la sortie que GA-07 nomme lui-même, et il est à son plafond.
    PilotageModule,
    // #2151.59 — la reprise des notes de terrain écrites sur le candidat
    // Découvrir (même SIREN) : `AccountsService.create` retague ces lignes
    // sur le compte créé, jamais une copie.
    DiscoverNotesModule,
  ],
  controllers: [
    AccountsController,
    SharePublicController,
    AccountFavoritesController,
    // #2284.65 / .67-.69 — « c'est bien celle-ci » / « ce n'est pas celle-ci ».
    EntityResolutionCorrectionsController,
    // #4421.16 — « Obtenir l'e-mail » d'une personne proposée par Laura hors de l'espace.
    OutsidePersonRevealController,
    // #4603 — le rattrapage ciblé des paires compte-CRM ↔ compte-analyse (renversement daté, Louis 26/10).
    AccountCrmFusionController,
    // #5011.1 — l'avancement compté de l'espace, pour la suite d'une réponse de Laura.
    WorkspaceProgressController,
    // Lot 757 — le sélecteur groupe + filiales de l'analyse (arbitrage Louis 31/10).
    AccountGroupPerimeterController,
  ],
  providers: [
    AccountTimelineService,
    AccountsService,
    AccountCrmFusionService,
    WorkspaceProgressService,
    AccountDeclaredPartnerService,
    AccountShareService,
    SharePublicService,
    NeedPlayService,
    // La distance au premier euro (PDF 2 §7.4). Elle ne lit que la base — huit
    // `EXISTS` et l'historique de l'espace — donc aucun service d'un autre
    // module, et GA-07 reste où il est.
    FirstEuroService,
    // #2556 — la déduction « compte connu » et ses mouvements. Elle aussi ne
    // lit que la base (missions/activités/interventions), donc aucun import
    // service → service de plus.
    AccountKnownService,
    // #4180 — ce qui a changé depuis la dernière vérification : le lecteur unique des faits (jeton) + SQL.
    AccountChangesService,
    AccountSignalLinesService,
    EntityResolutionCorrectionsService,
    // BEL-SC-225 (#3254, P0) — la MAISON CANONIQUE de la projection 5P.
    // AccountEntity et ContactEntity sont déjà dans ce module ; aucun nouvel
    // import de module n'est nécessaire.
    AccountStrategy5PService,
    // BEL-SC-229 (#3258, P0) — la MAISON CANONIQUE de la matrice intérêt ×
    // pénétrabilité. AccountPartnerEntity est déjà dans ce module (détection
    // de partenaires) ; elle compose `AccountStrategy5PService` ci-dessus
    // plutôt que de relire les contacts en parallèle.
    AccountInterestPenetrabilityService,
    // #3920.10 (Louis 15/10) — les quatre signaux de variation d'un compte, lecture seule.
    AccountVariationSignalsService,
  ],
  // #2271.19 — `AccountTimelineService` rejoint les exports : le pont copilote
  // (`CopilotBridgeController`) le lit pour rendre l'historique d'un compte DANS
  // la conversation, la MÊME lecture que l'écran de fiche — pas une seconde.
  //
  // BEL-SC-225 (#3254) — `AccountStrategy5PService` aussi exporté : la doctrine
  // du ticket (« aucune copie locale dans Laura ou Découvrir ») exige que
  // d'autres modules puissent l'importer plutôt que de relire raw_analysis
  // eux-mêmes. BEL-SC-229 (#3258) suit la même discipline pour la matrice.
  exports: [
    AccountsService,
    AccountShareService,
    AccountTimelineService,
    AccountStrategy5PService,
    AccountInterestPenetrabilityService,
    // #5203 — Découvrir lit les lignes PASSÉES de l'espace (`DiscoverSourcesService`) : un lecteur, un export (GA-26).
    AccountSignalLinesService,
  ],
})
export class AccountsModule {}
