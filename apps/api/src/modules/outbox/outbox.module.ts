import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisStreamsEventBus } from '@bellum/events'
import Redis from 'ioredis'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { EVENT_BUS } from './event-bus.token'
import { OutboxDrainer } from './outbox.drainer'
import { OutboxPublisher } from './outbox.publisher'

/**
 * Wires the outbox publisher (caller-side, used inside business
 * transactions) and drainer (background loop, publishes to Redis Streams).
 *
 * The EventBus binding lives here too: a single Redis client, dedicated to
 * Streams traffic, separate from the one BullMQ uses. We could share but
 * BullMQ blocks one connection for BRPOPLPUSH which would starve XADD/
 * XREADGROUP.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEntity]), ScheduleModule.forRoot()],
  providers: [
    OutboxPublisher,
    OutboxDrainer,
    {
      provide: EVENT_BUS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl') || 'redis://localhost:6379'
        const redis = new Redis(url, {
          // Streams clients should not retry forever on disconnect — surface
          // the error to the drainer so it logs and the next tick retries.
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        })
        return new RedisStreamsEventBus(redis)
      },
    },
  ],
  exports: [OutboxPublisher, EVENT_BUS],
})
export class OutboxModule {}
