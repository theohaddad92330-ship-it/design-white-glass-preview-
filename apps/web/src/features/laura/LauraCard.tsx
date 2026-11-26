import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, LauraFace, Text } from '@bellum/ui'
import { formatCents } from '@/lib/money'
import { AiDisclosure } from './AiDisclosure'
import { createPortal } from 'react-dom'
import { CHAT_INFLOW_CONTAINER, presentationFor } from './presentation'
import { useLauraChatSlot } from './chat-slot'
import { useLocation } from '@tanstack/react-router'
import type { MissionStartAnnouncement } from '@bellum/contracts'
import { useLaura, type BenchCostDetail } from './useLaura'

/**
 * LAURA PRODUIT, À L'ÉCRAN — §5.5 du PDF 10.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Rien. Il demande au serveur « as-tu quelque chose à dire sur cet écran ? » et
 * affiche la réponse. Le budget d'interruption, le retrait, la priorité, la
 * détection : tout vit côté serveur, testé. Un navigateur qui choisirait ses
 * propres interventions choisirait ce qui l'interrompt — et un client peut
 * envoyer n'importe quoi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DU §5.5 QUI SE VOIENT ICI
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **« Rien » est le format le plus important.** Quand le serveur se tait, ce
 *    composant ne rend rien — pas un espace réservé, pas un « tout va bien ».
 * 2. **Jamais de modale bloquante, jamais de son.** Une bulle, une carte ou un
 *    tiroir — selon ce que l'intervention demande — qu'on peut ignorer sans la
 *    fermer, et derrière lesquels on continue à travailler. Aucun voile, aucun
 *    piège au clavier.
 * 3. **« Pas maintenant » est un vrai bouton.** Sans lui, la seule façon de
 *    faire taire Laura serait de la couper entièrement, ce que D49 rend possible
 *    mais qu'on préfère éviter.
 *
 * ⚠️ Tout ce qui n'est pas de l'affichage vit désormais dans `useLaura` (Tome 7
 * §48) : c'est la SEULE porte vers l'assistante. Le tome appelle « risque
 * technique n°1 du programme » le cas où chaque surface implémenterait sa
 * propre logique d'interruption — deux compteurs, deux budgets, et le budget de
 * trois par jour ne tient pas une semaine.
 */

/**
 * Le coût de l'intercontrat de `long_bench`, dans la LANGUE active — trois cas
 * qui ne se confondent JAMAIS (voir `computeBenchCost`,
 * `apps/api/src/modules/consultants/bench-cost.ts`) :
 *
 *  - montant CONNU → le chiffre, formaté par `formatCents` (la langue de
 *    l'APP, pas celle du navigateur — voir `lib/money.ts`) ;
 *  - TJM inconnu → « non mesurable », NOMMÉ, avec le geste qui le débloque ;
 *  - durée inconnue → « non mesurable », nommé, sans geste utilisateur
 *    puisqu'aucune saisie ne la corrige directement.
 *
 * ⚠️ Le serveur rend le RÉSULTAT (`benchCost`, voir `useLaura`), jamais une
 * phrase : composer le texte ICI, plutôt que côté API, est ce qui permet à un
 * utilisateur anglophone de lire « Cost of the bench time » là où il lisait
 * du français quel que soit `i18n.language`.
 */
function benchCostMessage(benchCost: BenchCostDetail, t: TFunction<'laura'>): string {
  if (benchCost.measurable) return t('benchCost.amount', { amount: formatCents(benchCost.amountCents) })
  return t(benchCost.reason === 'tjm_missing' ? 'benchCost.tjmMissing' : 'benchCost.durationUnknown')
}

/**
 * #2409.8 — les lignes qui NOMMENT ce qui manque avant un démarrage, dans la
 * langue active. Une absence ne fait AUCUNE ligne : sans réserve, pas de
 * ligne « Réserve » ; sans manque bloquant, la mission est seulement nommée.
 */
function missionStartLines(
  missionStart: MissionStartAnnouncement,
  t: TFunction<'laura'>,
  item: (key: string) => string,
): string[] {
  const names = (keys: readonly string[]) => keys.map(item).join(', ')
  const lines = [
    missionStart.missing.length > 0
      ? t('missionStart.missing', { label: missionStart.label, items: names(missionStart.missing) })
      : t('missionStart.mission', { label: missionStart.label }),
  ]
  if (missionStart.reserves.length > 0) lines.push(t('missionStart.reserves', { items: names(missionStart.reserves) }))
  return lines
}

