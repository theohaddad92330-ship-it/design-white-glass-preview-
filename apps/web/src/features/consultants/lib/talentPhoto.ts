/**
 * La photo d'un talent — la SOURCE d'image, validée avant tout rendu (écran
 * Vivier, PDF-22 §01, piège n°3, dépôt du 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS `ContactAvatar` / `contactPhotoSrc`
 * ─────────────────────────────────────────────────────────────────────────
 * `contactPhotoSrc` (`@/lib/company-logo.ts`) relaie EXPLICITEMENT une photo
 * tierce (Apollo, LinkedIn) par notre propre origine, et BLOQUE tout `data:`
 * URI par construction — « on ne relaie qu'un http(s), jamais un data: venu
 * des données ». C'est le bon réflexe pour une photo SOURCÉE DE L'EXTÉRIEUR,
 * mais une photo de talent est déposée PAR L'UTILISATEUR, sur SON compte,
 * validée côté serveur (`talentPhotoSchema`) avant d'être écrite — la faire
 * passer par ce relais l'aurait fait disparaître en silence : la fiche
 * afficherait des initiales sans qu'aucune erreur ne le dise.
 *
 * Cette fonction est donc le SEUL contrôle : elle ne relaie rien (rien à
 * relayer, c'est déjà notre propre donnée), elle vérifie juste la FORME —
 * même motif que `talentPhotoSchema` côté serveur, en défense en profondeur.
 */
const TALENT_PHOTO_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/

/** La source à passer à `<EntityAvatar src>` — `null` sur tout ce qui n'est
 *  pas une image encodée reconnue (jamais un `data:text/html`, jamais une URL
 *  arbitraire). */
export function talentPhotoSrc(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null
  return TALENT_PHOTO_PATTERN.test(photoUrl) ? photoUrl : null
}
