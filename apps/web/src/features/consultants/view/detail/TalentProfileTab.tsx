import { Box, Button, Card, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { talentPlaceLabel } from '../../lib/talentPlace'
import { useTranslation } from 'react-i18next'
import { SeniorityLabel } from '../SeniorityLabel'
import {
  RAMP_UP_BANDS,
  TALENT_INTERVIEW_TRAITS,
  TALENT_TRAIT_LEVELS,
  formatExperienceDate,
  type Consultant,
  type ConsultantExperience,
  type RampUpBand,
  type TalentInterviewTraitKind,
  type TalentTraitLevel,
} from '@bellum/contracts'
import {
  useConfirmCvValidated,
  useConfirmTalentAvailability,
  useConfirmTjmValidated,
  useRecordInterviewTrait,
  useRecordRampUp,
} from '../../hooks'
import { useTalentExperiences } from '../../talent-api'
import { TalentEnrichAction } from './TalentEnrichAction'
import { CopyTalentLinkButton } from './CopyTalentLinkButton'
import { TalentFieldReportsSection } from './TalentFieldReportsSection'

/**
 * L'ONGLET « PROFIL » — QUATRE GROUPES, ET NON DIX CHAMPS À PLAT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une seule carte, une seule `<dl>`, dix lignes en deux colonnes : séniorité,
 * cadre contractuel, mode d'engagement, zones, secteurs, langues, habilitations,
 * e-mail, téléphone, envie. Rien ne dit ce qui va avec quoi, si bien que
 * « téléphone » se lisait entre « habilitations » et « envie du consultant ».
 *
 * Les quatre groupes répondent chacun à une question qu'on se pose vraiment :
 *
 *  1. **Identité et contact** — qui est cette personne, comment je la joins ;
 *  2. **Engagement et tarif** — comment je la mobilise et à quel prix ;
 *  3. **Couverture et langues** — où et pour qui elle peut travailler ;
 *  4. **Habilitations et envie** — ce qui bloque un positionnement, et ce
 *     qu'elle veut (un profil poussé contre son envie démissionne).
 *
 * Deux règles tenues champ par champ :
 *
 *  - **« Non renseigné » est JUSTE.** Jamais un tiret muet, qui se lit comme un
 *    défaut d'affichage, jamais une valeur inventée ;
 *  - **« pas ton périmètre » n'est pas « pas renseigné »** : les coordonnées
 *    retirées faute de droit le DISENT, avec leurs propres mots.
 */
export function TalentProfileTab({ talent }: { talent: Consultant }) {
  // #3935.2b — les expériences connues (lues dans le CV ou saisies), jamais devinées.
  const { data: experiences } = useTalentExperiences(talent.id)
  // KEVIN-FIX K.2 — les compétences DÉCLARÉES à la saisie (la liste libre de la fiche, lue découpée et sans doublon).
  const declaredSkills = (talent.stack ?? []).filter(skill => skill.trim().length > 0)
  const { t } = useTranslation('consultants')

  const languages =
    (talent.languages ?? []).map(item => (item.level ? `${item.code} · ${item.level}` : item.code)).join(' · ') || null

  return (
    <Box display="flex" className="flex-col gap-3">
      {/* #2185.52 — « Partager » : la route profonde de la fiche existait déjà
          (`/consultants/$id`), mais aucun geste ne la donnait. */}
      <Box display="flex" className="justify-end">
        <CopyTalentLinkButton talentId={talent.id} />
      </Box>

      <Group title={t('detail.profile.identity')}>
        {/* #4405.2 (GA-26) — l'intitulé, l'e-mail et le téléphone s'éditent dans les
            groupes inline « Identité et engagement » / « Coordonnées » : ils ne se
            disent pas une seconde fois ici. Seul l'état « retiré » reste dit. */}
        {/* #4016 L4.3 — séniorité déduite des années quand elle est inconnue, badgée « estimé ». */}
        <Row
          label={t('form.seniority')}
          value={<SeniorityLabel seniority={talent.seniority} yearsExperience={talent.years_experience} />}
        />
        {/* #2195.12 — le manager s'affiche SEULEMENT quand il est renseigné
            (décision de Louis du 16/09/2026), là où les autres lignes disent
            « non renseigné ». La différence est voulue : ce champ est neuf et
            vide sur toutes les fiches déjà en base, et une ligne « non
            renseigné » de plus sur chaque fiche de l'espace se lirait comme un
            reproche plutôt que comme une information.
            ⚠️ Jamais un nom DEVINÉ à la place : ni le `lead` de la BU, ni le
            propriétaire commercial — ce sont d'autres faits. */}
        {talent.manager_name ? <Row label={t('form.manager')} value={talent.manager_name} /> : null}
        {/* Retiré et non vide : « pas renseigné » et « pas ton périmètre » sont
            deux informations différentes. */}
        {talent.contact_visible ? null : (
          <>
            <Row label={t('form.email')} value={t('detail.hiddenByPolicy')} />
            <Row label={t('form.phone')} value={t('detail.hiddenByPolicy')} />
          </>
        )}
        {/* #2183.21 (épopée #2784) — la ville lue dans le CV (`consultants.location`),
            jamais une ville nue devinée depuis un mot quelconque. Même règle de
            visibilité que l'e-mail et le téléphone (`visibility.contacts`). */}
        <Row
          label={t('form.location')}
          // #3935 — la MÊME source que l'en-tête (`talentPlaceLabel`) : ville du CV + zones déclarées.
          // Les zones ne sont pas une coordonnée : elles restent lues même quand la ville est retirée.
          value={
            talentPlaceLabel({ location: talent.contact_visible ? talent.location : null, zones: talent.zones }) ??
            (talent.contact_visible ? null : t('detail.hiddenByPolicy'))
          }
        />
        {/* Profil public DÉCLARÉ par la personne — jamais scrapé. */}
        <Row
          label={t('form.publicProfile')}
          value={talent.contact_visible ? (talent.public_profile_url ?? null) : t('detail.hiddenByPolicy')}
        />
        <Row label={t('consent.source')} value={talent.source ? t(`sources.${talent.source}`) : null} />
        {/* #2570 — même enrichissement qu'un contact, à la demande : coordonnées
            et poste actuel, avec leur source et leur date. */}
        <TalentEnrichAction talent={talent} />
      </Group>

      <Group title={t('detail.profile.engagement')}>
        <Row label={t('form.contract')} value={t(`contract.${talent.contract_type}`)} />
        <Row label={t('form.engagement')} value={t(`engagement.${talent.engagement_kind}`)} />
        {/* Le TJM cible, absent quand il l'est — jamais « 0 € », qui se lirait
            comme un tarif nul. Le PLANCHER et le COÛT, eux, sont derrière
            `finance:read` et RETIRÉS de la réponse : ils vivent dans l'onglet
            « Disponibilité & TJM », leur seul endroit. */}
        <Row label={t('form.tjm')} value={talent.tjm != null ? t('detail.header.tjm', { tjm: talent.tjm }) : null} />
        {!talent.finance_visible ? <Row label={t('form.minTjm')} value={t('detail.financeHidden')} /> : null}
        {/* #4576 (GA-26) — la disponibilité DÉCLARÉE et la date « disponible à partir de » ne se redisent pas
            ici : le bloc complet est la ligne de disponibilité du haut de l'onglet, et leur correction vit dans
            la section « Disponibilité » (champs modifiables). Reste le geste de confirmation, ci-dessous. */}
        {/* #2185.48 — « Valider disponibilité » : revalider une disponibilité
            qui reste JUSTE n'avait aucun chemin — modifier via l'édition
            générale ne revalide la fraîcheur QUE quand la valeur change. */}
        <TalentConfirmAvailabilityAction talentId={talent.id} />
      </Group>

      <Group title={t('detail.profile.coverage')}>
        <Row label={t('form.zones')} value={(talent.zones ?? []).join(' · ') || null} />
        {/* Les secteurs sont une PREUVE (déjà pratiqués), pas une préférence. */}
        <Row label={t('form.sectors')} value={(talent.sectors ?? []).join(' · ') || null} />
        {/* Saisies dans le formulaire, elles ne se relisaient nulle part : on
            écrivait une langue sans jamais pouvoir vérifier ce qu'on avait
            écrit. Et deux axes du matching en dépendent. */}
        <Row label={t('form.languages')} value={languages} />
        {/* La mobilité STRUCTURÉE : `null` = on n'a pas demandé, ce qui n'est
            NI « sur site » NI « refuse de se déplacer ». */}
        <Row label={t('form.remote')} value={talent.mobility?.remote ? t(`remote.${talent.mobility.remote}`) : null} />
        <Row label={t('form.travel')} value={talent.mobility?.travel ? t(`travel.${talent.mobility.travel}`) : null} />
        {/* #2185.31 — LA MOBILITÉ GÉOGRAPHIQUE (déménagement).
            `false` EST une réponse (« a dit non »), distincte de `null`
            (« on n'a pas demandé ») : la confondre ferait écarter quelqu'un
            sur une question qu'on ne lui a jamais posée. */}
        <Row
          label={t('form.relocation')}
          value={
            talent.mobility?.relocation === true
              ? t('form.relocationYes')
              : talent.mobility?.relocation === false
                ? t('form.relocationNo')
                : null
          }
        />
        {/* #2948 (#2329.19/.22/.23) — mobilité FINE : fréquence sur site,
            international, restriction nommée. Même doctrine que le reste du
            groupe : `null` DIT « non renseigné », jamais un tiret muet. */}
        <Row
          label={t('form.siteFrequency')}
          value={talent.mobility?.siteFrequency ? t(`siteFrequency.${talent.mobility.siteFrequency}`) : null}
        />
        <Row
          label={t('form.internationalMobility')}
          value={
            talent.mobility?.international === true
              ? t('form.internationalYes')
              : talent.mobility?.international === false
                ? t('form.internationalNo')
                : null
          }
        />
        <Row label={t('form.mobilityRestrictions')} value={talent.mobility?.restrictions ?? null} />
      </Group>

      {/* #2948 (#2329.30-.34) — PROCESSUS : démarches en cours, exclusivité,
          autres entretiens, deadline de décision. L'owner N'Y FIGURE PAS :
          `owner_name` est déjà affiché en entête (GA-26, un réglage vit à un
          seul endroit). */}
      <Group title={t('detail.profile.process')}>
        <Row
          label={t('form.processInProgress')}
          value={
            talent.process?.inProgress === true
              ? t('form.processInProgressYes')
              : talent.process?.inProgress === false
                ? t('form.processInProgressNo')
                : null
          }
        />
        <Row
          label={t('form.processExclusive')}
          value={
            talent.process?.exclusive === true
              ? t('form.processExclusiveYes')
              : talent.process?.exclusive === false
                ? t('form.processExclusiveNo')
                : null
          }
        />
        <Row label={t('form.processOtherInterviews')} value={talent.process?.otherInterviews ?? null} />
        <Row label={t('form.processDecisionDeadline')} value={talent.process?.decisionDeadline ?? null} />
      </Group>

      {/* #2948 (#2329.45-.51) — L'ACCORD À 7 CONDITIONS avant présentation.
          Disponibilité confirmée et compte autorisé vivent AILLEURS sur la
          fiche (entête, onglet Conformité) — pas dupliqués ici (GA-26).
          « Mission comprise » et « intérêt réel » (#2329.46/.48) n'ont
          volontairement PAS de ligne : ce sont des faits PAR OPPORTUNITÉ, pas
          des faits globaux sur la personne (voir la migration dédiée). */}
      <Group title={t('detail.profile.positioningAgreement')}>
        <Row
          label={t('form.otherProcessesKnown')}
          value={
            talent.positioningAgreement?.otherProcessesKnown
              ? t('form.otherProcessesKnownYes')
              : t('form.otherProcessesKnownNo')
          }
        />
        <TalentConfirmTjmValidatedAction
          talentId={talent.id}
          validatedAt={talent.positioningAgreement?.tjmValidatedAt ?? null}
        />
        <TalentConfirmCvValidatedAction
          talentId={talent.id}
          validatedAt={talent.positioningAgreement?.cvValidatedAt ?? null}
        />
      </Group>

      {/* #2185.30 / #2185.31 — CE QUE LA PERSONNE VEUT, ET CE QUI LA BLOQUE.
          §8.3 : ces préférences filtrent le matching EN AVERTISSEMENT, jamais
          en exclusion — un profil qui refuse le secteur bancaire reste
          proposable, avec un drapeau, sur une mission bancaire. Les champs
          existaient sur `Consultant.preferences` (saisis par le formulaire
          d'édition pour les secteurs/technologies refusés) sans qu'aucun
          onglet ne les relise. */}
      <Group title={t('detail.profile.preferences')}>
        <Row label={t('form.wantedSectors')} value={(talent.preferences?.wantedSectors ?? []).join(' · ') || null} />
        <Row label={t('form.refusedSectors')} value={(talent.preferences?.refusedSectors ?? []).join(' · ') || null} />
        <Row
          label={t('form.refusedTechnologies')}
          value={(talent.preferences?.refusedTechnologies ?? []).join(' · ') || null}
        />
        <Row
          label={t('form.wantedContractKinds')}
          value={(talent.preferences?.wantedContractKinds ?? []).join(' · ') || null}
        />
        {/* #3410.10/.11/.13/.14 — retour bêta #3410 : « une préférence
            négative est aussi importante qu'une compétence positive ». */}
        <Row
          label={t('form.preferredClientTypes')}
          value={(talent.preferences?.preferredClientTypes ?? []).join(' · ') || null}
        />
        <Row label={t('form.refusedClients')} value={(talent.preferences?.refusedClients ?? []).join(' · ') || null} />
        <Row
          label={t('form.environmentsToAvoid')}
          value={(talent.preferences?.environmentsToAvoid ?? []).join(' · ') || null}
        />
        <Row label={t('form.nonNegotiableConditions')} value={talent.preferences?.nonNegotiableConditions ?? null} />
      </Group>

      <Group title={t('detail.profile.clearances')}>
        {/* Une habilitation manquante BLOQUE un positionnement : elle n'est pas
            négociable par un commercial. */}
        <Row label={t('form.clearances')} value={(talent.clearances ?? []).join(' · ') || null} />
        <Row label={t('form.references')} value={(talent.references ?? []).join(' · ') || null} />
        <Row label={t('form.wants')} value={talent.wants} />
      </Group>

      {/*
       * #2185.27 / #2185.28 — EXPÉRIENCES ET FORMATIONS, NOMMÉES, jamais
       * inventées (tranché sans Louis, brief nuit du 26/09/2026 — reprend et
       * assume le renversement du refus antérieur, documenté jusqu'ici dans
       * `TalentDetailPage.tsx`).
       *
       * `education` a rejoint `location` côté persistance le 27/09/2026
       * (#2183.26/#2784, `consultants.education`) : le même bloc CV alimente
       * désormais une colonne réelle, plus seulement l'écran de revue
       * d'import. `experiences` s'écrit depuis le 09/10/2026 dans SA table
       * (`consultant_experiences`, #3935.2b — lecture du CV arbitrée par champ,
       * ou saisie à la main) : la ligne les lit, au lieu de rester vide.
       *
       * #2185.37 (compétences : expériences sources) reste bloqué par la
       * MÊME absence côté `experiences` : `consultant_skills` n'a aucune
       * relation vers une expérience, qui elle-même n'existe pas — voir
       * `axes.ts` et `TalentDetailPage.tsx`, onglet Compétences.
       */}
      <Group title={t('detail.profile.experienceEducation')}>
        {/* KEVIN-FIX K.2 — une rubrique absente ne s'affiche pas : `Row` (SIMON-FIX S.4) ne fait aucune ligne pour une absence. */}
        <Row label={t('form.experiences')} value={experiencesValue(experiences)} />
        <Row label={t('form.education')} value={(talent.education ?? []).join(' · ') || null} />
        {/* #3935.2a — environnements, outils, certifications lus dans le CV. `null`
            = NON LU (aucune lecture ne les a produits) et le dit, distinct de
            « non renseigné » : l'absence d'un bloc dans un CV ne prouve rien. */}
        {/* KEVIN-FIX K.2 — jamais lu dans un CV MAIS déclaré à la saisie : « déclaré » se dit. */}
        <Row
          label={t('detail.profile.environments')}
          value={
            talent.environments == null && declaredSkills.length > 0
              ? t('detail.profile.declaredSkills', { list: declaredSkills.join(' · ') })
              : readFromCvValue(talent.environments, t)
          }
        />
        <Row label={t('detail.profile.tools')} value={readFromCvValue(talent.tools, t)} />
        <Row label={t('detail.profile.certifications')} value={readFromCvValue(talent.certifications, t)} />
      </Group>

      {/* BEL-SC-238 (#3267) — ce que l'ENTRETIEN a appris, jamais un CV : la
          communication et l'autonomie observées, le temps avant efficacité
          annoncé. Un trait absent DIT « non évalué » — jamais un niveau
          deviné à sa place (doctrine « jamais de donnée fictive »). */}
      <Group title={t('detail.profile.interviewAssessment')}>
        {TALENT_INTERVIEW_TRAITS.map(trait => (
          <InterviewTraitRow
            key={trait}
            talentId={talent.id}
            trait={trait}
            current={talent.interviewAssessment?.traits.find(entry => entry.trait === trait)?.level ?? null}
          />
        ))}
        <RampUpRow talentId={talent.id} current={talent.interviewAssessment?.rampUp?.band ?? null} />
      </Group>

      {/* #3406 — informations TERRAIN capitalisées, remontées par ce
          consultant, avec consentement et sans le mettre en difficulté. */}
      <TalentFieldReportsSection talentId={talent.id} reports={talent.fieldReports ?? []} />
    </Box>
  )
}

/** BEL-SC-238 (#3267) — un trait, son niveau actuel (ou « non évalué »), et
 *  trois gestes pour l'enregistrer. Jamais de sélecteur générique : trois
 *  crans nommés se posent en un clic, pas en ouvrant un formulaire. */
function InterviewTraitRow({
  talentId,
  trait,
  current,
}: {
  talentId: string
  trait: TalentInterviewTraitKind
  current: TalentTraitLevel | null
}) {
  const { t } = useTranslation('consultants')
  const record = useRecordInterviewTrait()

  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-2 sm:col-span-2">
      <div>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t(`detail.profile.interviewTrait.${trait}`)}
        </Text>
        {/* SIMON-FIX S.4 — pas encore évalué : les boutons suffisent, aucune ligne « Non renseigné ». */}
        {current ? <Text size="sm">{t(`detail.profile.traitLevel.${current}`)}</Text> : null}
      </div>
      <Box display="flex" className="flex-wrap gap-1">
        {TALENT_TRAIT_LEVELS.map(level => (
          <Button
            key={level}
            size="sm"
            variant={current === level ? 'secondary' : 'ghost'}
            disabled={record.isPending}
            onClick={() => record.mutate({ id: talentId, input: { trait, level, note: null } })}
          >
            {t(`detail.profile.traitLevel.${level}`)}
          </Button>
        ))}
      </Box>
    </Box>
  )
}

