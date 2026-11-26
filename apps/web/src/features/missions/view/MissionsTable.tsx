import {
  Box,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal } from 'lucide-react'
import { AskLauraMenuItem } from '@/components/primitives/AskLauraMenuItem'
import { NextAction } from '@/components/primitives/NextAction'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate } from '@/lib/locale'
import { assigneesOf, type MissionView } from '../api'
import { supervisedForfaitLabel } from '../supervised-forfait'
import type { MissionColumnKey } from '../columns'
import { ClippedBadge } from './ClippedBadge'
import { MissionBillingBadge } from './MissionBillingBadge'
import { MissionDeadline } from './MissionDeadline'
import { MissionMargin } from './MissionMargin'
import { MissionRenewalStatus } from './MissionRenewalStatus'
import { MissionRisks } from './MissionRisks'

/**
 * Combien de visages avant de compter le reste (#1350).
 *
 * Deux, parce qu'au-delà la cellule cesse d'être comparable à sa voisine — et
 * comparer est la seule raison d'être d'un tableau. Le retour le demande en
 * toutes lettres : « 2 avatars maximum + "+N" ».
 */
const MAX_VISIBLE_ASSIGNEES = 2

/** Le nombre de jours écoulés depuis un horodatage, ou `null` s'il est illisible. */
function daysSince(value: string | null | undefined): number | null {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  // Un horodatage dans le futur n'est pas une ancienneté de zéro jour : c'est
  // une donnée qu'on ne sait pas lire.
  return days < 0 ? null : days
}

/**
 * La liste des missions, en colonnes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TABLEAU ET PLUS UNE LISTE DE CARTES
 * ─────────────────────────────────────────────────────────────────────────
 * L'écran montrait cinq informations par mission — nom, compte, fenêtre,
 * statut, échéance — sur une carte, et le compte ne s'affichait même jamais
 * (le service ne l'envoyait pas). Tout le reste de ce que l'API rend déjà
 * — le rôle, la nature du contrat, la marge, les risques calculés, l'ancienneté
 * du statut — n'était visible NULLE PART. C'est le motif habituel du dépôt :
 * du calcul juste que personne n'affiche.
 *
 * Un tableau, parce que la question posée devant cette liste est comparative
 * (« laquelle finit en premier ? », « lesquelles n'ont personne ? ») et qu'une
 * carte ne se compare pas à sa voisine.
 *
 * Sous 768 px, `ResponsiveTable` rend une carte par ligne — un seul chemin de
 * rendu, jamais deux listes qui divergeraient, et pas de défilement horizontal
 * qui ferait perdre le nom en lisant la colonne de droite.
 */
