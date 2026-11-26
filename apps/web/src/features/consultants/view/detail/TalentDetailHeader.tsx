import {
  Badge,
  Box,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { Briefcase, Check, ClipboardCheck, MessageSquare, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Consultant, TalentPipelineStatus, TalentRow } from '@bellum/contracts'
import { talentPipelineStatus } from '@bellum/contracts'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatDate } from '@/lib/locale'
import { readTalentName } from '../../lib/talentName'
import { talentPlaceLabel } from '../../lib/talentPlace'
import { SeniorityLabel } from '../SeniorityLabel'
import { TalentPhotoUpload } from '../TalentPhotoUpload'

/**
 * L'ENTÊTE D'UNE FICHE TALENT (maquette du Vivier, PDF-22 §01).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL PORTE, ET POURQUOI CHACUN
 * ─────────────────────────────────────────────────────────────────────────────
 * La fiche s'ouvrait sur un fil d'Ariane, deux boutons et un bloc de dix champs
 * à plat. Rien de ce que la maquette montre d'une PERSONNE — sa photo, sa
 * disponibilité, son tarif, ce qui manque à sa fiche — n'était visible avant
 * d'avoir cliqué dans un onglet.
 *
 *  - **la photo s'AFFICHE, elle n'ORDONNE jamais.** Critère protégé (annexe III
 *    de l'EU AI Act) : `TalentRow.photoUrl` n'est ni lu ni écrit par le moteur
 *    de sélection (`talent.service.ts`, GA-06) — il est fusionné à part, après
 *    coup, par `talent-photo.service.ts`. Ici elle décore une identité, elle
 *    n'entre dans aucun tri ni aucun score ;
 *  - **la disponibilité est DÉRIVÉE, avec sa provenance — et vit UNE fois.**
 *    Le composant `TalentAvailabilityBadge` sait montrer la contradiction entre
 *    le déclaré et le dérivé. Il est monté dans la ligne de disponibilité de
 *    l'onglet Profil (maquette Théo) et NULLE PART ICI (#4576 : la capture de
 *    Louis le montrait deux fois). L'en-tête garde le STATUT, qui en est le
 *    résumé d'un coup d'œil ;
 *  - **un montant absent le DIT, il ne vaut jamais zéro.** « Pas de prix » et
 *    « prix nul » mènent à deux décisions opposées. Le TJM cible n'est pas
 *    derrière `finance:read` dans ce domaine — le serveur le rend à tout le
 *    monde (`toWire`) ; ce qui l'est, le PLANCHER et le COÛT, est RETIRÉ de la
 *    réponse et vit dans l'onglet « Disponibilité & TJM », son seul endroit ;
 *  - **la complétude n'est plus ici** (#3829) : elle vit sur la ligne du vivier,
 *    décomposée en cinq axes (un score n'est jamais nu).
 *
 * ⚠️ **Un zéro de chargement ment.** Tant que la ligne de vivier n'est pas là,
 * l'entête ne rend ni disponibilité ni complétude : il dit qu'il LIT. Et si elle
 * n'arrive jamais, il dit qu'il n'a rien pu lire — jamais « à confirmer », qui
 * serait une conclusion, ni « 0/100 », qui serait une mesure. « Cassé » et
 * « non mesurable » ne se ressemblent pas.
 */
/** #2185.4 — le badge de statut, une variante par état ; jamais une seconde
 *  échelle de couleurs pour la même famille de faits que `staffing`. */
const STATUS_VARIANT: Record<TalentPipelineStatus, 'success' | 'info' | 'warning' | 'outline'> = {
  available: 'success',
  positioned: 'info',
  in_mission: 'warning',
  availability_to_verify: 'warning',
  incomplete: 'outline',
}

