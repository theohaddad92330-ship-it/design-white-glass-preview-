import type { CatalogueKey } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { BusinessUnitAdminView } from '@/features/business-units/view/BusinessUnitAdminView'
import { CataloguesView } from '@/features/catalogues/view/CataloguesPage'
import { SkillAliasQueue } from '@/features/catalogues/view/SkillAliasQueue'
import { ExpensePolicyEditor } from '@/features/expenses/view/ExpensePolicyEditor'
import { LegalEntitiesView } from '@/features/legal-entities/view/LegalEntitiesView'
import { LexiconView } from '@/features/lexicon/view/LexiconPage'
import { QualificationGridSection } from '@/features/qualification-grid/view/QualificationGridSection'
import { DoNotContactView } from '@/features/team-guardrails/components/DoNotContactView'
import { SettingsScreenHeader } from '../components/SettingsScreenHeader'
import { SettingsTabs } from '../components/SettingsTabs'
import type { SpaceCatalogueTab, SpacePerimeterTab, SpaceRulesTab } from '../model/hub-tabs'
import { BetProfilesSection } from './BetProfilesSection'
import { BrandingView } from './BrandingView'
import { ChatEvalSamplingSection } from './ChatEvalSamplingSection'
import { CommercialLoadSettingsView } from './CommercialLoadSettingsView'
import { FinanceSettingsView } from './FinanceSettingsView'
import { PipelineSlaView } from './PipelineSlaView'
import { ReverseMarketSettingsView } from './ReverseMarketSettingsView'
import { WorkspaceGuardrailsCard } from './WorkspaceGuardrailsCard'
import { WorkspaceRulesView } from './WorkspaceRulesView'

/**
 * RÉGLAGES › MON ESPACE — les pages d'onglets de la maquette `settings-espace` (Théo V22, appliquée le 22/10/2026).
 *
 * Aucun réglage n'est recodé ici : chaque onglet MONTE la vue qui le porte déjà (GA-26 — un réglage, un seul
 * endroit). Ce fichier ne fait que regrouper (R2 Périmètres + Sociétés, R3 les cinq routes de Règles métier,
 * R4 Catalogues + Lexique) et ajouter les deux onglets que les maquettes amendées demandent (Frais, Qualité).
 */

const CLOSED_CATALOGUES = [
  'pipeline_stage_labels',
  'submission_outcome_reasons',
  'normalised_skills',
  'offers',
  'custom_fields',
] as const satisfies readonly CatalogueKey[]

// Théo D settings-espace.R2 — Périmètres (`/settings/business-units`) et Sociétés (`/settings/legal-entities`) : deux
// routes → une page à deux onglets. A7 : « Mes périmètres » (BU de la personne) reste sur le profil.
export function SpacePerimetersPage({
  tab,
  onTabChange,
}: {
  tab: SpacePerimeterTab
  onTabChange: (tab: SpacePerimeterTab) => void
}) {
  const { t } = useTranslation('settingsHub')
  return (
    <Box className="w-full">
      <Box className="mb-5">
        <SettingsScreenHeader scope="space" title={t('perimeters.title')} description={t('perimeters.description')} />
      </Box>
      <SettingsTabs
        label={t('perimeters.label')}
        value={tab}
        onValueChange={onTabChange}
        tabs={[
          { key: 'agences', label: t('perimeters.tabs.agences'), content: <BusinessUnitAdminView /> },
          { key: 'societes', label: t('perimeters.tabs.societes'), content: <LegalEntitiesView /> },
        ]}
      />
    </Box>
  )
}

