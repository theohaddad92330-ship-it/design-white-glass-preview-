import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { OTP_REDIS_TOKEN } from './otp-redis.token'
import { OtpService } from './otp.service'

/**
 * Redis-backed one-time-password service. The Redis client is dedicated to
 * OTP traffic (not shared with BullMQ / Streams) so a runaway OTP write
 * loop can't starve those subsystems.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: OTP_REDIS_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl') || 'redis://localhost:6379'
        return new Redis(url, {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        })
      },
    },
    OtpService,
  ],
  exports: [OtpService, OTP_REDIS_TOKEN],
})
export class OtpModule {}
