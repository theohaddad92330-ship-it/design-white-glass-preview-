import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BackofficeAuditEventEntity } from '../../database/entities/backoffice-audit-event.entity'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { AuditJournalController } from './audit-journal.controller'
import { AuditJournalRetentionService } from './audit-journal-retention.service'
import { AuditJournalService } from './audit-journal.service'
import { AUDIT_SINGLETON_LOCK, type UnderSingletonLock } from './audit-journal-tokens'

/**
 * LE JOURNAL D'AUDIT UNIQUE DU BACK-OFFICE, dans SON module (#1666).
 *
 * POURQUOI UN MODULE À LUI PLUTÔT QU'UN SERVICE DANS `AdminModule`
 * Deux modules le consomment déjà : lui-même (l'écriture par la console et la
 * lecture par l'écran) et `BackofficeAccessJournalModule`, qui y MIROITE ses
 * entrées d'accès — sans quoi « journal unique » serait un titre et pas un fait.
 * Faire importer `AdminModule` par le journal d'accès les aurait soudés, et la
 * règle n°7 du dépôt veut que retirer un module ne casse pas le reste.
 *
 * Ce module ne dépend que de TypeORM et des verrous : n'importe quel autre peut
 * donc l'importer, et il peut disparaître sans emporter personne — le journal
 * d'accès l'injecte en `@Optional()` et retombe alors sur son comportement
 * d'avant.
 *
 * ⚠️ LE VERROU ARRIVE PAR UN JETON, PAS PAR UN SERVICE INJECTÉ.
 * GA-07 est un cliquet AU PLAFOND (254 imports, **124 fichiers pour 124**) : un
 * fichier neuf qui importerait `SingletonLockService` ferait tomber la garde sur
 * son second compteur quoi qu'il arrive. La composition se fait donc ICI, la
 * couche que GA-07 exempte précisément parce que c'est là qu'on compose — et
 * GA-76 accepte cette forme à condition que la fabrique VERROUILLE réellement,
 * ce qu'elle fait ci-dessous. Voir `audit-journal-tokens.ts`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BackofficeAuditEventEntity]), LocksModule],
  controllers: [AuditJournalController],
  providers: [
    AuditJournalService,
    AuditJournalRetentionService,
    InternalSecretGuard,
    {
      provide: AUDIT_SINGLETON_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
  ],
  exports: [AuditJournalService],
})
export class AuditJournalModule {}
