import { SetMetadata } from '@nestjs/common'

/**
 * CE CONTRÔLEUR NE LIT QUE DE LA DONNÉE PUBLIQUE DE MARCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MARQUEUR EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * GA-05 exige que chaque route déclare ce qu'elle garde, et `@PersonalScope`
 * (22/08) a déjà transformé une absence en déclaration pour les routes qui ne
 * servent que la donnée de celui qui appelle.
 *
 * L'écran Territoire est un troisième cas, et il n'entre dans aucun des deux.
 * Il ne sert **la donnée de personne** : le registre des entreprises, les
 * offres d'emploi publiées, les marchés publics attribués et le référentiel ESN
 * partagé sont publics ou mutualisés. Aucune ligne d'espace n'y transite —
 * ni compte, ni contact, ni mission, ni marge.
 *
 * Lui imposer une permission d'espace serait une faute produit doublée d'une
 * fausse sécurité : la permission qu'il faudrait inventer serait accordée à
 * TOUS les rôles, y compris `viewer` (comprendre son marché n'est le privilège
 * de personne), et un droit que tout le monde a ne garde rien — il donne juste
 * l'apparence d'une garde.
 *
 * ⚠️ La question à se poser avant de le poser : *cette route peut-elle rendre
 * une seule ligne qui appartienne à un espace ?* Si oui — un compte du
 * portefeuille, un consultant, un chiffre de marge — ce n'est pas de la donnée
 * de marché, et la permission manque vraiment.
 */
export const MARKET_DATA_KEY = 'bellum:market-data'

export const MarketData = () => SetMetadata(MARKET_DATA_KEY, true)
