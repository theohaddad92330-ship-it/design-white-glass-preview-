import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { Button, LauraFace, Text } from '@bellum/ui'
import { BrowsableDialog } from '@/components/overlay/BrowsableDialog'
import { PRODUCT_TOUR_STEPS } from './tour-steps'
import { useProductTourStore } from './product-tour-store'
import { useTourNavigation } from './use-tour-navigation'

/**
 * #1787 · #1863.3 — LA VISITE GUIDÉE : CE QUE CHAQUE ÉCRAN FAIT POUR TOI.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'EST PAS (#1787, toujours valable)
 * ─────────────────────────────────────────────────────────────────────────
 * Pas un spotlight qui survole le rail de navigation en direct : le rail
 * N'EXISTE PAS sur mobile (quatre onglets, coque à part), et un spotlight qui
 * localise des nœuds réels du DOM est fragile au moindre remaniement de la
 * barre latérale — les bibliothèques de tour du marché posent exactement cette
 * surcouche, volent le focus et cassent la tabulation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1863.3 — CE QUI CHANGE : LA PROFONDEUR
 * ─────────────────────────────────────────────────────────────────────────
 * Verbatim du retour : la visite « montre pas du tout les choses dans le
 * détail ». Une étape ne disait qu'une phrase — c'est-à-dire à peine plus que
 * le nom de l'écran, qui était déjà écrit juste au-dessus. Chaque étape porte
 * désormais DEUX choses distinctes :
 *
 *  · une PROMESSE — ce que l'écran fait pour toi, dans ta journée ;
 *  · trois GESTES concrets — ce que tu peux y faire, vérifiés dans le code.
 *
 * ⚠️ Rien de ce que la visite décrit n'est inventé : chaque geste correspond à
 * une capacité qui existe à l'écran. Une visite qui promet ce que le produit ne
 * fait pas est pire qu'une visite courte — elle se découvre en rendez-vous.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX PHASES, DEUX GRAMMAIRES DE FLÈCHES — ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 * Ici (phase « lecture »), les flèches font défiler la VISITE : on parcourt ce
 * que le produit sait faire sans quitter l'écran où l'on est. « Ouvrir cet
 * écran » bascule en phase « visite » : la modale s'efface, la barre prend le
 * relais, et c'est LÀ que les flèches naviguent vraiment d'écran en écran
 * (`ProductTourCompanion`). Lire n'est pas visiter ; les deux gestes existent,
 * et aucun des deux ne termine la visite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE HÉRITE DE `BrowsableDialog` SANS RIEN CODER
 * ─────────────────────────────────────────────────────────────────────────
 * Échap ferme ; la tabulation reste piégée dans la modale ; `z-overlay` (60),
 * jamais un `z-[9999]` ; `MOTION.reveal` sur le changement de contenu ;
 * `max-h-[85dvh]`, un seul conteneur défilant, gouttière de 16 px — donc un
 * rendu correct à 400 px sans branche mobile. Elle ne BOUCLE pas : les flèches
 * se désactivent aux deux bouts plutôt que de repartir au début.
 */
export function ProductTourDialog() {
  const { t, i18n } = useTranslation('onboarding')
  const index = useProductTourStore(state => state.index)
  const goTo = useProductTourStore(state => state.goTo)
  const closeDetails = useProductTourStore(state => state.closeDetails)
  const visitStep = useTourNavigation()

  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'
  const step = PRODUCT_TOUR_STEPS[index] ?? PRODUCT_TOUR_STEPS[0]!
  const label = step.screen.label[lang]
  const Icon = step.icon

  // `returnObjects` : les trois gestes vivent dans UNE clé par étape, jamais
  // trois clés numérotées qu'on oublie d'aligner entre le français et
  // l'anglais. `tour-content.test.ts` vérifie qu'il y en a bien trois des deux
  // côtés — une liste plus courte d'un côté passerait sinon en silence.
  const does = t(`tour.steps.${step.key}.does`, { returnObjects: true }) as string[]

  return (
    <BrowsableDialog
      open
      onOpenChange={next => {
        // Échap et la croix ferment le DÉTAIL. Ce que ça veut dire dépend d'où
        // l'on vient, et c'est le store qui tranche : rendre la main à la barre
        // quand la visite a déjà emmené quelque part, quitter sinon.
        if (!next) closeDetails()
      }}
      index={index}
      total={PRODUCT_TOUR_STEPS.length}
      onIndexChange={goTo}
      contentKey={step.key}
      title={label}
      // Le nombre d'écrans se LIT sur la visite — il était écrit « 6 » dans le
      // catalogue de traduction, donc faux dès la première étape ajoutée.
      subtitle={t('tour.subtitle', { total: PRODUCT_TOUR_STEPS.length })}
      description={t('tour.dialogDescription')}
      labels={{ previous: t('tour.previous'), next: t('tour.next') }}
      leading={
        step.key === 'chat' ? (
          // Laura se nomme elle-même dans le titre de l'étape (D82) :
          // `decorative` évite de la faire annoncer deux fois.
          <LauraFace size={32} decorative />
        ) : (
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-primary-500)]/10 text-[var(--bellum-text-accent)]"
          >
            <Icon className="size-4" />
          </span>
        )
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t(`tour.steps.${step.key}.promise`)}
        </Text>

        <div className="flex flex-col gap-2">
          <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('tour.whatYouCanDo')}
          </Text>
          <ul className="flex flex-col gap-1.5">
            {does.map(action => (
              <li key={action} className="flex gap-2 text-[var(--bellum-text-secondary)]">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--bellum-text-muted)]" aria-hidden />
                <Text element="span" size="sm">
                  {action}
                </Text>
              </li>
            ))}
          </ul>
        </div>

        {/* Le geste principal de l'étape : il n'interrompt plus la visite, il
            la fait changer de forme. */}
        <Button
          type="button"
          size="sm"
          onClick={() => visitStep(index)}
          icon={ArrowRight}
          iconPosition="right"
          className="self-start"
        >
          {t('tour.visit', { label })}
        </Button>
      </div>
    </BrowsableDialog>
  )
}
