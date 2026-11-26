import { ModeTabs, type ModeTabItem } from '@bellum/ui'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { GroupMode } from './types'

const GROUP_MODE_KEYS: GroupMode[] = ['entity', 'persona']

export function ContactGroupModeTabs({ value, onChange }: { value: GroupMode; onChange: (mode: GroupMode) => void }) {
  const { t } = useTranslation('accountOrg')
  // i18n keys: groupModes.entity | groupModes.persona
  const items: { key: GroupMode; label: string }[] = GROUP_MODE_KEYS.map(key => ({
    key,
    label: t(`groupModes.${key}`),
  }))
  return (
    <motion.div variants={cardFade}>
      <ModeTabs items={items} value={value} onChange={onChange} />
    </motion.div>
  )
}
