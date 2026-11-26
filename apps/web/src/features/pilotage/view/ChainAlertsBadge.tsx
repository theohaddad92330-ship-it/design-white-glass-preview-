import { Badge } from '@bellum/ui'
import type { PilotageLevelReport } from '@bellum/contracts'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { revealTarget } from '@/lib/reveal-target'
import { alertingLevels, chainLevelAnchor } from './chain-alerts'

/**
 * « 3 alertes » — et le chemin vers les trois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #1128 : « Pareil que les autres fois. Si tu mets un truc en rouge, peux tu me
 * mettre cliquable pour qu'on arrive directement sur lesdites alertes :) »
 *
 * Le chiffre était juste — il compte les maillons dont le statut est `alerte` —
 * et c'était une pastille inerte : huit cartes dans la mosaïque, deux ou trois
 * rouges quelque part dedans, et le seul moyen de savoir lesquelles était de
 * les relire une par une. Le même défaut que sur le tableau de bord (#1095,
 * #1096), corrigé par le même geste : `revealTarget`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CHOIX À NE PAS REPRENDRE POUR DES OUBLIS
 * ─────────────────────────────────────────────────────────────────────────────
 * • **Le pluriel est tenu.** « lesdites alertes » : le clic suivant mène à la
 *   SUIVANTE, puis boucle. Mener toujours au même maillon rendrait le bouton
 *   inutile dès le deuxième clic, alors que le compteur en annonce trois.
 * • **Zéro alerte ⇒ aucune pastille.** Pas de « 0 alertes » : un compteur à zéro
 *   présenté comme une mesure ferait chercher quelque chose qui n'existe pas.
 *
 * `<button type="button">` et non `<div onClick>` (GA-35) : ça se tabule, ça
 * répond à Entrée, et ça s'annonce.
 */
export function ChainAlertsBadge({ levels }: { levels: PilotageLevelReport[] }) {
  const { t } = useTranslation('pilotage')
  const alerting = alertingLevels(levels)
  /** Le prochain maillon à montrer. Une référence et non un état : la valeur ne
   *  change rien à l'affichage, la re-rendre pour elle serait du bruit. */
  const cursor = useRef(0)

  if (alerting.length === 0) return null

  const goToNextAlert = () => {
    // On essaie chaque maillon en alerte à partir du curseur : une destination
    // absente du document (repli, chargement) ne doit pas rendre le bouton
    // inerte — c'est le voisin qu'on montre, pas rien.
    for (let step = 0; step < alerting.length; step += 1) {
      const index = (cursor.current + step) % alerting.length
      const level = alerting[index]
      if (level && revealTarget(chainLevelAnchor(level.level))) {
        cursor.current = (index + 1) % alerting.length
        return
      }
    }
  }

  return (
    <button
      type="button"
      onClick={goToNextAlert}
      // Le nom accessible CONTIENT le libellé visible (WCAG 2.5.3) et ajoute ce
      // que le clic fait — « 3 alertes » seul ne dit pas qu'on peut y aller.
      aria-label={t('alertsGoTo', { count: alerting.length })}
      className="flex items-center rounded-full pointer-coarse:min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] focus-visible:ring-offset-2"
    >
      <Badge
        variant="warning"
        className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--bellum-warning)_28%,transparent)]"
      >
        {t('alerts', { count: alerting.length })}
      </Badge>
    </button>
  )
}
