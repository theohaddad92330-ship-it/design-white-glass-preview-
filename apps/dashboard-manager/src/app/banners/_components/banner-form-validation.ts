/**
 * Ce qui décide si le formulaire de bannière peut être soumis (#1667.2).
 *
 * La décision vit ici, hors du composant, parce que l'environnement de test de
 * cette application est `node` : ce qui se garde est la LOGIQUE, ce qui se voit
 * à l'écran se recette en direct (cf. `vitest.config.mts`).
 *
 * `endsAt` est désormais l'une des conditions, au même titre que les deux
 * titres — pas seulement côté contrat (`createBannerSchema` /
 * `updateBannerSchema` dans `@bellum/contracts`) mais dès le bouton : une
 * bannière sans date de fin reste affichée aux clients pour toujours, et
 * personne ne s'en souvient.
 */
export function bannerFormCanSubmit(input: {
  titleFr: string
  titleEn: string
  endsAt: string
  state: 'idle' | 'saving' | 'error'
}): boolean {
  return (
    input.titleFr.trim().length > 0 &&
    input.titleEn.trim().length > 0 &&
    input.endsAt.trim().length > 0 &&
    input.state !== 'saving'
  )
}
