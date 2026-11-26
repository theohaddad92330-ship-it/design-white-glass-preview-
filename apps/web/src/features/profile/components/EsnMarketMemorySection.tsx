import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import type { MarketEsnView, MarketEsnViewRead } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useEsnMarketMemory } from '../hooks/useEsnMarketMemory'

/**
 * #1636 — « TON ENTREPRISE DANS LA MÉMOIRE MARCHÉ », en lecture seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC EXISTE POUR FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Donner à l'utilisateur un moyen de juger la matière sur la seule entreprise
 * qu'il connaît par cœur : la sienne. Un commercial qui reconnaît ses propres
 * familles de rôles et les entreprises où d'anciens collègues sont partis fait
 * confiance au reste ; celui qui lit trois lignes fausses sur son employeur ne
 * croira plus rien du produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE WORDING EST LA FONCTIONNALITÉ, PAS SA DÉCORATION
 * ─────────────────────────────────────────────────────────────────────────────
 * · **« Voilà ce que {{brand}} observe. »** et jamais « voilà la vérité sur ton
 *   entreprise » : ce bloc dit ce que NOUS savons, pas ce que le marché FAIT.
 *   C'est la doctrine `c65` à l'échelle d'une seule entreprise (GA-259 la tient
 *   sur les taux de portefeuille ; ici il n'y a pas de taux, seulement des
 *   comptages d'observations — et la même faute est possible avec des mots).
 * · **« pas suffisamment couverte »** et jamais « n'externalise pas », jamais
 *   « aucun parcours », jamais « 0 ». Une absence d'observation n'est pas un
 *   fait sur l'entreprise.
 * · **`{{brand}}` et jamais le nom écrit en clair** : le produit est en marque
 *   blanche, GA-252 fait échouer la CI sur une traduction qui l'oublie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE ÉTATS NE SE DISENT PAS PAREIL, ET LE CINQUIÈME NE DIT RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `undeclared` (personne n'a renseigné le nom) n'est pas `insufficient` (on a
 * cherché, il n'y a pas assez) n'est pas `unavailable` (on n'a pas pu lire).
 * Et tant que la lecture n'a pas répondu, le bloc ne rend RIEN : un « pas
 * suffisamment couverte » affiché pendant un chargement serait une affirmation
 * qu'on n'a pas mesurée.
 *
 * ⚠️ **Aucun nom de personne, aucun comptage de personnes.** Le contrat les
 * refuse déjà (`marketEsnViewSchema`) ; ce composant n'a donc rien à filtrer, et
 * c'est voulu — une réduction faite à l'écran s'oublie au premier appelant
 * suivant.
 */

/** Le corps du bloc quand la mémoire a quelque chose à dire. */
const CoveredBody = memo<{ view: MarketEsnView }>(function CoveredBody({ view }) {
  const { t } = useTranslation('profile')

  return (
    <>
      <Text element="p" size="sm">
        {t('marketMemory.lead')}
      </Text>
      <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('marketMemory.paths', { paths: view.pathsObserved })}
      </Text>
      {/* Une liste vide ne se rend pas du tout : « Familles principales : » suivi
          de rien se lirait comme « il n'y en a aucune », ce qui serait faux. */}
      {view.roleFamilies.length > 0 && (
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('marketMemory.roleFamilies', { families: view.roleFamilies.join(', ') })}
        </Text>
      )}
      {view.destinations.length > 0 && (
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('marketMemory.destinations', { destinations: view.destinations.join(', ') })}
        </Text>
      )}
      {/* La FORCE du rapprochement voyage avec le résultat. Le corpus ne porte ni
          SIREN ni identifiant de registre, et le profil ESN ne porte pas de site :
          le rapprochement se fait par le NOM, c'est-à-dire par le lien FAIBLE.
          On le NOMME pour que la seule personne capable de le démentir — le
          lecteur, sur sa propre société — puisse le faire d'un coup d'œil. */}
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
        {t(`marketMemory.matchedOn.${view.matchedOn}`, { company: view.matchedCompanyName })}
      </Text>
    </>
  )
})

/** La phrase des trois états sans contenu — chacun la sienne, jamais partagée. */
function absenceKey(read: MarketEsnViewRead): string | null {
  if (read.status === 'undeclared') return 'marketMemory.undeclared'
  if (read.status === 'insufficient') return 'marketMemory.insufficient'
  if (read.status === 'unavailable') return 'marketMemory.unavailable'
  return null
}

export const EsnMarketMemorySection = memo(function EsnMarketMemorySection() {
  const { t } = useTranslation('profile')
  const { data } = useEsnMarketMemory()

  // Tant que rien n'est revenu, le bloc ne conclut rien.
  if (!data) return null

  const absence = absenceKey(data)

  return (
    <SettingsBlock label={t('marketMemory.title')}>
      <div className="space-y-2 px-5 py-4 sm:px-6">
        {data.status === 'ok' ? (
          <CoveredBody view={data.view} />
        ) : (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            {t(absence ?? 'marketMemory.unavailable')}
          </Text>
        )}
      </div>
    </SettingsBlock>
  )
})
