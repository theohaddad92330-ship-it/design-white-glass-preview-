import { cn } from '../lib/utils'
import { LAURA_PORTRAIT_DATA_URI } from './laura-portrait'

/**
 * LE VISAGE DE LAURA — D137, tranchée par Louis le 01/09/2026.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA DÉCISION
 * ═════════════════════════════════════════════════════════════════════════════
 * Les maquettes dessinent Laura avec un visage de femme. Le produit, lui,
 * affichait le **logo Bellum** partout où elle parle : dans l'en-tête de la
 * conversation, à gauche de chacune de ses réponses, pendant qu'elle rédige.
 * Louis a tranché : **le visage, comme la maquette.**
 *
 * Ce que ça change, exactement : l'avatar de Laura, là où elle parle EN SON
 * NOM. **Le logo Bellum ne disparaît pas du produit** — il reste le produit, et
 * il reste partout ailleurs (la marque, les états vides, les blocs « analysé
 * par Bellum », la page de partage public).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUI A CHANGÉ LE SOIR MÊME — LE VISUEL FOURNI PAR LOUIS
 * ═════════════════════════════════════════════════════════════════════════════
 * La première réponse à D137 était une **illustration monochrome écrite à la
 * main** : une silhouette en `currentColor`, sans teint de peau, précisément
 * pour ne ressembler à personne. Elle a tenu une journée.
 *
 * Louis a ensuite fourni le visuel qu'il veut : un **rendu 3D du personnage**,
 * en couleurs, sur fond bleu nuit. Deux questions lui ont été posées avant de
 * l'intégrer, parce que les réponses changeaient matériellement le travail —
 * et il a tranché les deux :
 *
 *  1. **Où ?** → *partout*, y compris à 16 px dans la barre latérale. L'autre
 *     option (le visuel en grand, un dessin en petit) a été écartée.
 *  2. **Le fond ?** → *gardé tel quel*. Le disque reste bleu nuit dans les
 *     deux thèmes. C'est une couleur qui ne suit pas le thème, assumée comme
 *     une signature — pas un oubli, et pas une exception que GA-33 aurait
 *     laissée passer par distraction.
 *
 * Ce que ce choix COÛTE, écrit ici pour que personne ne le redécouvre :
 *
 *  - à 16 px, le portrait se lit comme une pastille claire sur fond sombre,
 *    plus comme un visage — c'est le prix d'un seul rendu à toutes les tailles ;
 *  - le disque sombre est un aplat fixe au milieu d'une barre latérale claire ;
 *  - le visuel voyage dans le bundle principal (~15 ko), donc il est chargé
 *    avant l'écran de connexion.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CE QUI RESTE REFUSÉ, ET POURQUOI CE VISUEL PASSE
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. **Une photo d'une personne réelle.** Laura est un personnage, pas une
 *    personne : lui prêter le visage de quelqu'un, c'est utiliser son image
 *    pour vendre — sans son accord, et sans qu'elle puisse le retirer. Le
 *    commercial qui montre Laura à un prospect ne peut pas non plus répondre à
 *    « c'est qui ? ».
 * 2. **Une image générée qui ressemble à quelqu'un d'identifiable.** Le même
 *    problème, avec l'excuse en plus. Un portrait photoréaliste généré n'est
 *    pas « personne » : il ressemble statistiquement à des gens qui existent,
 *    et la ressemblance ne se contrôle pas après coup.
 * 3. **La porte qui menait à l'une comme à l'autre.** Le site vitrine portait
 *    `NEXT_PUBLIC_LAURA_AVATAR_URL` : une variable d'environnement qui
 *    basculait l'avatar sur n'importe quelle URL d'image, « le jour où la photo
 *    existera » (D43, §4.3 du PDF 10). D137 la retire, et le visuel de Louis ne
 *    la rouvre pas : il est EMBARQUÉ dans le dépôt, pas pointé par un réglage.
 *    **On retire le MOYEN, pas seulement la permission.**
 *
 * Le visuel fourni est un rendu 3D **stylisé** — proportions de dessin animé,
 * pas de prétention photographique. Il ne désigne donc personne, et c'est
 * exactement la ligne que les points 1 et 2 tracent : ce qui est interdit,
 * c'est de faire passer quelqu'un pour Laura.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER VIT DANS `packages/ui`
 * ═════════════════════════════════════════════════════════════════════════════
 * Parce que Laura se montre dans DEUX applications : l'app (`apps/web` — la
 * conversation, la carte proactive, la bulle, la barre latérale) et le site
 * vitrine (`apps/website` — le widget de chat). `packages/ui` est le seul
 * endroit que les deux consomment. Un visuel recopié diverge : c'est exactement
 * ce qui s'était produit avant D137, où le site montrait une silhouette violette
 * pendant que l'app montrait un cerveau. Loi 1 du tome 7 : **un réglage vit à
 * un seul endroit** — et GA-126 refuse un second visuel dans le dépôt.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LES ÉTATS — ELLE RÉFLÉCHIT, ELLE ATTEND, ELLE A ÉCHOUÉ
 * ═════════════════════════════════════════════════════════════════════════════
 * **L'avatar ne change PAS d'un état à l'autre, et c'est délibéré.** C'est la
 * grammaire qui existait déjà avant D137, relevée dans le code plutôt que
 * réinventée :
 *
 *  - *elle réfléchit* → `TypingIndicator` montre trois points, et l'avatar à
 *    côté est le même qu'au repos (`Chat.tsx`) ;
 *  - *elle a échoué* → le message d'erreur est une réponse comme une autre,
 *    dans une bulle ordinaire (`chat-error.ts`) ;
 *  - *elle attend* → le site vitrine pose `opacity-60` sur l'avatar à gauche de
 *    la zone de saisie. Un réglage du CONSOMMATEUR, via `className` — préservé.
 *
 * Autrement dit, l'état est porté par la BULLE, jamais par le visage. Lui en
 * confier un deuxième canal reviendrait à animer un portrait ouvert huit heures
 * par jour : GA-25 est un cliquet, et « aucun rebond, aucune parallaxe » se
 * décide une fois. Ce fichier n'importe donc pas `framer-motion`, et GA-126
 * vérifie qu'il ne l'importera pas demain.
 */

