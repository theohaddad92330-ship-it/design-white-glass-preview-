import {
  NEED_THEO_STATUSES,
  needConversionRate,
  needStatusTag,
  needTheoStatus,
  type NeedTheoStatus,
  type OpenNeedRow,
} from '@bellum/contracts'
import { Box, Button, Checkbox, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useFinanceAccess } from '@/features/propagation/api'
// ⚠️ Le formateur de taux vit dans le pilotage, et il est IMPORTÉ, pas recopié :
// « 0 % » est une affirmation, « < 1 % » en est une autre, et la règle qui les
// sépare (GA-108) s'est déjà payée une fois en production sur un taux de 0,48 %
// affiché « 0 % ». Une seconde copie ici divergerait au premier correctif.
import { formatRate } from '@/features/pilotage/view/chain-reading'
import { NeedSourceLink } from './NeedSourceLink'
import { needCardFoot } from '../model/need-card-foot'
import { needsEligibleFor, type ActionableNeed } from '../model/need-actions'

/**
 * Ce que le rail a besoin de lire sur un besoin.
 *
 * `ActionableNeed` (id, statut, compétences) ne suffit plus : la carte « sans
 * porteur » a besoin de savoir qui porte. On l'ÉTEND plutôt que d'exiger une
 * `OpenNeedRow` entière — c'est la raison écrite dans `need-actions.ts` : un
 * appelant qui n'a pas la ligne complète (un test, un futur écran mobile) doit
 * pouvoir monter ce composant.
 */
type RailNeed = ActionableNeed & Pick<OpenNeedRow, 'owner_id'>

/**
 * Le kanban des BESOINS (BEL-BSN-004, I-36).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seul kanban du produit est celui des PROJETS. Les besoins — l'objet du
 * recruteur — n'avaient qu'une liste : on y voyait tout, jamais où le stock
 * s'accumule. Or c'est la question du matin : « qu'est-ce qui est bloqué en
 * qualification depuis trois semaines ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MONTANT QU'ON AFFICHE, ET CELUI QU'ON REFUSE — ET CE QUI EST DERRIÈRE UN DROIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le ticket dit « avec ses montants ». Le montant d'un besoin ne se CALCULE pas :
 * multiplier TJM × postes × durée produirait un chiffre qui n'existera jamais —
 * il varierait selon qu'on compte vingt ou vingt-et-un jours par mois, et
 * quelqu'un finirait par le mettre dans un prévisionnel.
 *
 * On montre donc ce qui est SAISI : le TJM cible et le nombre de postes, par
 * jour. « 2 postes à 650 €/j » est un montant, et il est vrai. La colonne
 * annonce le cumul journalier de ce qu'elle contient, et **compte à part** les
 * besoins sans TJM — le total est alors un plancher, et il le dit.
 *
 * ⚠️ **REVIREMENT du 31/08/2026 (Louis), doctrine `c53_montant_du_pipe` —
 * `packages/contracts/src/schemas/doctrine-registry.ts`.** Jusqu'à ce jour, le
 * CUMUL par colonne s'affichait sans aucune garde de droit, et c'était une
 * décision explicite (commit `d38fcc154`) : « le montant du pipe n'est pas sous
 * droit financier ». Louis a tranché l'INVERSE, en connaissance de cette
 * raison : le cumul AGRÉGÉ (colonne, et le total « CA potentiel » du bandeau de
 * `OpenNeedsPage`) passe désormais DERRIÈRE le droit financier
 * (`useFinanceAccess`, `GET /propagation/finance`). Sans ce droit, le nombre
 * est RETIRÉ — jamais mis à 0, qui se lirait comme une vraie mesure de pipe
 * vide.
 *
 * Ce revirement est SCOPÉ au cumul : le TJM affiché sur CHAQUE carte
 * individuelle (« 2 postes à 650 €/j ») reste PUBLIC — c'est la même famille de
 * montant que le tarif cible d'un consultant (`c54_tarif_cible`), un prix de
 * vente espéré qu'un recruteur doit voir pour négocier, pas la marge.
 *
 * Le kanban ne DÉPLACE rien : c'est une lecture. Changer l'état d'un besoin est
 * une décision qui se prend dans sa fiche, avec son motif — la route existe
 * (`PATCH /projects/needs/:id/status`) et exige une raison sur les états qui en
 * demandent une. Un glisser-déposer qui court-circuiterait ce motif rendrait
 * les onze états illisibles en trois semaines.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ANATOMIE DE LA CARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source décrit huit éléments (PDF-03:157-167). Livrés : le lieu, le mode
 * d'engagement, les compétences, le PIED qui change selon la colonne (voir
 * `needCardFoot`), le LOGO du compte, et la case de SÉLECTION
 * (04-kanban-besoins.png : les gestes de masse existaient déjà en vue liste,
 * `need-actions.ts`, et rien ne les rendait disponibles ici).
 *
 * ⚠️ LE LOGO — corrigé le 31/08/2026. La carte affichait l'initiale pour TOUS
 * les comptes, et le commentaire d'alors disait vrai sur les faits (« la ligne
 * ne porte aucune URL de logo ») mais tirait la mauvaise conclusion : la ligne
 * ne la portait pas parce que personne ne l'avait demandée au serveur.
 * `accounts.logo_url` existe — c'est le logo RÉEL, persisté, servi par notre
 * propre origine (`GET /logo`). `OpenNeedsService` le sélectionne désormais, et
 * la carte le rend quand il est là.
 *
 * ⚠️ Et SEULEMENT lui : `CompanyAvatar` sait aussi partir du SITE du compte pour
 * afficher le favicon réellement servi par le domaine, et cette seconde piste
 * n'est PAS empruntée ici. Un favicon déduit d'un domaine est une image
 * DEVINÉE ; trente cartes côte à côte portant trente favicons approximatifs se
 * lisent comme trente identités visuelles vérifiées. Sans logo persisté, la
 * carte retombe sur l'INITIALE — la même réponse que partout ailleurs dans le
 * produit quand aucun logo n'est connu.
 *
 * Refusé, et pour une raison qui se vérifie : **le kebab d'actions.** La
 * NAVIGATION de la carte (ouvrir la fiche) reste un `<button>` — un second
 * bouton à l'intérieur ne serait ni du HTML valide ni annonçable. La case à
 * cocher, elle, est un `<input>` posé EN DEHORS de ce bouton, dans le même
 * conteneur : les deux widgets restent indépendants et tabulables (GA-35).
 */
