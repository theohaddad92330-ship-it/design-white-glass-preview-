import { Linkedin, ListChecks, Mail, Phone, ShieldCheck } from 'lucide-react'
import type { TodayGroupKey } from './todayQueue'

/** Le symbole de chaque geste de la file — la carte ET sa rangée dense le lisent ici (GA-26). */
export const GROUP_ICON: Record<TodayGroupKey, typeof Mail> = {
  validate: ShieldCheck,
  email: Mail,
  linkedin: Linkedin,
  call: Phone,
  task: ListChecks,
}
