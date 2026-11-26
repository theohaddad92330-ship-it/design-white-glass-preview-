import { Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * `<CapabilityGate>` — griser UNE action et dire pourquoi (Tome 7 §46).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE NE FAIT PAS DOUBLE EMPLOI AVEC `<CapabilityBanner>`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau parle de l'ÉCRAN : « une partie de cet écran est indisponible ».
 * La grille parle d'UNE ACTION : « ce bouton-là ne peut rien faire, et voici
 * quoi brancher ». Le tome pose la règle en une phrase — « un seul bandeau de
 * capacité par écran, mais autant de `CapabilityGate` que d'actions » — et
 * c'est la bonne granularité : un écran de messagerie dont la lecture marche et
 * l'envoi non n'a pas à se déclarer dégradé en entier ; c'est le bouton
 * « Envoyer » qui doit le dire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX REFUS
 * ─────────────────────────────────────────────────────────────────────────────
 * **Elle ne CACHE jamais l'action.** Une action masquée ne s'apprend pas : un
 * utilisateur ne peut pas demander une capacité qu'il n'a jamais vue. Elle la
 * grise et la nomme.
 *
 * **Elle ne bloque pas au clic, elle bloque avant.** Un bouton actif qui échoue
 * après le clic est ce que le PDF 7 appelle « l'échec au moment le plus
 * coûteux ». L'enfant est rendu inerte (`pointer-events`), et la raison est
 * lisible au survol ET au clavier — le contenu du tooltip est aussi rattaché à
 * l'action par `aria-describedby`, sinon un lecteur d'écran annonce un bouton
 * désactivé sans jamais dire pourquoi.
 */
export function CapabilityGate({
  available,
  /** Le connecteur à brancher, NOMMÉ. « Une capacité manque » n'apprend rien ;
   *  « connecte ta messagerie » se règle. Clé i18n, jamais un nom d'éditeur —
   *  seul l'écran Réglages › Intégrations nomme les éditeurs. */
  capability,
  children,
}: {
  available: boolean
  capability: string
  children: ReactNode
}) {
  const { t } = useTranslation('access')

  if (available) return <>{children}</>

  const describedBy = `capability-gate-${capability.replace(/[^a-z0-9]+/gi, '-')}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // `inline-flex` et non `block` : la grille enveloppe un bouton dans
          // une barre d'actions, elle ne doit pas casser sa mise en page.
          className="inline-flex cursor-not-allowed opacity-50"
          aria-describedby={describedBy}
        >
          {/* `pointer-events-none` sur l'enfant : le clic n'atteint jamais
              l'action, mais le survol atteint le parent — c'est ce qui permet
              d'afficher la raison plutôt qu'un bouton mort et muet. */}
          <span className="pointer-events-none">{children}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent id={describedBy} role="tooltip">
        {t(`gate.${capability}`, { defaultValue: t('gate.fallback') })}
      </TooltipContent>
    </Tooltip>
  )
}
