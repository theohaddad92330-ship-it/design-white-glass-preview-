/**
 * #2465 — LES BORNES DE COLONNES DE LA LISTE DE CONTACTS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ EN PRODUCTION (16/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Retour bêta #2465 : « le tableau doit tenir dans l'écran peu import la
 * résolution, ça ne doit pas arriver ».
 *
 * Mesuré sur `https://app.bellum-ai.com/contacts`, commit servi `8d78833e9`,
 * fenêtre 1512 × 861 : la PAGE ne débordait pas (`scrollWidth == clientWidth ==
 * 1512`) — la règle « ce qui déborde défile dans SON conteneur, jamais le corps
 * de la page » était déjà tenue. C'est le TABLEAU qui débordait de son propre
 * conteneur :
 *
 *     conteneur 1195 px · tableau 1587 px · 392 px hors du champ
 *
 * Largeurs des onze colonnes, en `table-layout: auto` :
 *
 *     Nom 474 · Entreprise 83 · Entité 174 · Rôle 145 · Niveau 127 · État 105
 *     Donnée vérifiée le 100 · Email / LinkedIn 202 · Mobile / Direct 60
 *     Score 54 · Action 64                                    total 1 588
 *
 * « Nom » prenait 30 % du tableau À LUI SEUL. La cause n'est pas un réglage
 * oublié, c'est le mécanisme : en disposition AUTOMATIQUE, c'est la donnée la
 * plus longue qui commande la mise en page. Tout le monde écrit `noWrap`, donc
 * la largeur minimale d'une colonne EST la plus longue de ses chaînes — un nom
 * à rallonge repoussait « Mobile / Direct » à 60 px et « Score » à 54.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #3713.3 — ONZE COLONNES, UNE PAR DIMENSION, REGROUPÉES EN CINQ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour bêta du 05/10 : onze colonnes restaient une par DIMENSION (nom,
 * rôle, entreprise, entité, palier, état, vérification, canal, téléphone,
 * score, action) quand la lecture attendue est par PERSONNE — qui est-ce, pour
 * qui, où en est la relation, comment la joindre, quoi faire ensuite. Le
 * registre garde onze DIMENSIONS (rien n'est retiré, rien n'est renommé en
 * douce) mais les expose par CINQ cellules composées :
 *
 *   - `identity`   = nom + intitulé de poste + rôle de décision
 *   - `company`    = entreprise + entité (périmètre client)
 *   - `relation`   = palier d'organisation + état du cycle (déjà contacté,
 *                    enrichissement récent, e-mail rejeté) — « situation
 *                    relationnelle »
 *   - `contact`    = e-mail / LinkedIn + téléphone — « moyen de contact/geste »
 *   - `commercial` = date de vérification + score + action — « suivi
 *                    commercial »
 *
 * Chaque dimension garde EXACTEMENT son contenu (ContactTableRow.tsx) ; seule
 * la frontière entre cellules a bougé. Les parts ci-dessous sont la SOMME des
 * parts que portaient les colonnes fusionnées à chaque palier (16/09 et
 * #3549.6), pas un nouveau calcul : fusionner ne change pas le budget, il le
 * regroupe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE : DES PARTS, PAS DES PIXELS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tableau passe en `table-fixed` et chaque colonne déclare sa PART de la
 * largeur du tableau, par palier. Les parts d'un palier font exactement 100 % :
 * le tableau vaut alors la largeur de son conteneur, à toute résolution, et
 * c'est le texte qui se tronque — jamais la mise en page qui s'étire.
 *
 * ⚠️ Pourquoi des POURCENTAGES et pas des `rem` avec un plancher, comme
 * `/accounts` (GA-118) : un plancher en `rem` est une promesse en PIXELS. Il
 * tient à 1 512 px et se remet à déborder à 1 280 px, où le conteneur ne fait
 * plus que ~960 px. Le retour dit « peu import la résolution » — seule une part
 * relative le garantit. Un tableau en parts n'a donc PAS de plancher : un
 * plancher en `rem` contredirait ses colonnes. GA-118 (assertion A) le dit
 * désormais explicitement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PRIORITÉ, ET SA RAISON — QUI CÈDE, ET DANS QUEL ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux mécanismes, dans cet ordre :
 *
 *  1. Une colonne DISPARAÎT (en CSS, dans le MÊME rendu) sous son palier :
 *     cinq colonnes au-delà de 1 024 px (`lg`), quatre au-delà de 768 (`md`),
 *     trois en dessous. `relation` cède la première (elle ne tient plus que
 *     sous 1 024 px), `contact` la seconde (sous 768 px) — les trois autres
 *     restent toujours visibles, comme leurs dimensions les plus prioritaires
 *     l'étaient déjà avant la fusion.
 *  2. Ce qui reste se partage la largeur AU PRORATA de sa part. La part EST donc
 *     la priorité, écrite en clair : `rank` 1 est la colonne qui cède en
 *     DERNIER, `rank` 5 celle dont on accepte qu'elle soit la plus serrée.
 *
 * Un texte coupé garde son texte entier atteignable — `title` sur la cellule, et
 * la ligne entière ouvre la fiche. Rien ne DISPARAÎT : ça se tronque.
 *
 * ⚠️ Une part ne remplit jamais une absence : une colonne étroite affiche moins
 * de caractères, jamais un « 0 » ni une valeur de remplissage. « Non mesuré »
 * reste nommé (`UnknownValue`, « À qualifier », « Périmètre non déterminé »).
 *
 * Gardé par `architecture/le-tableau-des-contacts-tient-dans-lecran.test.ts`.
 * ⚠️ jsdom NE MESURE AUCUNE LARGEUR : la garde lit les bornes DÉCLARÉES, pas un
 * rendu. Les chiffres ci-dessus viennent de l'écran, en production.
 */

