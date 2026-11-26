import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AgendaBellumCreatedEventEntity } from '../../database/entities/agenda-bellum-created-event.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { FocusPlanBlockOutcomeEntity } from '../../database/entities/focus-plan-block-outcome.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserDailyBriefEntity } from '../../database/entities/user-daily-brief.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { AgendaModule } from '../agenda/agenda.module'
import { ChainsModule } from '../chains/chains.module'
// #2107.42 — la voie d'accès du contact le mieux classé du compte
// (`ContactsService.rankForAccount`), servie au CONTRÔLEUR (GA-07 exempte
// les contrôleurs, §3.2 : « la couche où un geste utilisateur traverse
// légitimement plusieurs domaines »), même patron que `MarketMemoryModule`
// juste au-dessus. Le commentaire de 2024 sur `ActivityEntity` plus bas
// évoquait un cycle « ContactsModule importe déjà BriefingModule » — vérifié
// ce lot (`git grep briefing` dans `apps/api/src/modules/contacts` : aucun
// résultat) : ce cycle n'existe plus, `app-module-boots.spec.ts` le confirme.
import { ContactsModule } from '../contacts/contacts.module'
import { MailboxModule } from '../mailbox/mailbox.module'
// #1637 — `MarketMemoryService` sert le CONTRÔLEUR, pas `BriefingService`
// (GA-07 est à son plafond). Un module qui en importe un autre n'est pas
// balayé par cette garde : seul un SERVICE qui va chercher celui d'un voisin
// l'est.
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { SignalHistoryModule } from '../signal-history/signal-history.module'
import { TasksModule } from '../tasks/tasks.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { BriefingController } from './briefing.controller'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { BriefingService } from './briefing.service'
import { DailyBriefMarkerService } from './daily-brief-marker.service'

/**
 * Le brief du jour. Module autonome (règle #7) : il agrège des capacités
 * existantes — le retirer supprime un écran, rien d'autre.
 *
 * ⚠️ Depuis le lot 7A (#1936), il porte UNE table à lui : `user_daily_brief`,
 * le marqueur « première ouverture du jour » de Laura. Elle n'appartient à
 * aucune autre capacité — retirer ce module retire donc aussi cette table,
 * ce qui reste cohérent avec la règle #7 (le module reste retirable d'un bloc).
 */
