import { useTranslation } from 'react-i18next'
import { ComingSoon } from '@/components/ComingSoon'
import type { DisabledProductRoute } from './disabledRoutes'

type DisabledProductRouteProps = {
  route: DisabledProductRoute
}

export function DisabledProductRoute({ route }: DisabledProductRouteProps) {
  const { t } = useTranslation('common')
  // i18n keys: productGating.discover.title | productGating.knowledge.title | productGating.chat.title
  // (idem .description)
  return <ComingSoon title={t(`productGating.${route}.title`)} description={t(`productGating.${route}.description`)} />
}
