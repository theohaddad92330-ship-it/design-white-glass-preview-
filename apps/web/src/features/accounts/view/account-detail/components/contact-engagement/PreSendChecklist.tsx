import {
  personaForHierarchyLevel,
  preSendCheck,
  type HierarchyLevel,
  type PreSendCheckItem,
  type PreSendVerdict,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AlertTriangle, Check, HelpCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Le contrôle avant envoi — la checklist en huit points du guide d'approche.
 *
 * Elle tourne dans le navigateur, sur le brouillon que le commercial a sous les
 * yeux : fonction pure, aucun appel réseau, aucun crédit. Un contrôle qui
 * coûterait un appel serait coupé le jour où quelqu'un regarde la facture, et
 * c'est justement celui qu'on veut voir tourner à chaque message.
 *
 * Trois choix d'affichage, chacun pour une raison précise :
 *
 * - **Rien ne bloque.** Le bouton d'envoi reste actif quoi qu'il arrive. Bloquer
 *   sur une heuristique de comptage de mots ferait perdre un message juste, et
 *   apprendrait à contourner le contrôle plutôt qu'à le lire.
 * - **Repliée quand tout va bien, ouverte dès qu'un point échoue.** Une liste de
 *   huit lignes vertes sous chaque brouillon cesse d'être lue en trois jours.
 * - **Les lignes non vérifiables sont MONTRÉES**, jamais masquées. Trois des
 *   huit règles demandent de comprendre un texte ; les taire laisserait croire
 *   que la checklist en compte cinq, et que « tout est vert » veut dire
 *   « relu ».
 *
 * ## Ce que le contrôle a besoin de SAVOIR
 *
 * Il a longtemps tourné aveugle : `step: 1` écrit en dur, aucun persona, aucune
 * date de message précédent — donc trois des huit points rendaient un verdict
 * sans regarder la situation. Un contrôle juste qu'on nourrit mal ne se signale
 * pas : il dit « conforme » avec le même aplomb.
 *
 * Les trois entrées arrivent désormais du contact (`EngagementMessage`), et
 * **chacune peut manquer**. Quand elle manque, la ligne le DIT : pas de palier
 * connu ⇒ aucun persona deviné, pas de date ⇒ aucun « 0 jour ». « Non mesuré »
 * n'est pas « mesuré à zéro », et c'est précisément sur un écran d'envoi que la
 * confusion coûte.
 */
export function PreSendChecklist({
  body,
  subject,
  sellerCompany,
  hierarchyLevel,
  step,
  daysSincePrevious,
  realContext,
}: {
  body: string
  subject?: string | null
  sellerCompany?: string | null
  /**
   * #2123.74 — les éléments réels du dossier que le brouillon généré citait
   * (`specificity.elements`). Le contrôle vérifie qu'ils sont ENCORE dans le
   * texte à l'écran — une édition peut les avoir retirés.
   */
  realContext?: readonly string[] | null
  /**
   * Le palier hiérarchique du destinataire. Le persona s'en DÉRIVE ici, par
   * `personaForHierarchyLevel` — la dérivation vit à un seul endroit, et un
   * palier inconnu rend `null` plutôt qu'un persona plausible.
   */
  hierarchyLevel?: HierarchyLevel | null
  /** Le rang RÉEL du message dans la séquence. */
  step?: number
  /** Jours écoulés depuis le message précédent — `null` si aucun n'est daté. */
  daysSincePrevious?: number | null
}) {
  const { t } = useTranslation('engagement')
  const items = useMemo(
    () =>
      preSendCheck({
        body,
        subject: subject ?? null,
        step,
        sellerCompany: sellerCompany ?? null,
        persona: personaForHierarchyLevel(hierarchyLevel),
        daysSincePrevious: daysSincePrevious ?? null,
        realContext: realContext ?? null,
      }),
    [body, subject, sellerCompany, hierarchyLevel, step, daysSincePrevious, realContext],
  )
  const failures = items.filter(item => item.verdict === 'fail')
  const [open, setOpen] = useState(false)
  const expanded = open || failures.length > 0

  return (
    <div className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left"
      >
        {failures.length === 0 ? (
          <Check className="size-3.5 shrink-0 text-[var(--success-soft-text)]" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
        )}
        <Text size="xs" weight="medium">
          {failures.length === 0 ? t('preSend.allClear') : t('preSend.failures', { count: failures.length })}
        </Text>
      </button>

      {expanded ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map(item => (
            <ChecklistLine key={item.id} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * Une ligne du contrôle, et — quand l'échec en est une — l'erreur qui tue le
 * taux de réponse dont il est une occurrence.
 *
 * Elle s'affiche ICI, sous le point qui l'a détectée, et non dans un encart
 * « les six erreurs à éviter » à côté : une liste générique se lit une fois puis
 * devient du décor, alors qu'« Envoyer le même message à tout le monde » sous un
 * `{{Prénom}}` resté en place nomme ce qu'on est en train de faire. C'est aussi
 * pourquoi elle ne paraît que sur un ÉCHEC — le contrat ne la pose jamais sur un
 * point conforme ou non vérifiable.
 */
function ChecklistLine({ item }: { item: PreSendCheckItem }) {
  const { t } = useTranslation('engagement')

  return (
    <li className="flex gap-2">
      <span className="mt-0.5 shrink-0">
        <VerdictIcon verdict={item.verdict} />
      </span>
      <div className="min-w-0">
        <Text element="p" size="xs">
          {item.rule}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {item.detail}
        </Text>
        {item.mistake ? (
          <Text element="p" size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
            {t('preSend.killerMistake', { mistake: item.mistake })}
          </Text>
        ) : null}
      </div>
    </li>
  )
}

function VerdictIcon({ verdict }: { verdict: PreSendVerdict }) {
  if (verdict === 'pass') return <Check className="size-3 text-[var(--success-soft-text)]" />
  if (verdict === 'fail') return <AlertTriangle className="size-3 text-[var(--warning-soft-text)]" />
  // Ni vert ni rouge : la machine ne sait pas, et le dire est le point.
  return <HelpCircle className="size-3 text-[var(--bellum-text-muted)]" />
}
