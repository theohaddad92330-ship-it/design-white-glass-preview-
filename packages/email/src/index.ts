// Root export — consumed by NestJS at runtime.
// JSX templates live under `./templates/<name>` (see `exports` in
// package.json) and are also rendered server-side via `renderX*`.
export {
  buildOtpContent,
  buildResetPasswordContent,
  buildWelcomeContent,
  type OtpContentInput,
  type ResetPasswordContentInput,
  type WelcomeContentInput,
} from './content.js'

export { renderOtpEmail, renderResetPasswordEmail, renderWeeklyDigestEmail, renderWelcomeEmail } from './render.js'

export {
  buildWeeklyDigestSubject,
  type DigestCadence,
  type WeeklyDigestAccount,
  type WeeklyDigestEmailProps,
  type WeeklyDigestSignal,
} from './templates/weekly-digest-email.js'
