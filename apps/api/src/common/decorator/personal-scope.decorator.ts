import { SetMetadata } from '@nestjs/common'

/**
 * CE CONTRÔLEUR NE TOUCHE QUE LES DONNÉES DE CELUI QUI APPELLE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MARQUEUR EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * GA-05 exige que chaque contrôleur déclare ce qu'il garde. La quasi-totalité le
 * fait avec `@RequirePermission`, parce qu'ils servent de la donnée d'ESPACE :
 * un compte, une mission, une marge.
 *
 * Une poignée n'en sert aucune. Les réglages de notification d'une personne, son
 * plafond de proactivité, l'interrupteur de son assistante : la donnée est
 * SIENNE, `JwtGuard` l'identifie, et il n'y a rien de plus à autoriser. Leur
 * imposer une permission d'espace serait une faute produit et pas une prudence —
 * un `viewer` doit pouvoir couper Laura (D49 : « une Laura qu'on ne peut pas
 * couper est une Laura qu'on subit »), et lui demander `records:write` pour
 * éteindre une bulle est absurde.
 *
 * Jusqu'ici, ces contrôleurs étaient simplement dans la liste figée des 53 non
 * déclarés — c'est-à-dire indistinguables de ceux qui ont réellement oublié leur
 * permission. Ce marqueur transforme une ABSENCE en DÉCLARATION : quelqu'un peut
 * le lire et le contredire, ce qu'une ligne dans une liste de constat ne permet
 * pas.
 *
 * ⚠️ **Il ne remplace jamais `@RequirePermission` sur une donnée d'espace.** La
 * question à se poser avant de le poser : *un autre membre de l'espace pourrait-
 * il voir quelque chose grâce à cette route ?* Si oui, ce n'est pas un scope
 * personnel, et la permission manque vraiment.
 */
export const PERSONAL_SCOPE_KEY = 'bellum:personal-scope'

export const PersonalScope = () => SetMetadata(PERSONAL_SCOPE_KEY, true)
