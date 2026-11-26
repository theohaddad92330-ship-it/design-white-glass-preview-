import { useTranslation } from 'react-i18next'
import { offerLensFrom, type OfferLens } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'

/**
 * « ANALYSE PERSONNALISÉE AVEC TON PORTEFEUILLE D'OFFRE » — maquette SOL6 n°6.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BANDEAU EXISTE POUR REFUSER
 * ─────────────────────────────────────────────────────────────────────────────
 * Un bandeau qui afficherait un portefeuille PAR DÉFAUT ferait croire à une
 * personnalisation qui n'a pas eu lieu — et c'est le mensonge le plus coûteux de
 * cet écran, parce qu'il porte sur ce que le produit prétend savoir du vendeur.
 * Un commercial qui lit « analyse personnalisée avec ton portefeuille » sur un
 * espace où personne n'a jamais rien saisi croira que le dossier a été lu sous
 * SON prisme. Il ne l'a pas été.
 *
 * `ResolvedPortfolio.source` porte déjà la réponse (`'legacy'` = rien n'a jamais
 * été enregistré) ; `offerLensFrom` la rend lisible, à UN seul endroit (GA-26).
 * Le bandeau se contente d'appliquer les trois états :
 *
 *  · **on ne sait pas encore** (la lecture est en vol, ou elle a échoué) ⇒ RIEN.
 *    Un « portefeuille non renseigné » de chargement est le même défaut que le
 *    « 0 » de chargement : il se lit comme une vérité.
 *  · **rien de renseigné** ⇒ on le DIT, avec où le renseigner.
 *  · **renseigné** ⇒ le prisme, et le territoire. Un territoire vide se dit
 *    aussi : « aucune zone déclarée » n'est pas « France entière ».
 */

export function AccountOfferLensBanner() {
  const { t } = useTranslation(['accounts', 'projects'])
  const { data, isPending, isError } = useOfferPortfolio()
  // LUDB.4 — même source que Réglages › Profil : les zones des réponses du profil.
  const { data: esnAnswers } = useEsnProfile()

  // « Je ne sais pas encore » n'est PAS « ce n'est pas configuré » : afficher le
  // second pendant la lecture ferait clignoter un reproche à chaque ouverture.
  if (isPending || isError || !data) return null

  const lens: OfferLens = offerLensFrom(data)

  if (lens.state === 'not_configured') {
    return (
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('accounts:offerLens.notConfigured')}
      </Text>
    )
  }

  const domain = lens.companyType
    ? t(`projects:sectors.domains.${lens.companyType}`)
    : t('accounts:offerLens.domainUnknown')
  const declaredZones = lens.territories.length ? lens.territories : (esnAnswers?.geo_zones ?? [])
  const territories = declaredZones.length ? declaredZones.join(' / ') : t('accounts:offerLens.noTerritory')

  return (
    <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
      {t('accounts:offerLens.personalised', { domain, territories })}
    </Text>
  )
}
