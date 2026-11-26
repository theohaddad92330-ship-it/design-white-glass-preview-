import { backofficeAccessEntrySchema } from '@bellum/contracts'
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BackofficeAccessJournalService } from './backoffice-access-journal.service'

class RecordAccessDto extends createZodDto(backofficeAccessEntrySchema) {}

/**
 * Le journal d'accès du back-office (#1671.2) — écriture et lecture.
 *
 * ⚠️ POURQUOI LE BACK-OFFICE PASSE PAR ICI AU LIEU D'ÉCRIRE EN BASE.
 * La console n'a que la clé anon de Supabase, soumise au RLS ; y poser une clé
 * de service serait exactement la faille que `backoffice-auth.ts` signale
 * (`sb_secret_…`). Elle appelle donc l'API avec le secret interne, qui ne touche
 * jamais le navigateur — le même chemin que tout le reste de la console.
 *
 * ⚠️ CE QUE CETTE ROUTE ACCEPTE EST DÉJÀ CONTRAINT. `event` vient d'une
 * énumération fermée, elle-même tenue par la contrainte SQL
 * `backoffice_access_events_event_check` (GA-12). Un appelant qui inventerait un
 * événement est refusé par le schéma avant d'atteindre la base.
 */
@Controller('internal/backoffice/access-journal')
@UseGuards(InternalSecretGuard)
export class BackofficeAccessJournalController {
  constructor(private readonly journal: BackofficeAccessJournalService) {}

  @Post()
  async record(@Body() dto: RecordAccessDto) {
    await this.journal.record(dto)
    // `{ ok: true }` même si l'écriture a échoué : c'est une TRACE, pas une
    // porte. Un opérateur ne doit pas se voir refuser l'entrée parce qu'un
    // `INSERT` a échoué — et l'échec, lui, part dans Sentry côté service.
    return { ok: true }
  }

  @Get()
  async recent(@Query('limit') limit?: string) {
    const entries = await this.journal.recent(limit ? Number(limit) : undefined)
    return { entries }
  }

  /**
   * L'ÉTAT DE SÉCURITÉ — ce que `/securite` du back-office affiche (#1671.4) :
   * connexions récentes, échecs, pays observés, la plus ancienne entrée encore
   * là, et les anomalies des trois signaux de #1671.3 (rafale d'échecs, pays
   * jamais vu, heure inhabituelle).
   *
   * ⚠️ LECTURE SEULE, ET AUCUN ENVOI. Cette route calcule et REND l'état ; elle
   * ne déclenche rien. Le dépôt classe tout envoi sortant réel parmi les arrêts
   * obligatoires — le déclencheur d'une alerte reste à trancher par Louis.
   */
  @Get('etat-securite')
  async etatSecurite(@Query('jours') jours?: string) {
    const fenetre = jours === undefined ? Number.NaN : Number(jours)
    return this.journal.etatSecurite(Number.isFinite(fenetre) ? fenetre : undefined)
  }
}
