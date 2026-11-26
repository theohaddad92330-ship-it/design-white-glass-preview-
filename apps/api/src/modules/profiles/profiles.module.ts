import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { AuthModule } from '../auth/auth.module'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { MailerModule } from '../mailer/mailer.module'
import { OtpModule } from '../otp/otp.module'
import { EmailChangeService } from './email-change.service'
import { ProfilesController } from './profiles.controller'
import { ProfilesService } from './profiles.service'

@Module({
  imports: [AuthModule, EsnProfileModule, MailerModule, OtpModule, TypeOrmModule.forFeature([ProfileEntity])],
  controllers: [ProfilesController],
  providers: [ProfilesService, EmailChangeService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