export function MissionsTable({
  missions,
  columns,
  onOpen,
  openOnRowClick,
  canReadFinance,
}: {
  missions: readonly MissionView[]
  columns: readonly MissionColumnKey[]
  onOpen: (mission: MissionView) => void
  /**
   * #3559 — toute la ligne ouvre, pas seulement le titre et le chevron. Un contrôle
   * imbriqué (« Demander à Laura », le menu, un lien) garde son propre geste. Le titre
   * reste le bouton tabulable (GA-35) : la ligne n'est que la cible souris, plus large.
   */
  openOnRowClick?: boolean
  /**
   * LE DROIT FINANCIER DU LECTEUR — #1365, rendu à CÔTÉ de la liste.
   *
   * Depuis D45 le champ `marginPercent` vaut `null` dans deux cas opposés :
   * « tu n'as pas ce droit » et « personne n'a saisi le coût chargé ». Le
   * premier ne se répare pas, le second si. Sans ce drapeau, la cellule
   * proposait « Compléter » à qui n'a pas le droit de regarder.
   *
   * ⚠️ `undefined` = l'appelant ne le sait pas. Voir `MissionMargin`.
   */
  canReadFinance?: boolean
}) {
  const { t } = useTranslation('missions')
  const accountColumnShown = columns.includes('account')

  const definitions = useMemo(() => {
    const all: Record<
      MissionColumnKey,
      {
        header: string
        render: (mission: MissionView) => React.ReactNode
        mobile?: 'title' | 'meta' | 'field'
        /**
         * #1804 — LE PLANCHER, PORTÉ EN `rem`.
         *
         * Mesuré (repro navigateur réelle, colonnes par défaut + noms longs
         * réalistes) : sans borne, un `<table>` en layout AUTO grandit sur le
         * contenu le plus long de chaque colonne et pousse la zone défilante
         * de `ResponsiveTable` à 1 538 px pour 1 213 px visibles — 325 px de
         * défilement horizontal pour une liste qui tenait dans l'écran. Une
         * fois chaque colonne bornée ET son texte autorisé à passer à la
         * ligne (voir `mission`/`account` plus bas), la même mesure rend
         * 1 213 px pour 1 213 px : plus aucun défilement.
         *
         * ⚠️ En `rem`, jamais en pixels — même règle que GA-118 : un plancher
         * en pixels ignore le réglage « Taille du texte », qui agit sur la
         * police RACINE, et l'écart revient dès qu'un lecteur agrandit.
         * `ResponsiveTable` applique cette classe au `<th>` ET au `<td>` — un
         * `<th>` sans borne réclame la largeur de son libellé et l'étalement
         * revient (même défaut que GA-118, mesuré sur `/accounts`).
         */
        className?: string
      }
    > = {
      mission: {
        header: t('table.mission'),
        mobile: 'title',
        // #4191 (E3) — Mission CÈDE la place à Risques / Prochaine action / Renouvellement : 11 rem fixes
        // (elle faisait 286 px en `w-[20%]`), le titre passe à la ligne.
        // #4291.1 (recette prod 20/10 : noms sur 3-4 lignes dans une cellule de 108 px) — 12 rem, le PLAFOND que fixe
        // E3 (Mission cède la place à Risques / Prochaine action / Renouvellement) : ≈ 170 px de texte, un intitulé
        // de 45 caractères tient sur deux lignes, jamais tronqué. Au-delà, E3 serait renversé ; la somme des bornes
        // reste sous la mesure sûre (66 rem sur 84).
        className: 'w-[12rem] max-w-[12rem]',
        // Un vrai bouton : ce qui se clique se tabule (GA-35). Une ligne
        // cliquable n'a ni tabulation, ni Entrée, ni annonce au lecteur d'écran.
        //
        // #1804 — « quitte à mettre sur deux lignes des titres et tout » :
        // `truncate` (donc `white-space: nowrap`) forçait le `<table>` à
        // grandir sur le nom de mission le plus long, quelle que soit la
        // largeur déclarée de la colonne — un `max-width` sur un descendant
        // ne compte pas dans le calcul AUTO des colonnes d'un tableau tant
        // que son contenu ne peut pas passer à la ligne. `whitespace-normal
        // break-words` laisse le titre s'écrire sur deux lignes, et c'est
        // alors la largeur DÉCLARÉE de la colonne qui gouverne.
        // #4191 (recette 3, F2) — la ligne entière ouvre la fiche ; le titre reste LE lien tabulable (GA-35).
        // #4191 R22 (S3/F2) — jamais d'ellipse : le nom passe à la ligne ; `title` garde le titre complet. Le menu des actions de
        // ligne vit ICI (la colonne « Ouvrir » a disparu), masqué sous 768 px comme l'était cette colonne.
        // Le compte passe en ligne secondaire tant que sa colonne n'est pas cochée (jamais deux fois, GA-26).
        render: mission => (
          <Box display="flex" className="min-w-0 items-start gap-1">
            <Box className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpen(mission)}
                title={mission.label}
                className="inline-flex min-h-11 max-w-full items-center whitespace-normal break-words text-left font-medium underline-offset-2 hover:underline"
              >
                <span className="break-words">{mission.label}</span>
              </button>
              <MissionBillingBadge alert={mission.billingAlert} />
              {!accountColumnShown && mission.accountName ? (
                <Text
                  element="span"
                  size="xs"
                  color="text-muted-foreground"
                  title={mission.accountName}
                  className="block min-w-0 break-normal"
                >
                  {mission.accountName}
                </Text>
              ) : null}
            </Box>
            <Box className="hidden shrink-0 md:block">
              <MissionRowActionsMenu mission={mission} onOpen={onOpen} />
            </Box>
          </Box>
        ),
      },
      /**
       * LE COMPTE — avec son logo. (#1349)
       *
       * `CompanyAvatar` existait et servait déjà sur vingt-neuf fichiers ; les
       * logos s'affichaient sur `/accounts` pendant que cette colonne rendait
       * du texte nu. La cause n'était pas le composant : la requête des
       * missions ne SÉLECTIONNAIT ni `logo_url` ni `website`. Les brancher sans
       * élargir la lecture aurait rendu la même initiale, et on aurait cru la
       * famille livrée — c'est le motif « un composant juste que personne ne
       * nourrit », déjà payé le 02/09 sur trois écrans.
       *
       * L'avatar est décoratif (`aria-hidden` dans le composant) : le NOM reste
       * le texte de la cellule, donc rien ne change pour un lecteur d'écran.
       */
      account: {
        header: t('table.account'),
        mobile: 'meta',
        // #2979 (RAN, recette ND 10/10, /missions à 1400 px : colonne à 94 px, « LVM H », « DAS SA… ») —
        // un plancher lisible en `rem` : le nom d'un compte n'est jamais réduit à quelques lettres.
        // #2979 (RAT, recette NF 10/10 à 1512 px : 109 px, « DASS/AULT ») — le tableau est en
        // `table-fixed` (R3b) : un `min-width` de cellule n'y compte PAS (le correctif RAN ne bornait
        // rien) ; seule une largeur `w-` réserve la colonne. 10rem = avatar + « DASSAULT » sur une ligne.
        // #2979 (RAX, recette G4 11/10 : « DASSAULT / AVIATION » sur 2 lignes, ligne de 101 px) — UNE ligne
        // + ellipse + `title` : 12rem loge avatar + « DASSAULT AVIATION » ; plus long → « … », jamais 2 lignes.
        className: 'w-[12rem] max-w-[12rem]',
        render: mission =>
          mission.accountName ? (
            // `truncate` est sûr ici : la table est en `table-fixed`, la largeur `w-` borne la cellule.
            <Box display="flex" className="min-w-0 items-center gap-2">
              <CompanyAvatar
                name={mission.accountName}
                logoUrl={mission.accountLogoUrl}
                website={mission.accountWebsite}
              />
              {/* #2979 (RAT) — `break-normal` : le `<td>` en `fixedLayout` porte `break-words`, que le nom
                  HÉRITAIT (« DASS/AULT ») ; on passe à la ligne entre les mots, jamais dans un mot. */}
              {/* #4191 (recette 3, F2) — plus d'ellipse : le nom passe à la ligne entre les mots. */}
              <Text element="span" size="sm" title={mission.accountName} className="min-w-0 break-normal">
                {mission.accountName}
              </Text>
            </Box>
          ) : (
            <UnknownValue reason={t('table.accountUnknown')} />
          ),
      },
      role: {
        header: t('table.role'),
        className: 'w-[14rem] max-w-[14rem]',
        render: mission =>
          mission.role_title ? (
            // #4191.4 (18/10) — plus de `line-clamp` : l'intitulé passe à la ligne entre les mots, il se lit en entier.
            <Text element="span" size="sm" title={mission.role_title} className="break-normal">
              {mission.role_title}
            </Text>
          ) : (
            <UnknownValue reason={t('table.roleUnknown')} />
          ),
      },
      /**
       * QUI EST DESSUS — avec son visage, et la porte vers son profil (#1350,
       * #1363).
       *
       * ─────────────────────────────────────────────────────────────────────
       * CE QUI MANQUAIT, ET CE QUE ÇA A COÛTÉ DE LE BRANCHER
       * ─────────────────────────────────────────────────────────────────────
       * `ContactAvatar` existait, il sert déjà sur neuf écrans, et le champ
       * `consultants.photo_url` est collecté depuis des mois. La cellule
       * rendait pourtant `assignees.join(', ')` — parce que le fil ne portait
       * que des NOMS. C'est le défaut n°1 du dépôt, à l'envers : ce n'est pas
       * un composant que personne n'appelle, c'est un composant que personne ne
       * NOURRIT.
       *
       * Le champ a donc changé de forme côté serveur, et les six lecteurs avec
       * lui. Un `id` était nécessaire de toute façon : #1363 demande que « le
       * consultant ouvre son profil existant », et deux homonymes du vivier
       * auraient ouvert la même fiche à partir d'un nom.
       *
       * ⚠️ DEUX visages au plus, puis « +N » (#1350). Au-delà, la ligne cesse
       * d'être comparable à sa voisine — et le tableau existe pour comparer.
       * Le reste n'est pas MASQUÉ, il est compté : une coupe muette ferait
       * croire la liste complète.
       *
       * ⚠️ La photo est un critère PROTÉGÉ. Elle se DESSINE sur une ligne, elle
       * n'ordonne personne — le tri de cette liste est celui de l'urgence, et
       * `assignees` n'y entre pas. Elle ne monte pas non plus dans un prompt :
       * le pont du copilote la retire (`assignee-photos.ts`).
       */
      staffing: {
        header: t('table.staffing'),
        // #2979 (recette 05/10 : lignes 67-145 px) — deux consultants s'EMPILENT, un nom par ligne
        // (`line-clamp-1` + `title`) au lieu de passer à la ligne : la cellule ne dépasse plus 2 lignes.
        // #2979 — « Léa … » : 9rem ne laissait que quelques lettres après l'avatar.
        // #4191 (D4) — plus de `line-clamp` : un nom passe à la ligne, il n'est jamais coupé. `w-` réserve 11rem.
        className: 'w-[11rem] max-w-[11rem]',
        render: mission => {
          // ⚠️ Trois états, jamais deux. `null` = on n'a pas pu lire ;
          // `[]` = on a lu, personne n'est dessus (une alerte) ; sinon les noms.
          if (mission.assignees == null) return <UnknownValue reason={t('table.staffingUnread')} />
          // #1804 (résiduel) — même famille que `ClippedBadge` : à 144px de
          // plancher, « Personne d'affecté » (132px estimés) ne dépasse pas
          // aujourd'hui, mais de justesse — un défensif à un coût nul.
          if (mission.assignees.length === 0) {
            // #3547 — un forfait encadré n'attend pas de consultant : son rôle
            // tenu remplace une alerte que personne ne pourrait résoudre.
            const supervised = supervisedForfaitLabel(mission)
            if (supervised)
              return (
                <Text element="span" size="sm" color="text-muted-foreground" className="line-clamp-2">
                  {supervised}
                </Text>
              )
            return <ClippedBadge variant="warning">{t('table.unstaffed')}</ClippedBadge>
          }
          // ⚠️ La lecture passe par `assigneesOf` et JAMAIS par le champ brut.
          // Mesuré en recette le 04/09 : le web se déploie une dizaine de
          // minutes avant l'API, et pendant cette fenêtre le champ portait
          // encore des CHAÎNES. Lire `person.fullName` dessus rendait « ? » sur
          // toutes les lignes — moins que la veille.
          const people = assigneesOf(mission)
          const shown = people.slice(0, MAX_VISIBLE_ASSIGNEES)
          const hidden = people.length - shown.length
          return (
            <Box display="flex" className="min-w-0 flex-col items-start gap-y-0.5">
              {shown.map((person, index) => {
                const face = (
                  <>
                    {/* #2979 — avatar de 20 px (`size-5`) : deux consultants empilés = 42 px, sous la cible de 44. */}
                    <ContactAvatar name={person.fullName} photoUrl={person.photoUrl} size="xs" className="size-5" />
                    {/* #3546.3 (recette prod 09/10) — `truncate` pose `white-space: nowrap`, qui fait
                        grandir le `<table>` en layout AUTO sur le nom le plus long (même défaut déjà
                        documenté et corrigé sur `mission` : un `max-width` sur un descendant ne borne
                        pas le calcul AUTO tant que son contenu ne peut pas passer à la ligne) — la
                        colonne « Consultant » débordait alors dans « Statut » (« Léa Marchand »).
                        `line-clamp-1 break-words` garde UN nom par ligne sans bloquer le wrap. */}
                    {/* #4191 (D4, recette 15/10) — « Yanis… » : un nom de consultant n'est JAMAIS tronqué, il passe à la ligne. */}
                    <Text element="span" size="sm" title={person.fullName} className="min-w-0 break-words">
                      {person.fullName}
                    </Text>
                  </>
                )
                // Sans identité, PAS de lien : ouvrir la fiche du premier
                // homonyme du vivier serait pire que ne rien offrir. Le nom
                // s'affiche quand même — c'est l'information qui compte.
                const row =
                  person.id === null ? (
                    <Box display="flex" className="min-w-0 items-center gap-1.5">
                      {face}
                    </Box>
                  ) : (
                    // Un vrai lien : ce qui se clique se tabule (GA-35). L'avatar
                    // est décoratif — le NOM porte le lien, donc rien ne change
                    // pour un lecteur d'écran.
                    <Link
                      to="/consultants/$id"
                      params={{ id: person.id }}
                      className="inline-flex min-w-0 items-center gap-1.5 underline-offset-2 hover:underline pointer-coarse:min-h-11"
                    >
                      {face}
                    </Link>
                  )
                const key = person.id ?? `${person.fullName}-${index}`
                // #2979 — « +N » est replié sur la DERNIÈRE ligne (jamais masqué, toujours compté, #1350) :
                // une troisième ligne portait la cellule à ~64 px.
                if (hidden > 0 && index === shown.length - 1) {
                  return (
                    <Box key={key} display="flex" className="min-w-0 items-center gap-1.5">
                      {row}
                      <Text
                        element="span"
                        size="sm"
                        color="text-muted-foreground"
                        className="shrink-0 whitespace-nowrap"
                      >
                        {t('table.assigneesMore', { count: hidden })}
                      </Text>
                    </Box>
                  )
                }
                return <Fragment key={key}>{row}</Fragment>
              })}
            </Box>
          )
        },
      },
      // #2408.40 — toute colonne RÉSERVE une largeur `w-` : en `table-fixed`, une colonne sans `w-` reçoit le reste
      // (0 px quand les autres débordent) ; la table dépasse alors son conteneur, qui défile (`overflow-x-auto`).
      status: {
        header: t('table.status'),
        mobile: 'meta',
        className: 'w-[6rem] max-w-[6rem]',
        // #1804 (résiduel) — l'anglais dépasse le plancher (« Onboarding »,
        // « Terminated ») là où le français passait de justesse : voir
        // `ClippedBadge`.
        render: mission => (
          <Text element="span" size="sm" className="line-clamp-2">
            {t(`status.${mission.status}`)}
          </Text>
        ),
      },
      /**
       * L'ÉCHÉANCE — rendue par {@link MissionDeadline}, et pas ici.
       *
       * ⚠️ Ce bloc a d'abord porté le rendu lui-même. La recette live du 03/09 a
       * trouvé la conséquence en trois minutes : la lentille « Renouvellements »
       * rend des CARTES et non ce tableau, et affichait donc encore la date en
       * ISO brut — plus grave, la même mission s'y lisait « J-30 » (le nom de la
       * fenêtre) quand cette colonne disait « J-28 » (le vrai décompte). Deux
       * vérités à un clic d'écart. Le rendu vit maintenant à un seul endroit.
       */
      endsOn: {
        header: t('table.endsOn'),
        mobile: 'meta',
        // #4191 (D4, recette 15/10) — « Éché… » : 8rem coupait la pastille. `w-` RÉSERVE la colonne
        // (`table-fixed` ignore `max-w`) ; 9rem loge « J-28 » + la date courte. Si la largeur manque
        // encore, ce sont les colonnes SECONDAIRES qui s'effacent sous 1440 px (`COMPACT_MISSION_COLUMNS`).
        className: 'w-[9rem] max-w-[9rem]',
        // #4191 (E3) — jamais d'ellipse : « Échéance dépassée », « Date de fin manquante » et la date
        // passent à la ligne (`oneLine` = compacte, sans la phrase de conséquence).
        render: mission => <MissionDeadline endsOn={mission.ends_on} renewal={mission.renewal} oneLine />,
      },
      contractKind: {
        header: t('table.contractKind'),
        className: 'w-[7rem] max-w-[7rem]',
        // #1804 (résiduel) — mesuré : l'anglais (« Permanent placement »,
        // 20 caractères) dépasse largement le plancher de 7rem/112px. Voir
        // `ClippedBadge`.
        render: mission => (
          <Text element="span" size="sm" className="line-clamp-2">
            {t(`table.contractKinds.${mission.contract_kind}`)}
          </Text>
        ),
      },
      /**
       * LES RISQUES — rendus par {@link MissionRisks}, et pas ici.
       *
       * ⚠️ Même raison que l'échéance juste au-dessus : la lentille
       * « Renouvellements » rend des CARTES et non ce tableau. Le rendu écrit
       * ici ne s'y serait jamais affiché, et la recette live l'aurait trouvé
       * trois minutes après le déploiement — c'est arrivé le 03/09 sur #1353,
       * mot pour mot.
       */
      risks: {
        header: t('table.risks'),
        // #4191 (E3) — `w-` RÉSERVE la colonne (`table-fixed` ignore `max-w`, d'où les 82 px mesurés) : 10 rem
        // tiennent « Renouvellement non engagé » sur 2 lignes ; la pastille passe à la ligne, jamais d'ellipse.
        className: 'w-[10rem] max-w-[10rem]',
        render: mission => <MissionRisks status={mission.status} risks={mission.risks} oneLine />,
      },
      /**
       * LA PROCHAINE ACTION, EN LIEN — #1354, #1355, #1357.
       *
       * ─────────────────────────────────────────────────────────────────────
       * LE GESTE QUI ÉTAIT EMPÊCHÉ
       * ─────────────────────────────────────────────────────────────────────
       * La colonne « Risques » disait « Renouvellement non engagé », « Sans
       * date de fin », « Marge non mesurée » — et on ne pouvait rien en faire.
       * Trois retours pointent littéralement ces pastilles : « aucune alerte
       * sans porte de sortie » (#1355).
       *
       * La porte existait pourtant DÉJÀ, entière : la dérivation
       * (`activeMissionNextAction`), le contrat (`nextActionLink`), la
       * primitive (`NextAction`) et la route (`/missions/$id`). Il manquait le
       * champ dans la réponse de `GET /delivery/missions` — le défaut n°1 du
       * dépôt, du code juste que personne ne NOURRIT.
       *
       * ⚠️ TROIS états, comme partout. Le champ ABSENT (une API plus ancienne
       * que ce code, pendant les dix minutes qui séparent les deux
       * déploiements) dit « non mesuré » avec sa raison — jamais « rien à
       * faire », qui serait un verdict conclu d'un silence. `none`, lui, EST
       * une réponse : la dérivation le rend en texte, sans destination.
       */
      nextAction: {
        header: t('table.nextAction'),
        // #4191 (E3) — largeur RÉSERVÉE (voir `risks`) : « Facturation bloquée ce mois-ci » sur 2 lignes.
        className: 'w-[11rem] max-w-[11rem]',
        // #3559 (recette 03/10) — la prochaine action passe à la LIGNE (`wrap`) : l'ellipse la coupait
        // (« La fin est passée — tr… ») sans rien gagner, la cellule garde sa largeur et grandit en hauteur.
        // #1804 (résiduel) — mesuré : 176px déclarés, 187px de contenu, sans
        // que rien ne clippe l'excédent. `NextAction` (composant PARTAGÉ hors
        // périmètre de ce fichier) rend déjà son libellé en `truncate`, mais
        // sur un `<Link>` qui n'a jamais son propre `overflow` : sans lui, sa
        // largeur minimale de contenu reste celle du texte ENTIER (même
        // mécanisme que `ClippedBadge`, voir son docblock), et `truncate` ne
        // s'engage donc jamais. `className` est un point d'extension DÉJÀ
        // exposé par `NextAction` (appliqué tel quel au `<Link>`) : lui
        // passer `overflow-hidden` d'ICI suffit, sans toucher au composant
        // partagé.
        render: mission =>
          mission.nextAction === undefined ? (
            <UnknownValue reason={t('table.nextActionUnread')} />
          ) : (
            <NextAction
              action={{ domain: 'active_mission', action: mission.nextAction, missionId: mission.id }}
              size="sm"
              wrap
              // #4191 (E3) — jamais d'ellipse : le libellé passe à la ligne dans la largeur réservée.
              className="max-w-full whitespace-normal break-words"
            />
          ),
      },
      startedOn: {
        header: t('table.startedOn'),
        className: 'w-[7rem] max-w-[7rem]',
        // #1352 — « Même règle pour toutes les dates de cette page. » Le retour
        // ne pointait que l'échéance ; la corriger seule aurait laissé un
        // tableau où deux colonnes de dates s'écrivent différemment.
        render: mission => {
          const readable = formatDate(mission.started_on, { day: 'numeric', month: 'short', year: 'numeric' })
          if (!readable) return <UnknownValue reason={t('table.startedOnUnknown')} />
          return (
            <Text element="span" size="sm">
              {readable}
            </Text>
          )
        },
      },
      /**
       * LA MARGE — rendue par {@link MissionMargin}, et pas ici (#1356, #1365).
       *
       * Trois états, aucun ne s'écrit « 0 % », et le seul qui appelle un geste
       * porte désormais sa PORTE. Le détail des trois — et pourquoi la clé se
       * teste par `in` et non par `== null` — vit dans le composant : deux
       * lentilles la lisent, et une cellule écrite ici ne se serait affichée
       * que dans l'une des deux.
       *
       * #2979 — largeur FIXE (`w-`, pas `max-w-`) : en table-layout auto, un
       * `max-width` posé sur un `<td>` ne borne pas le rendu, et l'état non
       * mesuré (cause + lien « Compléter ») poussait la colonne à 145 px
       * malgré lui. 145 px est la largeur mesurée qui tient les deux états
       * (le chiffre ET les deux lignes de l'état vide) — on la FIXE plutôt que
       * de la laisser flotter.
       */
      margin: {
        header: t('table.margin'),
        // #4191 (E3) — Marge CÈDE la place (160 → 144 px). #4191 (recette 3, F2) : 112 px — l'état non mesuré
        // se dit « non mesurée » (la cause, « Coût chargé manquant », est à l'infobulle) : 127 px de contenu
        // dans 120 ne se reproduit plus.
        className: 'w-[7rem] max-w-[7rem]',
        render: mission => <MissionMargin mission={mission} canReadFinance={canReadFinance} compact />,
      },
      /**
       * OÙ EN EST LA RECONDUCTION — #2195.20, .22 à .29.
       *
       * Le rendu vit dans {@link MissionRenewalStatus}, pas ici : la même
       * valeur s'affiche dans le panneau de décision, et une cellule écrite
       * dans ce fichier n'aurait existé que dans le tableau — c'est exactement
       * ce qui est arrivé à #1353 le 03/09, où la lentille rendait encore
       * l'ancienne version trois minutes après le déploiement.
       *
       * ⚠️ À ne pas confondre avec `status`, la colonne juste au-dessus : celle-
       * là dit où en est la MISSION, celle-ci où en est sa RECONDUCTION.
       */
      renewalStatus: {
        header: t('table.renewalStatus'),
        // #4191 (E3) — « Renouvellement » (14 lettres) ne se coupe pas : 9 rem RÉSERVÉS.
        className: 'w-[9rem] max-w-[9rem]',
        render: mission => <MissionRenewalStatus status={mission.renewal_status} />,
      },
      stageAge: {
        header: t('table.stageAge'),
        className: 'w-[7rem] max-w-[7rem]',
        render: mission => {
          const days = daysSince(mission.stage_entered_at)
          // « 0 jour » serait FAUX sur une mission dont personne n'a horodaté
          // le changement de statut — et c'est le cas de tout l'historique.
          if (days === null) return <UnknownValue reason={t('table.stageAgeUnknown')} />
          return (
            <Text element="span" size="sm">
              {t('table.stageAgeValue', { count: days })}
            </Text>
          )
        },
      },
      /**
       * LE PORTEUR (`owner_id`) — #2195.13.
       *
       * Résolu côté serveur (`DeliveryService.ownersOf`) : la cellule ne fait
       * QUE lire le nom, elle ne le calcule jamais — une seconde résolution ici
       * divergerait de celle du service au premier changement de profil.
       */
      owner: {
        header: t('table.owner'),
        className: 'w-[10rem] max-w-[10rem]',
        render: mission =>
          mission.ownerName ? (
            <Text element="span" size="sm" className="min-w-0 break-words">
              {mission.ownerName}
            </Text>
          ) : (
            <UnknownValue reason={t('table.ownerUnknown')} />
          ),
      },
      /**
       * #2195.12 — LE MANAGER (des consultants affectés).
       *
       * Résolu côté serveur (`DeliveryService.managersOf`) : la cellule ne
       * fait QUE lire le nom, elle ne le calcule jamais. `null` = aucun
       * consultant affecté n'a de manager renseigné, ou lecture illisible —
       * jamais un nom deviné.
       */
      manager: {
        header: t('table.manager'),
        className: 'w-[10rem] max-w-[10rem]',
        render: mission =>
          mission.managerName ? (
            <Text element="span" size="sm" className="min-w-0 break-words">
              {mission.managerName}
            </Text>
          ) : (
            <UnknownValue reason={t('table.managerUnknown')} />
          ),
      },
      /**
       * #2408.33 — LA SATISFACTION DÉCLARÉE, un rail par ligne, jamais fondus.
       *
       * Le niveau est ÉCRIT (#2408.85 : la couleur ne porte jamais seule le
       * sens) ; seul `low` prend la teinte d'exception. Aucun rail déclaré =
       * « non mesuré », jamais « bonne » ni « 0 » (GA-18/19).
       */
      satisfaction: {
        header: t('table.satisfaction'),
        className: 'w-[9rem] max-w-[9rem]',
        render: mission => <MissionSatisfactionCell satisfaction={mission.satisfaction} />,
      },
    }
    return all
  }, [t, onOpen, canReadFinance, accountColumnShown])

  /**
   * LA PORTE DE LA LIGNE — #1359, redessinée par #4191 (recette 3, F2).
   *
   * La colonne de fin « Ouvrir » (chevron + menu, 144 px) a DISPARU : à 1485 px elle
   * poussait le tableau à 1 571 px. La ligne ENTIÈRE ouvre la fiche (`onRowClick`), le
   * titre reste le bouton tabulable (GA-35), et le menu des actions de ligne
   * ({@link MissionRowActionsMenu}) vit dans la cellule du titre — pas de geste retiré.
   * `mobile: 'hidden'` n'a plus d'objet : sous 768 px la carte entière ouvre.
   */
  // Droits (L15) : sans `finance:read` MESURÉ, la colonne Marge n'est pas
  // rendue du tout — `undefined` (appelant qui ne sait pas) garde l'ancien
  // rendu « hors périmètre » de `MissionMargin`.
  const rendered = useMemo(
    () =>
      columns.filter(key => key !== 'margin' || canReadFinance !== false).map(key => ({ key, ...definitions[key] })),
    [columns, definitions, canReadFinance],
  )

  return (
    <ResponsiveTable
      rows={missions}
      columns={rendered}
      rowKey={mission => mission.id}
      onRowClick={openOnRowClick ? onOpen : undefined}
      fixedLayout
      // #2979 — cible < 56 px par ligne : cellules à `py-1` (le bouton « Mission » garde ses 44 px, GA-35).
      dense
    />
  )
}

