import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'crypto'

const HEADER = 'x-internal-secret'

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const raw = request.headers[HEADER]
    const provided = Array.isArray(raw) ? raw[0] : raw
    const expected = this.config.get<string>('internalApiSecret') ?? ''
    if (!provided || !expected) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }
}
