import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { computeUrl } from '@bellum/http'

type ProfilerCallbackDescriptor = {
  url: string
  userId: string
}

@Injectable()
export class ProfilerProgressService {
  constructor(private readonly config: ConfigService) {}

  buildCallback(userId: string): ProfilerCallbackDescriptor {
    const baseUrl = this.config.get<string>('apiInternalUrl', 'http://localhost:3000').replace(/\/$/, '')
    const url = computeUrl({ template: '{baseUrl}/internal/profiler/progress', variables: { baseUrl } })
    return { url, userId }
  }
}
