import { NotFoundException } from '@nestjs/common'
import { LegalContractUploadTokenGuard } from './legal-contract-upload-token.guard'

function contextWith(token: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params: { token } }) }),
  } as never
}

describe('LegalContractUploadTokenGuard — fail-closed, ne dit jamais pourquoi', () => {
  it('laisse passer un jeton valide', async () => {
    const links = { resolvePublic: jest.fn().mockResolvedValue({ status: 'valid' }) } as never
    const guard = new LegalContractUploadTokenGuard(links)
    await expect(guard.canActivate(contextWith('cup_ok'))).resolves.toBe(true)
  })

  it.each(['not_found', 'expired', 'revoked'] as const)('refuse un jeton « %s » avec le MÊME 404', async status => {
    const links = { resolvePublic: jest.fn().mockResolvedValue({ status }) } as never
    const guard = new LegalContractUploadTokenGuard(links)
    await expect(guard.canActivate(contextWith('cup_x'))).rejects.toBeInstanceOf(NotFoundException)
  })
})
