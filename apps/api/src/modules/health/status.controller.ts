import { Controller, Get } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { StatusService, type StatusReport } from './status.service'

/**
 * Public system status for the bellum-ai.com/status page. No auth — anyone can
 * (and should be able to) check whether Bellum is up.
 *
 * Unlike `/health` (@SkipThrottle, load-balancer probe), this route KEEPS a
 * dedicated light throttle: it is browser-facing and does real (cached) work.
 * 30 req/min per IP is far above the page's 30s polling cadence, and the 15s
 * in-memory cache in {@link StatusService} means even a burst at the limit
 * never fans out to the database/Redis/IA service.
 */
@Controller()
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Throttle({ 'default-1m': { limit: 30, ttl: 60_000 } })
  @Get('status')
  getStatus(): Promise<StatusReport> {
    return this.status.getStatus()
  }
}