/**
 * LE MENU DES ACTIONS DE LIGNE — #2408.75, .76, .77, .78, .79, .80.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE QUI ÉTAIT EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour #2408 nomme six gestes attendus sur CETTE ligne : préparer le
 * renouvellement, demander le CRA, préparer la facture, vérifier le paiement,
 * repositionner le consultant, demander un feedback. Aucun n'était FAUX — les
 * six existent déjà, entiers : `RenewalDecisionPanel.tsx` porte les décisions
 * de renouvellement, le repositionnement (ligne 196) et la demande de
 * feedback ; `InvoiceReadinessPanel.tsx` porte `useMarkInvoiced` et
 * `useRecordPayment` ; `useRecordTimesheetReminder` porte la relance CRA sur
 * `/missions/cra`. Ce que cette table ne portait pas, c'est le CHEMIN entre
 * une ligne et ces six écrans — le motif habituel du dépôt : du code juste
 * que personne n'appelle depuis ICI.
 *
 * ⚠️ Ce menu ne RÉIMPLÉMENTE aucune des six actions : il y MÈNE. Une facture
 * ou une relance de CRA se décide pour un MOIS précis, que cette ligne ne
 * porte pas (elle liste des missions, pas des mois) — le geste réel reste sur
 * l'écran qui sait déjà de quel mois il parle. Réécrire ces mutations ici
 * aurait été une SECONDE vérité, divergente au premier changement de l'une
 * des deux (loi 4 du tome 7).
 *
 * ⚠️ Les liens ne sont volontairement PAS filtrés sur cette mission : ni
 * `/missions/$id` (dossier), ni `/missions/cra`, ni `/missions/facturation`
 * n'exposent aujourd'hui de paramètre de sélection. C'est le même choix,
 * déjà fait et déjà en production, que `MissionTrackingTable.RowMenu` (« voir
 * le CRA », « voir la facturation ») — ce fichier suit ce précédent plutôt que
 * d'inventer un second mécanisme de lien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA HUITIÈME ENTRÉE — #2408.74, « renseigner une donnée »
 * ─────────────────────────────────────────────────────────────────────────
 * Contrairement aux six précédentes, elle ne mène nulle part ailleurs : elle
 * ouvre la fiche de CETTE mission (`onOpen`, la même porte que #2408.73), où
 * `MissionDetailPanel.tsx` sait déjà compléter une date de fin absente
 * (#2194.32) ou un bon de commande manquant. Réimplémenter un second
 * formulaire ici aurait été la loi 4 du tome 7 une fois de plus.
 *
 * ⚠️ Rendue SEULEMENT si `no_end_date` ou `missing_po` est présent parmi les
 * risques déjà calculés (`missionRisks()`, mission.ts) : « on n'affiche pas
 * ce qu'on n'a pas » vaut aussi pour un geste — proposer de compléter une
 * fiche déjà complète serait un bouton qui ne fait rien.
 */
