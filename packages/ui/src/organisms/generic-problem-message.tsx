import { memo, type ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { Button } from '../components/button'
import { cn } from '../lib/utils'

type GenericProblemMessageProps = {
  title: string
  principalMessage: string
  firstSubText: string
  secondSubText?: string
  /**
   * Pre-styled JSX rendered inside the icon circle. The caller keeps full
   * control over sizing/colour — typical Lucide usage:
   * `icon={<SearchX className="h-7 w-7 text-[var(--bellum-primary-500)]" />}`.
   */
  icon?: ReactNode
  buttonText?: string
  onButtonClick?: () => void
  secondaryButtonText?: string
  onSecondaryButtonClick?: () => void
  imgSrc?: string
  imgAlt?: string
  illustration?: ReactNode
  /**
   * #2442.5 — ce qui se dit APRÈS l'explication, en plus petit : la référence
   * support de l'incident. Une fente, pas un champ texte — l'appelant décide
   * s'il y a quelque chose à dire, et n'affiche rien quand il n'a rien (« on
   * n'affiche pas ce qu'on n'a pas »).
   */
  footer?: ReactNode
  className?: string
}

export const GenericProblemMessage = memo<GenericProblemMessageProps>(function GenericProblemMessage({
  title,
  principalMessage,
  firstSubText,
  secondSubText,
  icon,
  buttonText,
  onButtonClick,
  secondaryButtonText,
  onSecondaryButtonClick,
  imgSrc,
  imgAlt,
  illustration,
  footer,
  className,
}) {
  return (
    <Box
      display="flex"
      className={cn(
        'relative min-h-full items-center bg-[var(--bellum-bg)] justify-center px-4 py-6 lg:py-16',
        className,
      )}
    >
      <Box
        display="flex"
        className="w-full max-w-6xl flex-col items-start justify-center gap-10 lg:flex-row lg:items-center"
      >
        {(illustration || imgSrc) && (
          <Box display="flex" className="order-1 w-full justify-center lg:order-2 lg:w-auto lg:justify-end">
            {illustration ?? (
              <img
                className="h-auto w-48 sm:w-56 md:w-64 lg:w-72 xl:w-80"
                src={imgSrc}
                alt={imgAlt ?? 'illustration'}
              />
            )}
          </Box>
        )}

        <Box className="order-2 w-full text-center lg:order-1 lg:max-w-xl lg:text-left">
          <Box className="space-y-4 lg:space-y-6">
            <Text element="h1" size="4xl" weight="semibold" leading="tight" color="text-[var(--bellum-text-primary)]">
              {title}
            </Text>
            <Box className="space-y-3 lg:space-y-4">
              {icon && (
                <Box display="flex" className="justify-center lg:justify-start">
                  <Box
                    display="inline-flex"
                    rounded="full"
                    className="h-14 w-14 items-center justify-center bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-300)_8%,transparent)]"
                  >
                    {icon}
                  </Box>
                </Box>
              )}
              <Text size="base" color="text-[var(--bellum-text-primary)]" className="text-center lg:text-left">
                {principalMessage}
              </Text>
              <Box>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {firstSubText}
                </Text>
                {secondSubText && (
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {' '}
                    {secondSubText}
                  </Text>
                )}
                {footer}
              </Box>
            </Box>
          </Box>

          <Box display="flex" className="mt-8 hidden gap-3 lg:flex">
            {onSecondaryButtonClick && secondaryButtonText && (
              <Button variant="secondary" size="sm" onClick={onSecondaryButtonClick}>
                {secondaryButtonText}
              </Button>
            )}
            {onButtonClick && buttonText && (
              <Button variant="black" size="sm" onClick={onButtonClick}>
                {buttonText}
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {(onButtonClick || onSecondaryButtonClick) && (
        <Box display="flex" className="fixed bottom-4 left-4 right-4 flex-col gap-3 lg:hidden">
          {onButtonClick && buttonText && (
            <Button variant="default" size="lg" fullWidth onClick={onButtonClick}>
              {buttonText}
            </Button>
          )}
          {onSecondaryButtonClick && secondaryButtonText && (
            <Button variant="secondary" size="lg" fullWidth onClick={onSecondaryButtonClick}>
              {secondaryButtonText}
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
})