type ContactsColumnId = 'identity' | 'company' | 'relation' | 'contact' | 'commercial'

type ContactsTableColumn = {
  id: ContactsColumnId
  /**
   * Visibilité ET part de largeur, par palier — la chaîne est écrite en toutes
   * lettres pour que Tailwind la voie (il ne lit pas une valeur dérivée) et pour
   * que la garde puisse la relire sans exécuter le moindre rendu.
   */
  className: string
  /** 1 = cède en dernier. Unique, et sa raison juste en dessous. */
  rank: number
  reason: string
}

/**
 * La coque du tableau. `table-fixed` EST la borne : sans lui, la donnée la plus
 * longue reprend la main sur la mise en page et #2465 revient.
 *
 * Pas de `min-w-[…]` : ce tableau doit TENIR, pas défiler — voir le docblock.
 */
/**
 * Recette 21/10 A.5 (Simon) — la largeur MINIMALE de la colonne e-mail, en `rem` (GA-31) : une adresse courante tient
 * sur UNE ligne, elle ne se coupe qu'après « @ » ou « . ». En `table-fixed` un `min-width` de cellule est ignoré
 * (mesuré en Chromium) : le plancher vit sur le TABLEAU, dérivé de cette valeur et de la part de `contact` à chaque
 * palier (plancher × part ≥ cette largeur — garde GA-349). En dessous de ce plancher, la zone défilante du tableau prend le relais.
 */
// #4503.3 — plancher `xl` 71 → 62 rem et e-mail 12 → 11 rem : le tableau mesurait 1 136 px dans un conteneur de 998 px à
// 1 280 px (prod 25/10, `6bc31eb5e9`), « Origine » hors champ. 62 rem = 992 px ≤ 998 ; 18 % de 992 = 178 px ≥ 11 rem (176).
// Parts `xl` : identity 25 → 24, contact 17 → 18. Les planchers `md`/`lg` n'ont pas été mesurés : inchangés.
export const CONTACT_COLUMN_MIN_REM = 11

export const CONTACTS_TABLE_SHELL =
  'w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-1 md:min-w-[48rem] lg:min-w-[64rem] xl:min-w-[62rem]'

