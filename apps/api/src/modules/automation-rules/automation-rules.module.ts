import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRuleFiringEntity } from '../../database/entities/automation-rule-firing.entity'
import { AutomationRuleTrialEntity } from '../../database/entities/automation-rule-trial.entity'
import { CanonicalTriggerEventEntity } from '../../database/entities/canonical-trigger-event.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { AtsModule } from '../ats/ats.module'
import { AtsService } from '../ats/ats.service'
import { LocksModule } from '../locks/locks.module'
import { OutreachModule } from '../outreach/outreach.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AutomationRuleEditorService } from './automation-rule-editor.service'
import { AutomationRulesController } from './automation-rules.controller'
import { AutomationRulesScheduler } from './automation-rules.scheduler'
import { AutomationRulesService } from './automation-rules.service'
import { AutomationRunnerService } from './automation-runner.service'
import { AutomationSignalReader } from './automation-signal-reader'
import { AUTOMATION_MISSIONS_PORT, type AutomationMissionsPort } from './automation-ports'

/**
 * Les fins de mission, lues dans l'ATS connecté de la personne par la MÊME
 * sélection que la routine `mission_ending` (`snapshot` → `selectEndingMissions`,
 * fenêtre de 30 jours). `readable: false` quand aucun ATS n'est connecté : la règle
 * n'a pas tourné, son compteur reste « non mesuré ». Une mission sans date de fin
 * n'est jamais retenue (`daysRemaining` absent).
 */
const missionsPort = {
  provide: AUTOMATION_MISSIONS_PORT,
  inject: [AtsService],
  useFactory: (ats: AtsService): AutomationMissionsPort => ({
    async endingMissions(userId) {
      const snapshot = await ats.snapshot(userId, { endingWithinDays: 30 })
      if (!snapshot.status.connected) return { readable: false, missions: [] }
      return {
        readable: true,
        missions: snapshot.endingMissions.flatMap(mission =>
          mission.daysRemaining === null
            ? []
            : [
                {
                  id: mission.id,
                  title: mission.title,
                  companyName: mission.companyName,
                  daysRemaining: mission.daysRemaining,
                },
              ],
        ),
      }
    },
  }),
}

/**
 * Lot L-D1 (#4167) — les AUTOMATISATIONS : « quand [signal] → alors [inscrire dans
 * la séquence X | préparer l'action Y] ». Module autonome : sa propre table de
 * règles et son journal ; il agit par DEUX ports (`AUTOMATION_ACTIONS_PORT`,
 * réalisé dans le module outreach, et les missions de l'ATS), jamais en important
 * un service voisin. Le retirer n'enlève que cet écran et ce passage du matin.
 */
@Module({
  imports: [
    WorkspaceModule,
    // Le module outreach EXPORTE le port d'actions (`AUTOMATION_ACTIONS_PORT`) : l'inscription et la
    // préparation passent par ses gardes, pas par les nôtres.
    OutreachModule,
    AtsModule,
    // Sans cette ligne, le verrou singleton du passage du matin dégraderait en exécution directe (GA-76/GA-77).
    LocksModule,
    TypeOrmModule.forFeature([
      AutomationRuleEntity,
      AutomationRuleFiringEntity,
      AutomationRuleTrialEntity,
      CanonicalTriggerEventEntity,
      AccountEntity,
      ContactEntity,
      ProjectNeedEntity,
      WorkspaceMemberEntity,
    ]),
  ],
  controllers: [AutomationRulesController],
  providers: [
    AutomationRulesService,
    AutomationRuleEditorService,
    AutomationSignalReader,
    AutomationRunnerService,
    AutomationRulesScheduler,
    missionsPort,
  ],
})
export class AutomationRulesModule {}
