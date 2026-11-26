import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountMemoryEntity } from '../../database/entities/account-memory.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { SavedViewEntity } from '../../database/entities/saved-view.entity'
import { CustomFieldDefEntity } from '../../database/entities/custom-field-def.entity'
import { DealStageSlaEntity } from '../../database/entities/deal-stage-sla.entity'
import { CustomFieldValueEntity } from '../../database/entities/custom-field-value.entity'
import { DuplicatePairEntity } from '../../database/entities/duplicate-pair.entity'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { LocksModule } from '../locks/locks.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { AccountRecordController, ContactRecordController, NotesController } from './crm-core.controller'
import { AccountMemoryService } from './account-memory.service'
import { DealStageSlaController } from './deal-stage-sla.controller'
import { DealStageSlaService } from './deal-stage-sla.service'
import { GovernanceController } from './governance.controller'
import { DuplicatesSweeper } from './duplicates.sweeper'
import { GovernanceService } from './governance.service'
import { NotesService } from './notes.service'
import { FieldConflictService } from './field-conflict.service'
import { ProvenanceService } from './provenance.service'
import { RecordEditService } from './record-edit.service'

/**
 * Socle du CRM natif : provenance par champ, journal d'écriture, notes et
 * édition des fiches.
 *
 * Module autonome (règle #7) — le retirer supprime l'édition et les notes sans
 * toucher à l'analyse. `ProvenanceService` est EXPORTÉ parce que les tranches
 * suivantes (projets, activités, talents) et, à terme, les writers du pipeline
 * doivent passer par le même arbitre : deux implémentations de la règle
 * « human > connector > pipeline > model » finiraient par diverger, et la
 * divergence se paierait en corrections effacées.
 */
@Module({
  imports: [
    PlanFeaturesModule,
    WorkspaceModule,
    // #4158.62 — le périmètre BU du composeur de notes de groupe (fail-closed sans lui).
    BusinessUnitModule,
    LocksModule,
    // #2875 (#2402.1, #2402.9) — le registre unique des déclencheurs
    // commerciaux. `GovernanceService.proposeDuplicates` est son premier
    // émetteur migré.
    TriggerRegistryModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      // #2777 — la mémoire du compte que `learnings` écrit désormais.
      AccountMemoryEntity,
      ContactEntity,
      FieldProvenanceEntity,
      RecordFieldAuditEntity,
      NoteEntity,
      SavedViewEntity,
      CustomFieldDefEntity,
      CustomFieldValueEntity,
      DuplicatePairEntity,
      // Le SLA d'étape RÉGLÉ par un espace (PDF 3 §3.5). Une ligne absente = le
      // défaut du produit, jamais zéro jour.
      DealStageSlaEntity,
    ]),
  ],
  controllers: [
    AccountRecordController,
    ContactRecordController,
    NotesController,
    GovernanceController,
    DealStageSlaController,
  ],
  // `DuplicatesSweeper` est ce qui REMPLIT la liste des doublons : sans lui,
  // l'écran est vide en production, ce qui se lit « aucun doublon ».
  providers: [
    ProvenanceService,
    // Le détecteur de contradiction (PDF 6 §5.3). Il ne pose AUCUNE table : il
    // raconte le journal append-only qui archivait déjà les valeurs écartées.
    FieldConflictService,
    RecordEditService,
    NotesService,
    GovernanceService,
    DuplicatesSweeper,
    DealStageSlaService,
    // #2777 — la mémoire du compte (sortie `learnings` de la cascade).
    AccountMemoryService,
  ],
  // `DealStageSlaService` est EXPORTÉ : la file d'interventions et le board
  // doivent lire LE MÊME seuil que l'écran de réglage. Deux lectures du même
  // réglage finissent par diverger (GA-26). `AccountMemoryService` : #2777,
  // `MeetingNotesService` (module `meeting-notes`) en a besoin pour la sortie
  // `learnings`.
  // `FieldConflictService` : #3219, la façade `AccountIntelligenceContext`
  // (module `account-intelligence`) lit ses contradictions ouvertes via un
  // jeton composé dans son propre `*.module.ts` (GA-07 au plafond) — ce qui
  // suppose que cette classe soit exportée d'ici.
  exports: [
    ProvenanceService,
    NotesService,
    GovernanceService,
    DealStageSlaService,
    AccountMemoryService,
    FieldConflictService,
  ],
})
export class CrmCoreModule {}