export function TalentDetailHeader({
  talent,
  row,
  rowIsLoading,
  talentName,
  hasCurrentMission,
  onViewMissions,
  onAddToNeed,
  onPrepareMessage,
  ownerCandidates,
  onSetOwner,
  settingOwner,
}: {
  talent: Consultant
  /** La ligne de VIVIER — dérivée. `undefined` tant qu'elle n'est pas lue. */
  row: TalentRow | undefined
  /**
   * `true` tant que la lecture court. UN seul drapeau et non deux : ce que
   * l'entête a besoin de distinguer, c'est « j'attends » de « je n'ai rien ».
   * Un `rowIsError` en plus n'aurait rien changé au rendu — il aurait été un
   * paramètre déclaré que personne ne lit, et le dépôt en a déjà payé plusieurs.
   */
  rowIsLoading: boolean
  talentName: string
  /** #4346 — une mission en cours ou à venir : sans elle, « Voir la mission » n'existe pas. */
  hasCurrentMission: boolean
  /** #2185.17 — mène à l'onglet qui porte les missions, jamais une seconde surface. */
  onViewMissions: () => void
  /** #2185.50 — ouvre la fenêtre qui pousse CETTE fiche vers un besoin
   *  choisi, jamais une seconde écriture de positionnement. */
  onAddToNeed: () => void
  /** #2185.51 — ouvre la fenêtre de brouillon, jamais un envoi : le copilote
   *  prépare, le commercial envoie. */
  onPrepareMessage: () => void
  /** #2185.10 — le vivier de l'espace, pour choisir un référent commercial.
   *  Même liste que `useWorkspaceMembers` (`AccountCollaborationBand`). */
  ownerCandidates: { userId: string; fullName: string | null; email: string | null }[]
  /** `null` retire l'attribution — « non attribué », pas un état à part. */
  onSetOwner: (ownerUserId: string | null) => void
  settingOwner: boolean
}) {
  const { t } = useTranslation('consultants')
  const displayed = readTalentName(talent.full_name)
  // #3935 — le MÊME libellé de lieu que l'onglet Profil (une seule source).
  const placeLabel = talentPlaceLabel({
    location: talent.contact_visible ? talent.location : null,
    zones: talent.zones,
  })
  // `undefined` tant que « Mes favoris » n'est pas là : une étoile éteinte
  // pendant le chargement dirait « pas en favori », ce qui est faux.

  // #3829 — le bloc « Complétude de la fiche » de l'entête est retiré (« suppprime »,
  // Louis 07/10/2026). Le calcul `talentCompleteness` n'a pas bougé : il reste sur la
  // ligne du vivier, le filtre et la tuile. #1780 (« une fiche en attente de relecture
  // n'a pas de complétude ») continue d'y être tenu.

  const status = row ? talentPipelineStatus(row) : null

  return (
    // Une RÉGION nommée par la personne : la fiche en compte plusieurs (entête,
    // puis l'onglet actif), et une région anonyme ne s'annonce pas.
    /**
     * ⚠️ `shrink-0` — MESURÉ EN PRODUCTION LE 09/09/2026, ET C'EST UNE CAUSE
     * GÉNÉRALE, PAS UN DÉTAIL DE CETTE CARTE.
     *
     * L'entête vit dans une colonne `flex` dont les parents portent tous
     * `min-h-0` (la coque de page, la zone défilante, le conteneur). Une carte
     * y est un enfant de flex à `flex: 0 1 auto` : elle a le droit de
     * RÉTRÉCIR. Et `Card` porte `overflow-hidden`, donc rien ne déborde pour
     * le signaler — ça se COUPE.
     *
     * Mesuré : hauteur rendue **32 px** pour un `scrollHeight` de **335 px**.
     * Le nom de la personne était coupé en deux par la barre d'onglets, et la
     * complétude entière avait disparu. `flexShrink = 0` posé à la main dans
     * la page l'a fait repasser à 335 px — la mesure a précédé le correctif.
     *
     * ⚠️ AUCUN TEST NE POUVAIT LE VOIR : jsdom ne met rien en page, donc les
     * 8 125 tests du web étaient verts. C'est la famille « MESURER le DOM en
     * recette, jamais lire les classes ».
     */
    <Card
      role="region"
      aria-label={talentName}
      data-talent-header=""
      className="shrink-0 border-0 bg-transparent p-0 shadow-none"
    >
      <Box display="flex" className="flex-wrap items-start justify-between gap-3">
        <Box display="flex" className="min-w-0 items-start gap-3">
          {/* #1780 — L'IDENTITÉ, UNE SEULE FOIS.
              L'avatar et le geste qui le change vivent ensemble : la fiche en
              montrait deux, à cent pixels d'écart, avec deux initiales
              différentes parce que chacun lisait sa propre source. */}
          <Box display="flex" className="shrink-0 flex-col items-center gap-1.5">
            <ContactAvatar
              name={displayed.kind === 'named' ? displayed.name : null}
              photoUrl={row?.photoUrl ?? null}
              size="lg"
            />
            <TalentPhotoUpload talentId={talent.id} name={talentName} photoUrl={row?.photoUrl ?? null} />
          </Box>
          <Box display="flex" className="min-w-0 flex-col gap-1.5">
            <Box display="flex" className="flex-wrap items-center gap-2">
              {/* Théo C talents-fiche — le nom est le titre de l'écran : UN h1, posé ici
                  (`titleInScreen` sur la page), jamais répété par l'en-tête de la coque. */}
              <Text
                size="3xl"
                weight="semibold"
                element="h1"
                className="min-w-0 truncate tracking-tight text-[var(--bellum-text-primary)]"
              >
                {talentName}
              </Text>
              <Badge variant={talent.kind === 'candidate' ? 'info' : 'outline'}>{t(`kind.${talent.kind}`)}</Badge>
              {talent.archived_at ? <Badge variant="warning">{t('detail.archive')}</Badge> : null}
            </Box>

            {/* Le métier, la séniorité, le cadre contractuel, le mode de
                mobilisation : la ligne qui dit qui est cette personne avant
                qu'on ouvre un onglet. #2185.9 — le cadre contractuel (CDI,
                freelance, portage…) rejoint la séniorité et l'engagement,
                SOUS LA MÊME FORME : la même ligne jointe, jamais un second
                badge pour la même sorte de fait (GA-26). Il est le seul, avec
                la séniorité, à ne jamais être vide — `contract_type` porte
                `inconnu` plutôt que `null`. */}
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {[
                talent.title,
                // #4016 L4.3 — séniorité déduite des années, badgée « estimé ».
                <SeniorityLabel
                  key="seniority"
                  seniority={talent.seniority}
                  yearsExperience={talent.years_experience}
                />,
                t(`contract.${talent.contract_type}`),
                t(`engagement.${talent.engagement_kind}`),
                // #4576.5 — maquette V22 : « métier · lieu » sur UNE ligne ; le lieu ne s'écrit plus à part.
                placeLabel,
              ]
                .filter(Boolean)
                .flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
            </Text>

            {/* #2185.6 / #2185.7 — la zone et la mobilité STRUCTURÉE, à côté
                du reste. Doctrine « on n'affiche pas ce qu'on n'a pas » : une
                zone ou une mobilité non renseignées ne posent AUCUN badge
                vide, elles disparaissent de la ligne plutôt que de mentir par
                un « non renseigné » de plus dans une entête déjà dense — le
                détail complet reste dans l'onglet Profil, sa forme habituelle
                pour « non renseigné » (`TalentProfileTab.tsx`). */}
            {talent.mobility?.remote || talent.mobility?.travel ? (
              <Box display="flex" className="flex-wrap items-center gap-2">
                {talent.mobility?.remote ? (
                  <Badge variant="outline">{t(`remote.${talent.mobility.remote}`)}</Badge>
                ) : null}
                {talent.mobility?.travel ? (
                  <Badge variant="outline">{t(`travel.${talent.mobility.travel}`)}</Badge>
                ) : null}
              </Box>
            ) : null}

            {/* #4576.5 / #4576.9 — LA LIGNE DE MÉTA de la maquette V22 (`bo11-record-meta`) : statut · suivi par · mise
                à jour, UNE ligne sous l'identité. Elle ne tombe plus sous les gestes : les gestes sont à droite. */}
            <Box display="flex" data-talent-meta="" className="flex-wrap items-center gap-x-3 gap-y-1">
              {/* #2185.4 — LE STATUT, distinct de la disponibilité DÉRIVÉE
                  (`TalentAvailabilityBadge`, dans l'onglet Profil) : celle-ci ne
                  porte qu'une affectation, celui-là combine complétude,
                  affectation ET positionnement en une SEULE conclusion. Rien
                  tant que la ligne de vivier n'est pas là — un statut de
                  chargement mentirait comme une complétude de chargement. */}
              {status ? <Badge variant={STATUS_VARIANT[status]}>{t(`detail.header.status.${status}`)}</Badge> : null}

              {/* #2185.11 — LA FRAÎCHEUR DE LA FICHE, TOUJOURS DATÉE.
                  `updated_at` existe sur toute fiche (jamais `null`) : contrairement
                  à la disponibilité ou au TJM, il n'y a pas d'état « on n'a pas
                  demandé » à distinguer d'une absence — la date s'affiche donc
                  purement et simplement, sans branche de repli. */}
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('detail.header.updatedAt', { date: formatDate(talent.updated_at) })}
              </Text>

              {/* #2185.10 — « SUIVI PAR » : le référent commercial de la fiche.
                  `owner_user_id`/`owner_name` viennent toujours résolus par le
                  serveur (jamais dérivés ici) ; `null` se DIT « non attribué »,
                  jamais une ligne vide. Même geste que le manager client d'une
                  mission (#2836) : une route à part, un sélecteur limité au vivier
                  de l'espace. */}
              <Box display="flex" className="items-center gap-2">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {talent.owner_name
                    ? t('detail.header.ownedBy', { name: talent.owner_name })
                    : t('detail.header.ownerUnassigned')}
                </Text>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={UserPlus}
                      className="shrink-0"
                      disabled={settingOwner}
                      aria-label={t('detail.header.ownerAssignTrigger')}
                    >
                      {t('detail.header.ownerAssign')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
                    <DropdownMenuLabel>{t('detail.header.ownerAssignMenuLabel')}</DropdownMenuLabel>
                    {ownerCandidates.length === 0 ? (
                      <DropdownMenuItem disabled>{t('detail.header.ownerNoMembers')}</DropdownMenuItem>
                    ) : (
                      ownerCandidates.map(member => (
                        <DropdownMenuItem key={member.userId} onSelect={() => onSetOwner(member.userId)}>
                          {member.fullName ?? member.email ?? t('detail.header.ownerMemberFallback')}
                          {talent.owner_user_id === member.userId && (
                            <Check className="ml-auto size-4 text-[var(--success-soft-text)]" />
                          )}
                        </DropdownMenuItem>
                      ))
                    )}
                    {talent.owner_user_id ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onSetOwner(null)}>
                          {t('detail.header.ownerRelease')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Box>
            </Box>

            <Box display="flex" className="flex-wrap items-center gap-2">
              {/* #4576 — le BLOC de disponibilité (déclarée, planning, provenance, source) vit UNE fois, dans la
                  ligne de disponibilité de l'onglet Profil (`talent-availability-line`, maquette Théo, gardée par
                  `TalentDetailPage.theo-layout.test.ts`). L'en-tête n'en garde que le STATUT (badge à côté du nom) et,
                  tant que la ligne de vivier n'est pas là, la phrase qui dit pourquoi il n'y a rien à montrer. */}
              {row ? null : rowIsLoading ? (
                // Un zéro de chargement ment : tant que la dérivation n'est
                // pas là, l'entête dit qu'il lit — il n'affiche rien d'autre.
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('detail.header.availabilityLoading')}
                </Text>
              ) : (
                // Ni en cours, ni arrivée : il n'y a rien, et le dire est la
                // seule réponse juste. Afficher le déclaratif seul, sans le
                // nommer, laisserait croire à une dérivation.
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('detail.header.availabilityUnavailable', {
                    value: t(`availability.${talent.availability}`),
                  })}
                </Text>
              )}

              {/* LE TARIF, ET RIEN QUE LUI.
                  Le TJM cible n'est PAS derrière `finance:read` — le serveur le
                  rend à tout le monde (`toWire`), et la ligne du vivier
                  l'affiche pareil. Ce qui est derrière ce droit, c'est le
                  PLANCHER et le COÛT, et ils sont RETIRÉS de la réponse, jamais
                  mis à zéro. Ils vivent dans l'onglet « Disponibilité & TJM »,
                  qui en est le seul endroit — les répéter ici ferait deux
                  lectures d'un même montant.
                  Absent, le TJM le DIT : « 0 € » se lirait comme un tarif nul,
                  ce qui mène à une tout autre décision commerciale. */}
              {talent.tjm != null ? (
                <Badge variant="outline">{t('detail.header.tjm', { tjm: talent.tjm })}</Badge>
              ) : (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('detail.header.tjmUnknown')}
                </Text>
              )}
            </Box>
          </Box>
        </Box>

        {/* #4346 — EXACTEMENT TROIS BOUTONS, dans l'ordre d'un recruteur d'ESN
            (Louis 19/10/2026 : « une fiche avec peu de gestes, chacun clair »).
            1. « Voir la mission » — seulement si une mission court ou vient :
               on n'affiche pas ce qu'on n'a pas ;
            2. « Ajouter à un besoin » — absorbe « Chercher les besoins » : la
               fenêtre propose d'abord les besoins qui matchent ;
            3. « Préparer un message » — proposer une mission, rédigé par Laura.
            Le reste (modifier, archiver, CV, « où placer », écrire) n'a pas
            disparu : menu « Autres gestes » de la page et bloc des coordonnées.
            Un quatrième bouton ici fait échouer `TalentDetail.test.tsx`. */}
        <Box
          display="flex"
          role="group"
          aria-label={t('detail.header.actionsAria')}
          className="flex-wrap items-center gap-1.5"
        >
          {hasCurrentMission ? (
            <Button variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={onViewMissions}>
              <Briefcase className="size-4" aria-hidden />
              {t('detail.header.viewMission')}
            </Button>
          ) : null}

          {/* #2185.50 — le MÊME geste que `ConsultantMatchPanel` (ligne du
              vivier) : choisir un besoin pousse CE profil, en `shortlisted`. */}
          <Button variant="violet" size="sm" className="min-h-11 gap-1.5" onClick={onAddToNeed}>
            <ClipboardCheck className="size-4" aria-hidden />
            {t('detail.header.addToNeed')}
          </Button>

          {/* #2185.51 — un BROUILLON rédigé par Laura, jamais un envoi. */}
          <Button variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={onPrepareMessage}>
            <MessageSquare className="size-4" aria-hidden />
            {t('detail.header.prepareMessage')}
          </Button>
        </Box>
      </Box>
    </Card>
  )
}