/** Trois compétences sur une carte : au-delà, la ligne défile et plus personne
 *  ne lit la première. Le reste se COMPTE, il ne se tronque pas en silence. */
const MAX_CARD_SKILLS = 3

export function NeedsKanban({
  rows,
  onOpen,
  selectedIds = [],
  onToggle,
}: {
  rows: OpenNeedRow[]
  onOpen: (needId: string) => void
  /** Les besoins cochés — vit dans `OpenNeedsPage`, comme en vue liste : deux
   *  états de sélection (un par vue) divergeraient au premier changement de vue. */
  selectedIds?: readonly string[]
  /** Absent = pas de case à cocher (usage en lecture seule, ex. un test qui ne
   *  teste que l'affichage). */
  onToggle?: (needId: string) => void
}) {
  const { t } = useTranslation('projects')
  const now = new Date()
  // Le droit financier — voir l'entête du fichier. `denied` couvre le refus
  // SERVEUR (403, aucun droit financier). #4016.8e (Louis 11/10, c53 renversée) :
  // le cumul s'ouvre au commercial (`finance:read:own`) — `canReadPipeAmounts`
  // couvre le droit PARTIEL comme le COMPLET ; la marge d'équipe
  // (`canReadFinance`) reste hors de ce droit.
  const { canReadPipeAmounts } = useFinanceAccess()
  const selected = new Set(selectedIds)

  // Théo C projects-besoins.R3 — trois colonnes (À qualifier · Ouvert · Couvert).
  const byStatus = new Map<NeedTheoStatus, OpenNeedRow[]>()
  for (const status of NEED_THEO_STATUSES) byStatus.set(status, [])
  for (const row of rows) {
    // Un besoin dont l'état n'est pas dans les OUVERTS (clos, perdu…) n'a pas
    // de colonne ici : l'écran s'appelle « besoins ouverts ». Le ranger de
    // force dans la première colonne serait un mensonge d'affichage.
    // #4343 — une étape candidat/affaire stockée se replie sur la dernière
    // colonne du besoin ; ses candidats se lisent sur sa fiche.
    // Perdu / annulé : `needTheoStatus` rend `closed`, aucune colonne.
    const shown = needTheoStatus(row.status)
    if (shown !== 'closed') byStatus.get(shown)?.push(row)
  }
  // #5025 — « À qualifier » : la plus ancienne non regardée d'abord ; date inconnue en dernier (jamais « récente »).
  byStatus.get('to_qualify')?.sort((a, b) => {
    const ta = a.status_changed_at === null ? Infinity : Date.parse(a.status_changed_at)
    const tb = b.status_changed_at === null ? Infinity : Date.parse(b.status_changed_at)
    return ta === tb ? 0 : ta < tb ? -1 : 1
  })

  return (
    <Box className="flex gap-3 overflow-x-auto pb-2">
      {NEED_THEO_STATUSES.map(status => {
        const column = byStatus.get(status) ?? []
        // Le filtre garantit déjà que le TJM est là : le `?? 0` qu'on écrirait
        // ici serait mort, et GA-19 le compterait comme une valeur repliée sur
        // zéro — la garde a raison, un zéro de TJM se lirait « gratuit ».
        const withRate = column.flatMap(row =>
          row.target_tjm_cents === null ? [] : [{ row, rate: row.target_tjm_cents }],
        )
        const dailyCents = withRate.reduce((sum, entry) => sum + entry.rate * entry.row.headcount, 0)
        const withoutRate = column.length - withRate.length
        return (
          <Box
            key={status}
            data-testid="need-column"
            data-status={status}
            className="min-w-[220px] flex-1 rounded-md border border-[var(--bellum-border)] p-2"
          >
            <Box display="flex" className="items-center justify-between gap-2">
              <Text size="xs" weight="semibold">
                {t(`needTheoStatus.${status}`)}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {column.length}
              </Text>
            </Box>
            {/* #5025 — ce que la colonne contient, dit en une phrase (elle seule en a besoin). */}
            {status === 'to_qualify' ? (
              <Text size="xs" data-testid="need-column-hint" className="mt-0.5 block text-[var(--bellum-text-muted)]">
                {t('needsKanban.toQualifyHint')}
              </Text>
            ) : null}
            {/* Le cumul JOURNALIER de ce que la colonne contient. Jamais une
                projection : « ce que ça rapporterait sur six mois » est un
                chiffre inventé.

                ⚠️ Derrière le droit financier depuis le 31/08/2026 (revirement
                de Louis, `c53_montant_du_pipe`, rouvert au commercial le 11/10 : #4016.8e) : SANS `canReadPipeAmounts`, le
                bloc entier est RETIRÉ — pas un texte de remplacement, pas un
                0, rien. Un commercial sans droit financier voit toujours le
                NOMBRE de besoins (juste au-dessus) et le pied de carte ; il ne
                voit plus le cumul en euros. */}
            {canReadPipeAmounts ? (
              <>
                <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
                  {withRate.length > 0
                    ? t('needsKanban.daily', { amount: formatCents(dailyCents) })
                    : t('needsKanban.noRate')}
                </Text>
                {withoutRate > 0 ? (
                  <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                    {t('needsKanban.withoutRate', { count: withoutRate })}
                  </Text>
                ) : null}
              </>
            ) : null}
            <Box className="mt-2 flex flex-col gap-1.5">
              {column.map(row => {
                // Le lieu et le mode d'engagement, sur une ligne. Un lieu que
                // personne n'a dit ne s'invente pas : le mode reste seul, et le
                // séparateur disparaît avec lui.
                const contract = t(`openNeeds.contract.${row.contract_kind}`)
                const where = row.location ? t('needsKanban.where', { location: row.location, contract }) : contract
                const skills = row.skills.slice(0, MAX_CARD_SKILLS).map(skill => skill.term)
                const extraSkills = Math.max(0, row.skills.length - MAX_CARD_SKILLS)
                // LE PIED CONTEXTUEL. La dérivation vit dans le modèle, à un
                // seul endroit : deux chemins qui la referaient divergeraient.
                const foot = needCardFoot(row, now)
                const tag = needStatusTag(row.status)
                return (
                  <Box
                    key={row.id}
                    className="rounded border border-[var(--bellum-border)] p-2"
                    data-testid="need-card"
                  >
                    {onToggle ? (
                      // La case de sélection est un widget INDÉPENDANT du
                      // bouton d'ouverture ci-dessous — imbriquer un `<input>`
                      // dans un `<button>` n'est ni valide ni annonçable.
                      <Box display="flex" className="mb-1 items-center justify-between gap-2">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => onToggle(row.id)}
                          aria-label={t('openNeeds.selection.toggleOne', { role: row.title })}
                        />
                        {/* Le logo RÉEL s'il existe, l'initiale sinon — et
                            jamais le favicon deviné d'un domaine (voir l'entête
                            du fichier). Le `website` n'est délibérément PAS
                            passé, et le serveur ne le sélectionne même pas. */}
                        <CompanyAvatar
                          name={row.account_name ?? row.title}
                          logoUrl={row.account_logo_url ?? null}
                          size="sm"
                        />
                      </Box>
                    ) : null}
                    <button type="button" onClick={() => onOpen(row.id)} className="w-full text-left">
                      <Text element="span" size="xs" weight="medium" className="block truncate">
                        {row.title}
                      </Text>
                      <Text element="span" size="xs" className="block truncate text-[var(--bellum-text-muted)]">
                        {row.account_name ?? t('needsKanban.noAccount')}
                      </Text>
                      <Text element="span" size="xs" className="block truncate text-[var(--bellum-text-muted)]">
                        {where}
                      </Text>
                      {skills.length > 0 && (
                        <Text
                          element="span"
                          size="xs"
                          className="block truncate text-[var(--bellum-text-secondary)]"
                          title={row.skills.map(skill => skill.term).join(' · ')}
                        >
                          {skills.join(' · ')}
                          {extraSkills > 0 ? ` ${t('openNeeds.moreSkills', { count: extraSkills })}` : ''}
                        </Text>
                      )}
                      <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                        {row.target_tjm_cents === null
                          ? t('needsKanban.rateUnknown')
                          : t('needsKanban.seats', {
                              count: row.headcount,
                              amount: formatCents(row.target_tjm_cents),
                            })}
                      </Text>
                      {tag ? (
                        // Théo C projects-besoins.R3 — l'état précis, en étiquette.
                        <Text
                          element="span"
                          size="xs"
                          className="mt-0.5 block truncate text-[var(--bellum-text-secondary)]"
                          data-testid="need-tag"
                        >
                          {t(`needStatus.${tag}`)}
                        </Text>
                      ) : null}
                      {foot && (
                        // Le pied est SÉPARÉ du corps : c'est la ligne qui change
                        // d'une colonne à l'autre, et l'œil doit pouvoir la
                        // trouver au même endroit sur chaque carte. Aucune
                        // couleur d'alerte — voir l'entête du fichier.
                        <Text
                          element="span"
                          size="xs"
                          className="mt-1 block truncate border-t border-[var(--bellum-border)] pt-1 text-[var(--bellum-text-muted)]"
                        >
                          {foot.count === null ? t(foot.key) : t(foot.key, { count: foot.count })}
                        </Text>
                      )}
                    </button>
                    {/* Théo C projects-besoins — la source visible sur la carte, HORS du bouton
                        (un lien dans un bouton n'est ni valide ni annonçable). */}
                    <NeedSourceLink url={row.source_url} />
                  </Box>
                )
              })}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * LE RAIL « LAURA PEUT TRAITER CES BESOINS » (04-kanban-besoins.png).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE RAIL EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette montre quatre cartes de suggestion PRÉ-CALCULÉES (« 3 missions
 * n'ont pas eu de réponse depuis 5 jours », « 2 missions en négociation prêtes
 * pour un devis »). Ce ne sont pas des besoins : ce sont des MISSIONS, un
 * domaine que ce lot ne touche pas (`apps/web/src/features/missions/**` est
 * hors périmètre). Reconstruire ces chiffres ici serait soit une fausse
 * lecture d'un autre domaine, soit un chiffre inventé — les deux interdits.
 *
 * Ce rail NOMME donc les gestes RÉELS que la sélection de besoins ouvre déjà
 * (`NEED_BULK_ACTIONS`, `need-actions.ts`), avec un compte RÉEL de besoins
 * éligibles sur la page chargée, et un bouton qui les présélectionne — la barre
 * de sélection (`NeedsSelectionBar`, montée par `OpenNeedsPage` dès qu'une
 * sélection existe) fait le reste, dans la vue kanban comme en liste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CARTES DE LA MAQUETTE, ET CE QUE LE RAIL PORTE VRAIMENT (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **« Matching suggéré »** → le geste `match`. Tel quel.
 *  2. **« Relancer un client »** → le geste `reactivate` : reprendre un besoin
 *     arrêté est ce que la sélection sait faire ; « relancer » au sens de la
 *     maquette porte sur des MISSIONS, un autre domaine.
 *  3. **« Préparer un devis » → REMPLACÉE par « Besoins sans porteur »
 *     (`assign_owner`).** Aucun geste du catalogue ne prépare un devis, et le
 *     produit n'a pas d'objet « devis » à préparer : un bouton qui n'aboutit à
 *     rien est pire qu'une carte absente. À sa place, le geste que
 *     `need-actions.ts` décrit lui-même comme « le geste du matin, celui qui
 *     fait sortir un besoin de la pile commune » — attribuer un porteur.
 *     Sa population est RÉELLE et lisible sur la page chargée : les besoins
 *     dont `owner_id` est `null`.
 *  4. **« Fiches à mettre à jour » → écartée, et le rail ÉCRIT pourquoi.** Le
 *     compteur `needs_without_skills` est DÉJÀ affiché sur cet écran, dans la
 *     rangée au-dessus (`HygieneBadge`), dans les DEUX vues. Le répéter ici
 *     violerait la loi 4 du tome 7 — « rien n'apparaît deux fois sous la même
 *     forme avec le même contenu ». Un écart entre une maquette et l'écran doit
 *     se LIRE à l'écran : sans la phrase, le prochain lecteur croit à un oubli
 *     et la recode.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TAUX DE CONVERSION — mesuré depuis le 31/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Il valait « non mesuré », pour une raison juste : l'écran ne charge que des
 * besoins OUVERTS, donc ni les gagnés ni les perdus ni les annulés n'y
 * arrivaient. Louis a tranché — le serveur COMPTE les issues sur le même filtre
 * (`counters.outcomes`) et le rail divise. `needConversionRate` (contrats) rend
 * `null` quand rien n'a été tranché : un espace neuf n'a pas « 0 % », il n'a pas
 * de taux, et les deux appellent des gestes opposés.
 */
export function NeedsLauraRail({
  rows,
  outcomes,
  onSelect,
  onOpenAllActions,
}: {
  rows: readonly RailNeed[]
  /** Les issues comptées par le SERVEUR — le dénominateur du taux. `undefined`
   *  = la réponse ne les portait pas (API antérieure au lot). */
  outcomes?: { won: number; lost: number; cancelled: number }
  /** Présélectionne les besoins éligibles à CE geste, et laisse la barre de
   *  sélection déjà montée porter la suite. */
  onSelect: (needIds: readonly string[]) => void
  onOpenAllActions: () => void
}) {
  const { t } = useTranslation('projects')
  // ⚠️ Le formateur de taux vit dans le pilotage et il n'est PAS recopié ici :
  // « < 1 % » et « 0 % » sont deux phrases distinctes, et la règle qui les
  // sépare (GA-108) a déjà été payée une fois sur un écran de production.
  const { t: tRate } = useTranslation('pilotage')

  const matchEligible = needsEligibleFor(rows, 'match')
  const reactivateEligible = needsEligibleFor(rows, 'reactivate')
  // Les besoins que personne ne porte. `needsEligibleFor` reste consulté :
  // écrire un compte que le geste refuserait ensuite ferait cliquer sur une
  // sélection dont la moitié reviendrait en 400.
  const unownedEligible = needsEligibleFor(
    rows.filter(need => need.owner_id === null),
    'assign_owner',
  )
  const rate = needConversionRate(outcomes)

  return (
    <Box className="w-full shrink-0 space-y-3 rounded-md border border-[var(--bellum-border)] p-3 lg:w-72">
      <Text size="sm" weight="semibold">
        {t('needsKanban.rail.title')}
      </Text>

      <RailTile
        title={t('needsKanban.rail.match.title')}
        description={t('needsKanban.rail.match.description', { count: matchEligible.length })}
        action={t('needsKanban.rail.match.action')}
        disabled={matchEligible.length === 0}
        onClick={() => onSelect(matchEligible.map(need => need.id))}
      />

      <RailTile
        title={t('needsKanban.rail.reactivate.title')}
        description={t('needsKanban.rail.reactivate.description', { count: reactivateEligible.length })}
        action={t('needsKanban.rail.reactivate.action')}
        disabled={reactivateEligible.length === 0}
        onClick={() => onSelect(reactivateEligible.map(need => need.id))}
      />

      {/* LA TROISIÈME CARTE — à la place de « Préparer un devis », qui n'a
          aucune capacité derrière. Voir l'entête du composant. */}
      <RailTile
        title={t('needsKanban.rail.assignOwner.title')}
        description={t('needsKanban.rail.assignOwner.description', { count: unownedEligible.length })}
        action={t('needsKanban.rail.assignOwner.action')}
        disabled={unownedEligible.length === 0}
        onClick={() => onSelect(unownedEligible.map(need => need.id))}
      />

      <Button size="sm" variant="ghost" className="w-full justify-start" onClick={onOpenAllActions}>
        {t('needsKanban.rail.viewAll', { count: rows.length })}
      </Button>

      {/* LA QUATRIÈME CARTE DE LA MAQUETTE, ET POURQUOI ELLE N'EST PAS LÀ.
          Écrit à l'écran et pas seulement en commentaire : un écart entre la
          maquette et le produit qui ne se lit nulle part se relit comme un
          oubli, et le prochain lecteur le « corrige ». */}
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('needsKanban.rail.hygieneElsewhere')}
      </Text>

      {/* LA PERFORMANCE DE PIPELINE — mesurée depuis le 31/08/2026. Le serveur
          compte les issues (gagnés / perdus / annulés) sur le MÊME filtre que la
          liste ; la division vit dans le contrat (`needConversionRate`, bâtie
          sur `measuredRate`), jamais ici.

          ⚠️ `null` = rien n'a encore été tranché. « 0 % » dirait « on ne gagne
          jamais », ce qui est une affirmation ; l'absence dit « il n'y a pas
          encore de quoi mesurer ». Les deux appellent des gestes opposés. */}
      <Box className="border-t border-[var(--bellum-border)] pt-2">
        <Text size="xs" weight="medium">
          {t('needsKanban.rail.conversion.title')}
        </Text>
        {/* ⚠️ `outcomes &&` est dans la condition alors que `rate` en dépend
            déjà : c'est ce qui permet de lire `outcomes.won` sans repli. Un
            `outcomes?.won ?? 0` écrirait « 0 gagnés » sur une réponse qui n'a
            rien dit — le zéro qui ment, à l'endroit exact où l'on explique un
            taux. */}
        {outcomes && rate !== null ? (
          <>
            <Text size="sm" weight="semibold" className="mt-0.5 block">
              {formatRate(rate, tRate)}
            </Text>
            {/* Sur COMBIEN il est calculé — un taux nu laisse croire à une
                mesure complète (tome 7, partie A, loi 2, élément n°6). */}
            <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
              {t('needsKanban.rail.conversion.basis', {
                won: outcomes.won,
                count: outcomes.won + outcomes.lost + outcomes.cancelled,
              })}
            </Text>
          </>
        ) : (
          <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
            {t('needsKanban.rail.conversion.unknown')}
          </Text>
        )}
      </Box>
    </Box>
  )
}

function RailTile({
  title,
  description,
  action,
  disabled,
  onClick,
}: {
  title: string
  description: string
  action: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Box className="rounded border border-[var(--bellum-border)] p-2">
      <Text size="xs" weight="medium">
        {title}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {description}
      </Text>
      <Button size="sm" variant="outline" className="mt-1.5" disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </Box>
  )
}
