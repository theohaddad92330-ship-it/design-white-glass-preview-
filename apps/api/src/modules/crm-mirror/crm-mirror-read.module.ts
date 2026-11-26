import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmDealEntity } from '../../database/entities/crm-mirror.entity'
import { CrmMirrorReader } from './crm-mirror.reader'

/**
 * SYNC-A — le LECTEUR du miroir CRM, seul : sans dépendance au module CRM, il peut être importé par lui
 * (la récolte des affaires de veille) comme par Laura, sans cycle. Ses appelants l'injectent en
 * `@Optional()` : sans lui, ils lisent le fournisseur en direct, comme avant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CrmDealEntity])],
  providers: [CrmMirrorReader],
  exports: [CrmMirrorReader],
})
export class CrmMirrorReadModule {}
