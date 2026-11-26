import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto'
import { RequestEmailChangeDto } from './dto/request-email-change.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { EmailChangeService, type EmailChangeFailure } from './email-change.service'
import { ProfilesService, type ProfileFailure } from './profiles.service'

function throwProfileFailure(failure: ProfileFailure): never {
  const { code, message, cause } = failure
  switch (code) {
    case 'profile_not_found':
      throw new NotFoundException(message, { cause })
    case 'upsert_failed':
    case 'delete_failed':
      throw new BadRequestException(message, { cause })
    default: {
      const _exhaustive: never = code
      throw new BadRequestException(`Unknown profile failure code: ${String(_exhaustive)}`)
    }
  }
}

function throwEmailChangeFailure(failure: EmailChangeFailure): never {
  const { code, message, cause } = failure
  switch (code) {
    case 'email_taken':
    case 'email_unchanged':
      throw new ConflictException(message, { cause })
    case 'otp_invalid':
    case 'otp_expired':
    case 'otp_throttled':
    case 'otp_max_attempts':
    case 'update_failed':
      throw new BadRequestException(message, { cause })
    default: {
      const _exhaustive: never = code
      throw new BadRequestException(`Unknown email change failure code: ${String(_exhaustive)}`)
    }
  }
}

@Controller('profiles')
@UseGuards(JwtGuard)
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly emailChange: EmailChangeService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.profiles.getMe(user.userId), throwProfileFailure)
  }

  @Put('me')
  async updateMe(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
    return unwrap(await this.profiles.upsertMe(user.userId, dto), throwProfileFailure)
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    unwrap(await this.profiles.deleteMe(user.userId), throwProfileFailure)
  }

  @Get('me/email/pending-change')
  async pendingEmailChange(@CurrentUser() user: CurrentUserPayload) {
    const newEmail = await this.emailChange.getPending(user.userId)
    return { new_email: newEmail }
  }

  @Post('me/email/request-change')
  @HttpCode(200)
  async requestEmailChange(@CurrentUser() user: CurrentUserPayload, @Body() dto: RequestEmailChangeDto) {
    return unwrap(await this.emailChange.request(user.userId, dto.new_email), throwEmailChangeFailure)
  }

  @Post('me/email/confirm-change')
  @HttpCode(200)
  async confirmEmailChange(@CurrentUser() user: CurrentUserPayload, @Body() dto: ConfirmEmailChangeDto) {
    return unwrap(await this.emailChange.confirm(user.userId, dto.new_email, dto.otp), throwEmailChangeFailure)
  }
}