const FILLABLE_RISKS: ReadonlySet<NonNullable<MissionView['risks']>[number]> = new Set(['no_end_date', 'missing_po'])

function hasFillableData(mission: MissionView): boolean {
  return (mission.risks ?? []).some(risk => FILLABLE_RISKS.has(risk))
}

function MissionRowActionsMenu({ mission, onOpen }: { mission: MissionView; onOpen: (mission: MissionView) => void }) {
  const { t } = useTranslation('missions')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('table.rowActions', { label: mission.label })}
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('table.rowActions', { label: mission.label })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/missions/$id" params={{ id: mission.id }}>
            {t('table.actions.prepareRenewal')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/cra">{t('table.actions.requestCra')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/facturation">{t('table.actions.prepareInvoice')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/facturation">{t('table.actions.checkPayment')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/$id" params={{ id: mission.id }}>
            {t('table.actions.repositionConsultant')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/$id" params={{ id: mission.id }}>
            {t('table.actions.requestFeedback')}
          </Link>
        </DropdownMenuItem>
        {/* #2408.81 — revient sur #4194 : « Demander à Laura » par ligne, avec LA mission (même geste que
            MissionTrackingTable, #4345). */}
        <AskLauraMenuItem
          question={t('table.askLauraAboutMission', { mission: mission.label })}
          label={t('table.askLauraShort')}
        />
        {hasFillableData(mission) ? (
          <DropdownMenuItem onSelect={() => onOpen(mission)}>{t('table.actions.fillMissingData')}</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** #2408.33 — les deux rails, chacun écrit ; `undefined` (API antérieure) = non mesuré aussi. */
function MissionSatisfactionCell({ satisfaction }: { satisfaction: MissionView['satisfaction'] }) {
  const { t } = useTranslation('missions')
  const rails = (['client', 'consultant'] as const).filter(rail => satisfaction?.[rail] != null)
  if (rails.length === 0) return <UnknownValue reason={t('satisfaction.unmeasured')} />
  return (
    <span className="flex flex-col gap-0.5">
      {rails.map(rail => {
        const level = satisfaction?.[rail]
        if (!level) return null
        return (
          <Text
            key={rail}
            element="span"
            size="xs"
            color={level === 'low' ? 'text-[var(--warning-soft-text)]' : undefined}
          >
            {`${t(`satisfaction.${rail}`)} · ${t(`satisfaction.levels.${level}`)}`}
          </Text>
        )
      })}
    </span>
  )
}
