import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { killSwitchCut } from '../../common/kill-switches'
import { Correlated } from '../../correlation-id/background-correlation'
import { AuditJournalService } from './audit-journal.service'
import { AUDIT_SINGLETON_LOCK, type UnderSingletonLock } from './audit-journal-tokens'
import { describePurge, type PurgeTally } from './audit-retention'

/**
 * LE PASSAGE QUI APPLIQUE LES RÉTENTIONS DU JOURNAL D'AUDIT (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans lui, les cinq rétentions de l'issue seraient un tableau dans un écran :
 * du texte qui décrit une promesse que rien ne tient. C'est le défaut n°1 de ce
 * dépôt — du code juste que personne n'appelle — appliqué à une obligation
 * légale (art. 5-1-e : on ne conserve pas des données personnelles sans durée).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE PEUT PAS FAIRE, PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne peut pas effacer une ligne choisie : `purgeExpired` n'accepte aucun
 * identifiant, et les catégories PERMANENTES (`suppression`) n'ont pas de date
 * de coupure, donc aucun chemin ne les atteint. Il ne peut pas non plus laisser
 * un trou silencieux : ce qu'il efface, il l'écrit — une ligne
 * `audit.retention_purge`, elle-même permanente, qui dit quoi, combien et
 * jusqu'à quand.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'HEURE, ET POURQUOI 04:37
 * ─────────────────────────────────────────────────────────────────────────────
 * Après le balayage de rétention RGPD (04:17) et la purge des fichiers échus
 * (03:41), pour ne pas empiler trois `DELETE` de masse sur la même minute, et
 * bien avant qu'un opérateur n'ouvre la console. Une purge quotidienne suffit :
 * les fenêtres se comptent en mois, pas en heures.
 *
 * Interrupteur d'urgence : `AUDIT_JOURNAL_RETENTION_DISABLED=true` (registre
 * `apps/api/src/common/kill-switches.ts`, capacité `backoffice.audit_retention`).
 */
@Injectable()
export class AuditJournalRetentionService {
  private readonly logger = new Logger(AuditJournalRetentionService.name)

  constructor(
    private readonly journal: AuditJournalService,
    // ⚠️ Un JETON, pas le service de verrous : GA-07 est au plafond et cette
    // purge n'a pas besoin du service, elle a besoin de « une seule fois ».
    // Voir `audit-journal-tokens.ts`. Facultatif, pour que le service se
    // construise nu dans un test.
    @Inject(AUDIT_SINGLETON_LOCK) private readonly underLock: UnderSingletonLock = (_name, run) => run(),
  ) {}

  @Cron('37 4 * * *', { name: 'backoffice-audit-retention', timeZone: 'Europe/Paris' })
  @Correlated('cron:backoffice_audit.retention')
  async runDailyPurge(): Promise<void> {
    await this.underLock('backoffice-audit-retention', async () => {
      await this.purge(new Date())
    })
  }

  /**
   * L'horloge est un PARAMÈTRE : un test qui lit `new Date()` passe en janvier
   * et échoue en février.
   *
   * Rend `null` quand la purge n'a pas TOURNÉ (interrupteur posé) — jamais un
   * tableau vide, qui voudrait dire « elle a tourné et n'a rien trouvé ». Ce
   * sont deux phrases différentes, et les confondre ferait dire à un tableau de
   * bord que la rétention est appliquée alors qu'elle est coupée.
   */
  async purge(now: Date): Promise<PurgeTally[] | null> {
    if (killSwitchCut('backoffice.audit_retention')) {
      this.logger.log('Purge du journal d’audit désactivée (interrupteur posé) — aucune ligne n’est effacée')
      return null
    }

    const tallies = await this.journal.purgeExpired(now)
    const deleted = tallies.reduce((sum, tally) => sum + tally.deleted, 0)
    // ⚠️ On journalise même le passage à vide, mais côté EXPLOITATION seulement.
    // Le journal d'audit, lui, ne reçoit une ligne que si quelque chose est
    // parti (voir `purgeExpired`) : une ligne quotidienne « rien à faire »
    // noierait celles qui comptent.
    this.logger.log(`Purge du journal d’audit : ${describePurge(tallies)}`)
    if (deleted > 0) {
      this.logger.log(
        `Purge du journal d’audit : ${deleted} ligne(s) effacée(s), et la purge s’est inscrite au journal`,
      )
    }
    return tallies
  }
}
