import { Module } from '@nestjs/common'
import { LogoController } from './logo.controller'
import { LogoService } from './logo.service'

/**
 * Company-logo relay. Fully self-contained (règle #7 — removing it changes no
 * other module): no entity, no repository, no other service. It exists purely
 * to put a cacheable same-origin URL in front of third-party logo hosts that
 * send no `Cache-Control` of their own.
 */
@Module({
  controllers: [LogoController],
  providers: [LogoService],
})
export class LogoModule {}