// Théo D settings-espace.R3 — Règles métier : cinq routes séparées → une page à sept onglets (Accès · Pipeline · Charge ·
// Marché inversé · Frais · Marge · Qualité). Aucune feature perdue : seulement du regroupement. HT-5 : l'onglet Frais
// monte le barème de frais (venu de `/expenses/bareme`) ; HT-7 : la capacité de réponse vit dans l'onglet Marché inversé.
export function SpaceRulesPage({
  tab,
  onTabChange,
}: {
  tab: SpaceRulesTab
  onTabChange: (tab: SpaceRulesTab) => void
}) {
  const { t } = useTranslation('settingsHub')
  return (
    <Box className="w-full">
      <Box className="mb-5">
        <SettingsScreenHeader scope="space" title={t('rules.title')} description={t('rules.description')} />
      </Box>
      <SettingsTabs
        label={t('rules.label')}
        value={tab}
        onValueChange={onTabChange}
        tabs={[
          {
            key: 'acces',
            label: t('rules.tabs.acces'),
            content: (
              <Box className="space-y-8">
                <WorkspaceRulesView />
                {/* Théo D settings-espace.A1 — la liste « Ne pas contacter » est une règle d'accès : elle vit ici, en bloc (décision Louis 22/10). */}
                <DoNotContactView />
              </Box>
            ),
          },
          { key: 'pipeline', label: t('rules.tabs.pipeline'), content: <PipelineSlaView /> },
          { key: 'charge', label: t('rules.tabs.charge'), content: <CommercialLoadSettingsView /> },
          { key: 'marche-inverse', label: t('rules.tabs.marcheInverse'), content: <ReverseMarketSettingsView /> },
          { key: 'frais', label: t('rules.tabs.frais'), content: <ExpenseRulesPanel /> },
          { key: 'marge', label: t('rules.tabs.marge'), content: <FinanceSettingsView /> },
          {
            key: 'qualite',
            label: t('rules.tabs.qualite'),
            content: (
              <Box className="space-y-8">
                {/* Théo D settings-espace.A3 — grille de qualification, garde-fous non négociables, profils de pari,
                    échantillons de relecture : l'onglet Qualité les rassemble (rien ne disparaît). */}
                <QualificationGridSection />
                <WorkspaceGuardrailsCard />
                <BetProfilesSection />
                <ChatEvalSamplingSection />
              </Box>
            ),
          },
        ]}
      />
    </Box>
  )
}

function ExpenseRulesPanel() {
  const { t } = useTranslation('settingsHub')
  return (
    <Box className="space-y-2">
      <Text element="h2" size="lg" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {t('rules.expenses.title')}
      </Text>
      <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('rules.expenses.subtitle')}
      </Text>
      <ExpensePolicyEditor />
    </Box>
  )
}

// Théo D settings-espace.R4 — Catalogues (`CataloguesPage`) + Lexique (`LexiconPage`) → une page à quatre onglets.
// N3 : « Comptes écartés » (`account_park_reasons`) et « Non-staffabilité » (`need_unstaffable_reasons`) existaient déjà
// comme catalogues éditables — ici ils ont leur onglet. A8 : « mots à ne jamais lire » reste dans le lexique.
export function SpaceCataloguesPage({
  tab,
  onTabChange,
}: {
  tab: SpaceCatalogueTab
  onTabChange: (tab: SpaceCatalogueTab) => void
}) {
  const { t } = useTranslation('settingsHub')
  return (
    <Box className="w-full">
      <Box className="mb-5">
        <SettingsScreenHeader scope="space" title={t('catalogues.title')} description={t('catalogues.description')} />
      </Box>
      <SettingsTabs
        label={t('catalogues.label')}
        value={tab}
        onValueChange={onTabChange}
        tabs={[
          {
            key: 'motifs-perte',
            label: t('catalogues.tabs.motifsPerte'),
            content: <CataloguesView only={['loss_reasons']} />,
          },
          {
            key: 'comptes-ecartes',
            label: t('catalogues.tabs.comptesEcartes'),
            content: <CataloguesView only={['account_park_reasons']} />,
          },
          {
            key: 'non-staffabilite',
            label: t('catalogues.tabs.nonStaffabilite'),
            content: <CataloguesView only={['need_unstaffable_reasons']} />,
          },
          {
            key: 'vocabulaire',
            label: t('catalogues.tabs.vocabulaire'),
            content: (
              <Box className="space-y-8">
                <LexiconView />
                {/* Théo D settings-espace.N4 — « Compétences à rapprocher » : la file existait (`catalogues.aliases`), elle rejoint le vocabulaire. */}
                <SkillAliasQueue />
                {/* Rien ne se perd : les référentiels FERMÉS (étapes, motifs de fin de positionnement, compétences,
                    offres, champs) gardent leur lecture, repliée, ici. */}
                <CataloguesView only={CLOSED_CATALOGUES} />
              </Box>
            ),
          },
        ]}
      />
    </Box>
  )
}

// Théo D settings-espace.R5 — Marque recentrée sur les documents : nom affiché, signature proposée, pied de document,
// aperçu, logo, couleur, domaine. A4 : « Nom du copilote » retiré (Laura partout, D82).
export function SpaceBrandPage() {
  return (
    <Box className="w-full">
      <BrandingView />
    </Box>
  )
}