/** BEL-SC-238 (#3267) — le temps avant efficacité ANNONCÉ, même patron que
 *  {@link InterviewTraitRow}. */
function RampUpRow({ talentId, current }: { talentId: string; current: RampUpBand | null }) {
  const { t } = useTranslation('consultants')
  const record = useRecordRampUp()

  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-2 sm:col-span-2">
      <div>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('detail.profile.rampUp')}
        </Text>
        {current ? <Text size="sm">{t(`detail.profile.rampUpBand.${current}`)}</Text> : null}
      </div>
      <Box display="flex" className="flex-wrap gap-1">
        {RAMP_UP_BANDS.map(band => (
          <Button
            key={band}
            size="sm"
            variant={current === band ? 'secondary' : 'ghost'}
            disabled={record.isPending}
            onClick={() => record.mutate({ id: talentId, input: { band, note: null } })}
          >
            {t(`detail.profile.rampUpBand.${band}`)}
          </Button>
        ))}
      </Box>
    </Box>
  )
}

/**
 * #2185.48 — le geste qui revalide la disponibilité DÉCLARÉE sans en changer
 * la valeur. `sm:col-span-2` : c'est une ACTION, pas un champ, elle ne partage
 * pas la grille à deux colonnes des `Row` voisines.
 */
function TalentConfirmAvailabilityAction({ talentId }: { talentId: string }) {
  const { t } = useTranslation('consultants')
  const confirm = useConfirmTalentAvailability()

  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-2 sm:col-span-2">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {confirm.isSuccess ? t('detail.profile.availabilityConfirmed') : t('detail.profile.availabilityConfirmHint')}
      </Text>
      <Button size="sm" variant="outline" disabled={confirm.isPending} onClick={() => confirm.mutate(talentId)}>
        {confirm.isPending ? t('detail.profile.availabilityConfirmWorking') : t('detail.profile.availabilityConfirm')}
      </Button>
      {/* #2208.69 — sans le droit d'écrire, le refus se DIT (la raison du serveur),
          jamais un clic muet. L'en-tête qui portait ce geste le disait par toast. */}
      {confirm.isError ? (
        <Text size="xs" role="alert" className="w-full text-[var(--danger-soft-text)]">
          {confirm.error?.message || t('toast.error')}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * #2948 (#2329.47) — « TJM validé », un axe de l'accord à 7 conditions. Même
 * patron que `TalentConfirmAvailabilityAction` : un geste explicite, jamais
 * déduit.
 */
function TalentConfirmTjmValidatedAction({ talentId, validatedAt }: { talentId: string; validatedAt: string | null }) {
  const { t } = useTranslation('consultants')
  const confirm = useConfirmTjmValidated()
  const confirmed = confirm.isSuccess || validatedAt !== null

  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-2 sm:col-span-2">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {confirmed ? t('detail.profile.tjmValidated') : t('detail.profile.tjmValidateHint')}
      </Text>
      <Button size="sm" variant="outline" disabled={confirm.isPending} onClick={() => confirm.mutate(talentId)}>
        {confirm.isPending ? t('detail.profile.tjmValidateWorking') : t('detail.profile.tjmValidate')}
      </Button>
    </Box>
  )
}

/** #2948 (#2329.51) — « CV validé ou règles d'usage acceptées ». */
function TalentConfirmCvValidatedAction({ talentId, validatedAt }: { talentId: string; validatedAt: string | null }) {
  const { t } = useTranslation('consultants')
  const confirm = useConfirmCvValidated()
  const confirmed = confirm.isSuccess || validatedAt !== null

  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-2 sm:col-span-2">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {confirmed ? t('detail.profile.cvValidated') : t('detail.profile.cvValidateHint')}
      </Text>
      <Button size="sm" variant="outline" disabled={confirm.isPending} onClick={() => confirm.mutate(talentId)}>
        {confirm.isPending ? t('detail.profile.cvValidateWorking') : t('detail.profile.cvValidate')}
      </Button>
    </Box>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // SIMON-FIX S.4 — un groupe dont aucune ligne n'a de valeur ne s'affiche pas.
    <Card className="p-4 has-[dl:empty]:hidden">
      {/* #1417.7 — même anchor de hiérarchie que les cartes de la référence de
          densité (Dossier de compte, Vue d'ensemble) : `WhyNowSection` etc.
          titrent leur section en `size="base"` (16px), jamais en `sm`
          (14px). La fiche talent mesurait 68 nœuds de texte pour UN SEUL
          ≥16px (le nom, en entête) le 10/09/2026 — ces quatre titres de
          groupe sont les candidats légitimes : ce sont de vraies sections,
          pas des légendes de champ. Toujours l'échelle Tailwind (D80). */}
      <Text size="base" weight="semibold" element="h3">
        {title}
      </Text>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">{children}</dl>
    </Card>
  )
}

/** #3935.2b — « rôle — entreprise (AAAA-MM → AAAA-MM) » ; une partie absente est
 *  omise, jamais remplacée. #3935 (lot P03, décision Louis 09/10) — chaque date
 *  s'affiche à SA précision : « 2019 » pour une année seule, jamais un mois
 *  inventé ; le jour n'est qu'une convention de stockage (`formatExperienceDate`). */
function experiencesValue(
  items:
    | readonly (Pick<ConsultantExperience, 'role' | 'entreprise' | 'dateDebut' | 'dateFin'> &
        Partial<Pick<ConsultantExperience, 'dateDebutPrecision' | 'dateFinPrecision'>>)[]
    | undefined,
): string | null {
  const lines = (items ?? []).map(item => {
    const head = [item.role, item.entreprise].filter(Boolean).join(' — ')
    const from = formatExperienceDate(item.dateDebut, item.dateDebutPrecision ?? null)
    const to = formatExperienceDate(item.dateFin, item.dateFinPrecision ?? null)
    const period = from || to ? ` (${from ?? '…'} → ${to ?? '…'})` : ''
    return `${head}${period}`
  })
  return lines.filter(Boolean).join(' · ') || null
}

/** #3935.2a — `null`/absent = jamais lu dans un CV ; une liste vide = non renseigné. */
function readFromCvValue(values: string[] | null | undefined, t: (key: string) => string): string | null {
  if (values == null) return t('detail.profile.notReadFromCv')
  return values.join(' · ') || null
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  // SIMON-FIX S.4 — une rubrique absente ne fait AUCUNE ligne (doctrine 20/09
  // « on n'affiche pas ce qu'on n'a pas », étendue le 17/10 par c113) : la
  // recette de Simon (20/10) comptait ~40 « Non renseigné » sur une fiche
  // vide. Jamais « 0 » non plus : une absence disparaît, elle ne se chiffre
  // pas. « Masqué par le réglage » reste une VALEUR (pas ton périmètre).
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex min-w-0 flex-col">
      <dt>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {label}
        </Text>
      </dt>
      {/* Une valeur absente le DIT, plutôt que de laisser un blanc qui se lit
          comme un défaut d'affichage — et jamais « 0 ». */}
      <dd>
        <Text size="sm" className="break-words">
          {value}
        </Text>
      </dd>
    </div>
  )
}
