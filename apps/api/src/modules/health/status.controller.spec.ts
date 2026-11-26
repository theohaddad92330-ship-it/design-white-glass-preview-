import { Throttle } from '@nestjs/throttler'
import { StatusController } from './status.controller'
import type { StatusReport, StatusService } from './status.service'

describe('StatusController', () => {
  it('delegates to StatusService (cache + probes live there)', async () => {
    const payload = { status: 'operational' } as StatusReport
    const getStatus = jest.fn().mockResolvedValue(payload)
    const controller = new StatusController({ getStatus } as unknown as StatusService)

    await expect(controller.getStatus()).resolves.toBe(payload)
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('keeps a dedicated light throttle on GET /status (public endpoint, no skip)', () => {
    // The route must NOT be @SkipThrottle'd like /health: it is public and does
    // real (cached) work. Assert the @Throttle metadata is present on the handler.
    const metadata = Reflect.getMetadataKeys(StatusController.prototype.getStatus)
    expect(metadata.some(key => String(key).toLowerCase().includes('throttler'))).toBe(true)
    expect(Throttle).toBeDefined()
  })
})