export const CONTACTS_TABLE_COLUMNS: readonly ContactsTableColumn[] = [
  {
    id: 'identity',
    className: 'w-[52%] md:w-[41%] lg:w-[28%] xl:w-[24%]',
    rank: 1,
    reason:
      "#3713.3 — nom + intitulé de poste + rôle de décision : c'est l'objet de la ligne, sans qui elle ne désigne personne et pour quoi elle les contacte. Elle garde la plus grosse part à tous les paliers (la somme de ce que « Nom » et « Rôle » portaient séparément).",
  },
  {
    id: 'company',
    className: 'w-[28%] md:w-[18%] lg:w-[21%] xl:w-[16%]',
    rank: 2,
    reason:
      "Théo B c1-repertoire — « Compte », juste après la personne. #3713.3 — entreprise + entité (périmètre client) : le second identifiant d'une personne dans une liste de prospection, et sa division. Fusion de « Entreprise » et « Entité », seules colonnes de contexte à survivre sous 768 px.",
  },
  {
    id: 'contact',
    className: 'max-md:hidden md:w-[25%] lg:w-[19%] xl:w-[18%]',
    rank: 3,
    reason:
      "Théo B c1-repertoire — après « Compte » (ordre de la maquette). #3713.3 — e-mail / réseau professionnel + téléphone : c'est la colonne sur laquelle on CLIQUE pour joindre la personne. Fusion des anciennes colonnes de canal et de mobile, qui partageaient déjà la priorité la plus haute après l'identité. " +
      "Recette 21/10 A.5 : parts relevées (md 19 → 25, lg 12 → 19, xl 14 → 17 %) — l'adresse tenait dans 98 px et se coupait sur 2-3 lignes ; le plancher du tableau (`CONTACT_COLUMN_MIN_REM`) garantit la largeur, repris sur `identity` et `company`. " +
      'Part `xl` réduite de 20 à 14 % (recette prod 08/10, Q #3899, à 1512 px) : son contenu (e-mail/réseau professionnel + téléphone) est presque toujours court, et sa part dépassait celle de `relation`/`commercial` qui, eux, tronquaient du texte entier.',
  },
  {
    id: 'relation',
    className: 'max-lg:hidden lg:w-[21%] xl:w-[20%]',
    rank: 4,
    reason:
      "#3713.3 — palier d'organisation + état du cycle (déjà contacté, enrichi récemment, e-mail rejeté) : où on en est AVEC cette personne. Fusion de « Niveau » et « État », deux lectures de la même situation relationnelle. " +
      "Part `xl` élargie de 17 à 20 % (recette prod 08/10, Q #3899, à 1512 px) : l'intitulé de palier (« Gouvernance / Board ») et jusqu'à quatre pastilles d'état tronquaient sous 17 %, reprise sur la part de `contact` (ci-dessus), pas sur `identity`.",
  },
  {
    id: 'commercial',
    className: 'w-[20%] md:w-[16%] lg:w-[11%] xl:w-[22%]',
    rank: 5,
    reason:
      '#3713.3 — date de vérification + score + action : le suivi commercial, ce qui reste à faire et depuis quand la donnée tient. Fusion de « Donnée vérifiée le », « Score » et « Action », toujours visible pour garder le geste atteignable. ' +
      'Part `xl` élargie de 16 à 19 % (recette prod 08/10, Q #3899, à 1512 px) : la date de vérification (« 08 oct. 20… ») et la provenance (« lu dans un o… ») tronquaient en plein mot, reprise sur la part de `contact` (ci-dessus), pas sur `identity`. ' +
      '#3911.2 (R12, 15/10) — `xl` 19 → 22 % (repris sur `identity`, 30 → 27 %) : « Mis à jour le JJ/MM/AAAA » mesurait 156 px pour 132 px de colonne, rognée sur 25/25 lignes ; la date reste sur une ligne, sans libellé « emploi vérifié » (#2165.40).',
  },
]

const BY_ID = new Map(CONTACTS_TABLE_COLUMNS.map(column => [column.id, column]))

/**
 * #3942.5 — le `colSpan` de l'en-tête de groupe par compte (brief F05, point
 * 2) : DÉRIVÉ du registre, jamais un « 5 » écrit à part qui diverge dès que ce
 * fichier gagne ou perd une colonne (GA-26).
 */
export const CONTACTS_TABLE_COLUMN_COUNT = CONTACTS_TABLE_COLUMNS.length

/**
 * Les classes d'une colonne — l'entête ET la cellule lisent la MÊME entrée.
 *
 * C'est ce qui rend impossible le décalage que GA-29 traque (une entête masquée
 * sans sa cellule décale toute la ligne d'une colonne, et l'écran montre alors
 * des valeurs sous les mauvais libellés). Ici les deux ne peuvent plus diverger :
 * il n'y a qu'une seule chaîne.
 */
export function contactsColumnClass(id: ContactsColumnId): string {
  const column = BY_ID.get(id)
  // Inatteignable tant que le type tient — mais un `id` venu d'un `as` casserait
  // la colonne en silence, et une colonne sans borne, c'est #2465 qui revient.
  if (!column) throw new Error(`Colonne de contacts inconnue : ${id}`)
  return column.className
}
