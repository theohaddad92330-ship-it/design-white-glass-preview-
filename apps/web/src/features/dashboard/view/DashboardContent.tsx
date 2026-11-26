import { motion } from 'framer-motion'
import { ActivationChecklist } from '@/features/onboarding/components/ActivationChecklist'
import { ProfileComplementCard } from '@/features/onboarding/components/ProfileComplementCard'
import { PilotageAccroche } from '@/features/pilotage/view/PilotageAccroche'
import { NotificationsSettingsLink } from '../components/NotificationsSettingsLink'
import { PersonalCockpit } from '../components/personal/PersonalCockpit'
import { pageVariants } from '../lib/animations'

/**
 * Le tableau de bord est MONO-VUE : « Moi », le cockpit personnel.
 *
 * #1457 / #1458 / #1459 — il portait un second onglet « Équipe » qui rendait un
 * cockpit d'équipe parallèle, nourri par `GET /dashboard/kpis` et
 * `GET /dashboard/roi`. Deux problèmes, et le second est le grave :
 *
 *  · le VRAI cockpit d'équipe est `/team` (`ManagerDashboardPage`, dix-sept
 *    blocs branchés), et deux cockpits d'équipe divergent le jour même ;
 *  · l'onglet n'était gardé par RIEN — zéro occurrence de `team:manage` dans
 *    tout `features/dashboard` — alors qu'il servait des agrégats d'ESPACE.
 *
 * L'onglet, le cockpit qu'il rendait et les deux routes qui le nourrissaient
 * ont été retirés : on retire le MOYEN, pas seulement la permission. La garde
 * `architecture/one-team-cockpit.test.ts` (GA-254) tient la règle.
 */
export function DashboardContent({ withPilotageHook = true }: { withPilotageHook?: boolean }) {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="w-full">
      {/* Activation self-serve (D1) : dérivée de données réelles, disparaît une
          fois les 5 étapes faites — voir ActivationChecklist. */}
      <ActivationChecklist />
      {/* Temps 2 : le complément de profil, proposé UNE FOIS la première
          analyse terminée — jamais avant, jamais bloquant. */}
      <ProfileComplementCard />
      {/* #2108.21 → .25 / #2208.29 — L'ACCROCHE du pilotage (arbitrage de
          Louis, 16/09/2026) : trois chiffres et un lien, jamais un second
          cockpit. La règle générale — « une lecture agrégée vit sur UNE route,
          la page d'arrivée n'en porte que l'accroche » — et sa garde vivent
          dans `architecture/one-team-cockpit.test.ts`, là où GA-254 est déjà
          écrite. Elle ne rend RIEN sans la capacité ni avant la lecture. */}
      {/* Dans le Cockpit (vue « Moi »), l'accroche serait un lien vers l'écran même où l'on est. */}
      {withPilotageHook ? <PilotageAccroche /> : null}
      <PersonalCockpit />
      {/* #2018.5 — décision Louis 18/09/2026 : pas de duplication. L'accueil
          RENVOIE vers les préférences de notification existantes (module
          `notifications`, GA-26) au lieu de les redemander.
          #4297.2 — descendu SOUS le cockpit : un lien de réglage ne prend plus
          la hauteur de la journée (tâches, planning, brouillons) à 1440×900. */}
      <NotificationsSettingsLink />
    </motion.div>
  )
}
