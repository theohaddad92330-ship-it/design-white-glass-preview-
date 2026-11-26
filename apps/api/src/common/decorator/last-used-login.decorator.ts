import { SetMetadata } from '@nestjs/common'

export const LAST_USED_LOGIN_KEY = 'bellum:last-used-login'

export type LastUsedLoginMethod = 'password' | 'google' | 'otp'

/**
 * Tags an auth handler with the login method it represents (`password`,
 * `google`, `otp`, ...). The `AttachRefreshCookieInterceptor` reads this metadata
 * and writes a `lastUsedLogin` cookie so the login screen can preselect
 * the right method for a returning visitor on the next visit.
 */
export const LastUsedLogin = (method: LastUsedLoginMethod) => SetMetadata(LAST_USED_LOGIN_KEY, method)
