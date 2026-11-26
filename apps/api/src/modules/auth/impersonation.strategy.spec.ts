import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import type { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'
import { ImpersonationStrategy } from './impersonation.strategy'

// LUDOVIC-D LC.10 — une session TERMINÉE depuis la console (ligne `stop`) ne s'utilise plus.
const config = {
  get: (key: string, def?: unknown) => ({ internalApiSecret: 'x'.repeat(40) })[key] ?? def,
} as unknown as ConfigService

const payload = { sub: 'user-1', email: 'u@x.fr', act: 'ops', impersonation: true, jti: 'jti-1' }

function strategyWith(stops: number): ImpersonationStrategy {
  const audit = { count: jest.fn().mockResolvedValue(stops) } as unknown as Repository<ImpersonationAuditEntity>
  return new ImpersonationStrategy(config, audit)
}

describe('LC.10 — ImpersonationStrategy refuse une session terminée', () => {
  it('session en cours : le principal est rendu', async () => {
    await expect(strategyWith(0).validate(payload)).resolves.toMatchObject({ userId: 'user-1', jti: 'jti-1' })
  })

  it('SAIT DIRE NON : un `stop` existe pour ce jti ⇒ 401', async () => {
    await expect(strategyWith(1).validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