@Module({
  imports: [
    // #4068.6 — le lecteur unique des faits du compte (porte `ACCOUNT_FACTS_READER`).
    AccountFactsModule,
    AgendaModule,
    // ⚠️ LE MOTEUR DE PARCOURS A ENFIN UN APPELANT (#1503).
    //
    // `ChainsService` n'était nommé que par son propre contrôleur, son module et
    // son test : du code juste, calculé, testé, que personne n'appelait — le
    // défaut n°1 de ce dépôt, et ici il tenait toute la fonctionnalité. Le brief
    // du matin lit maintenant ses blocages. Le sens de la dépendance est le bon :
    // le brief lit les parcours, les parcours ignorent le brief.
    ChainsModule,
    ContactsModule,
    MailboxModule,
    MarketMemoryModule,
    SignalHistoryModule,
    TasksModule,
    WorkspaceModule,
    // #2151.23 / #2151.61 — le registre des événements de Découvrir, exporté
    // par le cœur des notifications. C'est le module « léger » prévu pour les
    // sites de déclenchement et de lecture : il n'apporte ni mailer, ni file,
    // ni contrôleur dans le graphe du brief.
    NotificationsCoreModule,
    // ⚠️ `ActivityEntity`, `ContactEntity` et `InterventionEntity` sont ici
    // parce que `BriefingService` les injecte pour les cinq lignes « depuis ta
    // dernière visite » : le bloc lit le SCHÉMA plutôt que les services de
    // `ActivitiesModule`, `ContactsModule` et `PlaybooksModule` — GA-07 est à
    // son plafond, et les deux derniers importent déjà `BriefingModule` par
    // ailleurs (le cycle serait immédiat). Oublier une déclaration ici ne casse
    // AUCUN test unitaire et empêche l'API de démarrer : c'est GA-20.
    // `UserDailyBriefEntity` sert `DailyBriefMarkerService` (lot 7A, #1936).
    // `AttackAngleEntity` sert la cinquième ligne, `attack_angles_added`
    // (#2803, #2389.4) — même raison GA-07/GA-20 que les trois au-dessus.
    // `RoutineRunEntity` sert la sixième, `night_routines_run` (#2803,
    // #2389.4) — même raison.
    TypeOrmModule.forFeature([
      AccountEntity,
      ActivityEntity,
      AttackAngleEntity,
      ContactEntity,
      // #3386 — `esn_profiles.user_role` : le rôle métier déclaré réordonne le brief.
      EsnProfileEntity,
      InterventionEntity,
      ProfileEntity,
      RoutineRunEntity,
      UserDailyBriefEntity,
      // #2397.7 — `UserPreferenceEntity` : le sac de préférences personnelles
      // (`user_preferences`, JSONB, un service voisin l'expose déjà via
      // `MemoryService`) porte le retour utilisateur sur le classement du
      // brief (`briefingRoleFit`). Injectée en ENTITÉ, pas en service voisin
      // (GA-07 est à son plafond — même pattern que les trois entités
      // au-dessus, pour la même raison).
      UserPreferenceEntity,
      // #2106.30/.31 (épopée #2802) — le résumé condensé de longue absence
      // gagne deux agrégats serveur : `ActionPlanItemEntity` (ce qui a expiré)
      // et `UserActionEntity` (ce qu'un collègue a traité). Même pattern GA-07
      // que `attackAngles`/`routineRuns` au-dessus : le cliquet est à son
      // plafond, donc on lit le SCHÉMA plutôt que d'importer `ActionsModule`.
      ActionPlanItemEntity,
      UserActionEntity,
      // #2147.5 (correctif 26/09 soir) — `WorkflowRunEntity` : la carte de
      // suivi lit maintenant aussi le job composite de Laura (`laura_job`,
      // #2276), pas seulement `analysis_runs`. Entité, pas `LauraJobService`
      // (GA-07 est à son plafond) — seules des fonctions PURES de
      // `@bellum/contracts` (laura-job.ts) dérivent la carte depuis la ligne.
      WorkflowRunEntity,
      // #2095.12 (épopée #2993) — `NoteEntity` : « ce rendez-vous a-t-il une
      // note qui porte son `source_event_id` ? » (#2103.1, déjà posé, jamais
      // lu par le brief). Entité, pas `NotesService` (GA-07 est à son
      // plafond, même pattern que les entités au-dessus) — une lecture
      // bornée aux rendez-vous déjà sélectionnés, jamais une requête libre.
      NoteEntity,
      // #2770 (#2101.19/.21/.22/.37) — `AgendaBellumCreatedEventEntity` : la
      // preuve locale qu'un évènement a été écrit par la porte de
      // proposition de créneau, croisée côté web pour distinguer une
      // suggestion BellumAI sur la grille/le plateau partagés. Écrite par
      // `confirmSlotProposal`, lue par `listBellumCreatedEventIds` — les
      // deux déjà dans ce module, aucune dépendance neuve.
      AgendaBellumCreatedEventEntity,
      // #2770.63/.64/.65 (#2391.51/.52/.53) — `FocusPlanBlockOutcomeEntity` :
      // la mesure post-bloc (réalisé/interrompu/reporté), écrite par
      // `setFocusPlanBlockOutcome`, sur le même identifiant que
      // `confirmFocusPlanBlock` rend.
      FocusPlanBlockOutcomeEntity,
    ]),
  ],
  controllers: [BriefingController],
  providers: [BriefingService, DailyBriefMarkerService],
  exports: [BriefingService],
})
export class BriefingModule {}