type LauraFaceProps = {
  /** Le côté du carré, en pixels. Le portrait remplit le disque. */
  size: number
  /**
   * Ajusté par le CONSOMMATEUR — l'opacité de l'avatar en attente sur le site
   * vitrine, une marge, un anneau. Le portrait, lui, ne change pas.
   */
  className?: string
} &
  /**
   * ⚠️ **Décoratif OU nommé, jamais à moitié** (GA-32). Le type le rend
   * impossible plutôt que déconseillé : la moitié qui manque est justement
   * celle qu'on oublie.
   *
   *  - `decorative` quand le nom de Laura est DÉJÀ écrit à côté (l'en-tête de
   *    la conversation), ou quand le parent porte déjà l'annonce (le bouton du
   *    widget, l'indicateur de frappe). Le répéter ferait dire « Laura, Laura »
   *    à un lecteur d'écran.
   *  - `name` quand l'avatar est SEUL à dire qui parle — chacune de ses bulles
   *    dans le fil, où rien d'autre n'attribue le message.
   */
  ({ decorative: true; name?: never } | { decorative?: never; name: string })

export function LauraFace(props: LauraFaceProps) {
  const { size, className } = props
  const label = props.decorative === true ? undefined : props.name

  return (
    <img
      src={LAURA_PORTRAIT_DATA_URI}
      /*
        Le nom vit sur l'image elle-même, une seule fois — c'était le défaut du
        composant `Logo`, qui portait son annonce à l'intérieur du SVG en plus
        de celle de son conteneur. Un `alt=""` sur une image décorative la
        retire de l'arbre d'accessibilité ; `aria-hidden` en plus n'est pas
        redondant, il couvre les lecteurs qui exposent quand même l'élément.
      */
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      /*
        `draggable={false}` : sans lui, un glissement sur l'avatar décroche
        l'image et sort du fil de conversation — le seul élément de la page qui
        se comporte comme un fichier.
      */
      draggable={false}
      style={{ width: size, height: size }}
      className={cn('inline-block shrink-0 rounded-full object-cover select-none', className)}
    />
  )
}