export function LauraCard() {
  const { t } = useTranslation('laura')
  const { t: tMissions } = useTranslation('missions')
  const { intervention, benchCost, missionStart, overdueFollowUp, act, refuse, dismiss } = useLaura('card')
  const location = useLocation()
  const chatSlot = useLauraChatSlot()
  const onChat = location.pathname.startsWith('/chat')

  if (!intervention) return null
  // #3551 — sur /chat : dans le flux du fil, ou nulle part (jamais en surimpression).
  if (onChat && !chatSlot) return null

  // La FORME vient de l'intervention, pas du composant : `format` était écrit
  // en base et lu par personne, si bien qu'un `panel` — un appel d'offres à
  // trois jours, priorité 90 — sortait dans la même carte de coin qu'un conseil
  // de prise en main. `data-laura-format` rend la décision lisible à l'écran
  // comme à la recette : ce qui n'est visible nulle part se remet à dériver.
  const presentation = presentationFor(intervention.format)

  const card = (
    <aside
      role="status"
      aria-label={t('label')}
      data-laura-format={intervention.format}
      className={onChat ? CHAT_INFLOW_CONTAINER : presentation.container}
    >
      {/*
        Le visage — D137 (01/09/2026). Cette carte arrive TOUTE SEULE dans un
        coin de l'écran : jusqu'ici elle ne portait aucune marque de Laura, ni
        logo ni avatar, et son identité tenait au seul `aria-label`. Un message
        qui s'invite sans dire de qui il vient se lit comme une notification
        système, pas comme son copilote.

        Décoratif : le nom vit dans l'`aria-label` de la carte (`t('label')` —
        « Message de Laura »), qu'un lecteur d'écran annonce avant le contenu.
        Le nommer ici le ferait dire deux fois.

        24 px, sous le seuil de détail : les traits du visage ne sont pas
        rendus, seule la silhouette l'est. C'est voulu — la carte est un
        message, pas un portrait, et le titre doit rester ce qu'on lit d'abord.
      */}
      <div className="flex items-center gap-2">
        <LauraFace size={24} decorative />
        {presentation.showsTitle ? (
          <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-secondary)]">
            {t('label')}
          </Text>
        ) : null}
      </div>
      {/* « Assistante IA », sur les TROIS formes — bulle comprise.
          L'obligation (article 50 de l'EU AI Act, applicable depuis le
          02/08/2026) est que la personne sache qu'elle parle à une machine
          SANS avoir à le demander ; une bulle qui interrompt sans le dire est
          exactement le cas que l'article vise. Elle coûte une ligne de 12 px
          au budget du §11.3, et c'est un coût assumé : le titre, lui, reste
          réservé au panneau. */}
      <AiDisclosure className="mb-2" />
      {/* Le budget de lignes du §11.3 vient de la MÊME table que le conteneur
          (GA-26) : une carte de 384 px et une bulle de 320 px n'accueillent pas
          la même phrase. Il ne peut rien couper qui soit passé par la CI —
          `laura-surface-constraints.test.ts` (GA-69) refuse un texte trop long
          AVANT qu'il n'arrive ici, avec une estimation pessimiste. */}
      <Text size="sm" weight="medium" className={presentation.clamp}>
        {t(`interventions.${intervention.key}`)}
      </Text>
      {/* Le coût de l'intercontrat — aujourd'hui réservé à `long_bench` (voir
          `useLaura`, `laura.service.ts:70-95`) : le chiffre, ou la raison
          NOMMÉE d'un coût non mesurable, avec le geste qui le débloque. Le
          serveur rend le RÉSULTAT, `benchCostMessage` compose la phrase dans
          la langue active — un texte vit à un seul endroit, ici, et pas
          recopié dans chaque langue côté serveur. Absent pour les vingt-neuf
          autres interventions, qui restent leur seule phrase de catalogue. */}
      {benchCost ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {benchCostMessage(benchCost, t)}
        </Text>
      ) : null}
      {/* #3398.4a — la relance due se NOMME (titre, compte, retard), composée
          dans la langue active ; les autres se comptent sans être nommées. */}
      {overdueFollowUp ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {overdueFollowUp.accountName
            ? t('overdueFollowUp.withAccount', {
                title: overdueFollowUp.title,
                account: overdueFollowUp.accountName,
                count: overdueFollowUp.daysOverdue,
              })
            : t('overdueFollowUp.noAccount', { title: overdueFollowUp.title, count: overdueFollowUp.daysOverdue })}
          {overdueFollowUp.others > 0 ? ` ${t('overdueFollowUp.others', { count: overdueFollowUp.others })}` : ''}
        </Text>
      ) : null}
      {missionStart
        ? missionStartLines(missionStart, t, key => tMissions(`startReadiness.items.${key}`)).map(line => (
            <Text key={line} size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {line}
            </Text>
          ))
        : null}
      <div className="mt-3 flex items-center gap-2">
        {intervention.route ? (
          <Button size="sm" variant="violet" onClick={act}>
            {t(`actions.${intervention.key}`)}
          </Button>
        ) : null}
        {/* « Pas maintenant » n'est PAS une fermeture : le §5.3 distingue le
            refus d'une proposition — qui ne revient pas avant trente jours — de
            la fermeture sans lecture, qui met Laura en retrait. */}
        <Button size="sm" variant="ghost" onClick={refuse}>
          {t('notNow')}
        </Button>
        <button
          type="button"
          aria-label={t('close')}
          onClick={dismiss}
          className="ml-auto rounded-control px-2 py-1 text-[var(--bellum-text-secondary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
        >
          ✕
        </button>
      </div>
    </aside>
  )
  return onChat && chatSlot ? createPortal(card, chatSlot) : card
}
