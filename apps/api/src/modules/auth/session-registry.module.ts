import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { SessionRegistryService } from './session-registry.service'

/**
 * Le registre des sessions-appareils, en module FEUILLE (il n'importe que ses
 * trois entités) : aucun cycle, importable par n'importe quel module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE — #2120.57, trouvé par GA-365 le 20/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `JwtStrategy` lit ce registre pour refuser un jeton dont la session a été
 * RÉVOQUÉE (`jwt.strategy.ts`, `if (deviceId && this.sessions)`), et il
 * l'injecte en `@Optional()`. Or `JwtStrategy` n'est pas enregistrée par le
 * seul `AuthModule` : `McpApiModule` et `OAuthModule` la déclarent AUSSI dans
 * leurs `providers`, pour être autonomes — chacun en obtient donc sa PROPRE
 * instance. Et `SessionRegistryService`, fourni par `AuthModule`, n'y était
 * même pas exporté.
 *
 * Résultat, avant ce module : les instances de `JwtStrategy` de `McpApiModule`
 * et d'`OAuthModule` recevaient `undefined`, le `if` était faux, et le contrôle
 * de révocation était SAUTÉ — en silence. Une session révoquée continuait donc
 * d'authentifier sur l'API MCP et sur le parcours OAuth jusqu'à l'expiration du
 * jeton (1 h par défaut, 24 h au maximum), alors que le navigateur, lui, était
 * bien refusé. Rien ne tombait au démarrage, rien n'était journalisé : c'est la
 * signature exacte du couple `@Optional()` + `?.`.
 *
 * Le module feuille plutôt qu'un `export` de plus sur `AuthModule` : importer
 * `AuthModule` depuis `McpApiModule` et `OAuthModule` ferait voyager avec lui
 * Passport, `JwtModule`, `MailerModule`, `OtpModule` et deux `forwardRef` déjà
 * noués sur `WorkspaceModule` — un cycle se paie cher, et il ne se voit qu'au
 * démarrage. C'est l'idiome déjà employé par `CreditReservationModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserSessionEntity, NotificationEntity, WorkspaceEntity])],
  providers: [SessionRegistryService],
  exports: [SessionRegistryService],
})
export class SessionRegistryModule {}
