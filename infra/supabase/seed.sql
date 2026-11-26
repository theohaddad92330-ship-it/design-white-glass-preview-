-- ============================================================
-- BellumAI — Seed data for local development
-- This file is NOT applied in production.
-- Test user UUID: 00000000-0000-0000-0000-000000000001
-- ============================================================

DO $$
DECLARE
  test_user_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

-- Profile (identity). The handle_new_user trigger usually seeds this row,
-- but the test user is inserted directly into auth.users for fixture purposes
-- so we mirror it here.
INSERT INTO profiles (user_id, email, first_name, last_name)
VALUES (test_user_id, 'matteo@bellum.ai', 'Matteo', 'Dev')
ON CONFLICT (user_id) DO NOTHING;

-- Onboarding state — mark the fixture user as fully onboarded so the UI
-- skips the wizard and lands on /dashboard.
INSERT INTO user_onboarding_state (user_id, current_stage_id, status)
SELECT test_user_id, id, 'completed' FROM onboarding_stage_definitions WHERE code = 'completed'
ON CONFLICT (user_id) DO NOTHING;

-- Current ESN profile snapshot for the fixture user.
INSERT INTO esn_profiles (
  user_id, version, is_current,
  esn_name, consultant_size,
  expertise_areas, target_sectors, decision_maker_personas,
  geo_zones, sales_team_size, avg_sales_cycle, main_sales_pain
) VALUES (
  test_user_id, 1, TRUE,
  'BellumAI', '5-20',
  ARRAY['Cloud', 'Data', 'DevOps'],
  ARRAY['Banque', 'Industrie'],
  ARRAY['DSI', 'CTO'],
  ARRAY['Île-de-France'],
  '3', '3-6 mois', 'Trouver des contacts qualifiés'
)
ON CONFLICT DO NOTHING;

-- Subscription (Pro plan)
INSERT INTO subscriptions (user_id, plan, accounts_limit, accounts_used, enrichment_credits)
VALUES (test_user_id, 'pro', 30, 3, 50)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- SNCF
-- ============================================================

INSERT INTO accounts (id, user_id, company_name, sector, employees, revenue, headquarters, website, status, priority_score, priority_justification, raw_analysis)
VALUES (
  '10000000-0000-0000-0000-000000000001', test_user_id, 'SNCF', 'Transport', '270000', '41.4 milliards EUR', 'Saint-Denis', 'https://www.sncf.com', 'completed', 8.5,
  'Grand compte avec de forts enjeux IT et transformation digitale',
  '{"businessDescription": "Groupe ferroviaire français", "sector": "Transport", "technologyStack": ["SAP", "Salesforce", "Azure", "AWS", "ServiceNow"]}'::JSONB
);

INSERT INTO contacts (account_id, user_id, full_name, title, entity, decision_role, priority, email, email_verified, why_contact, user_status, source) VALUES
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Jean-Pierre Martin', 'DSI Groupe', 'SNCF SA', 'sponsor', 1, 'jp.martin@sncf.fr', TRUE, 'Décideur principal IT', 'new', 'apollo'),
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Sophie Durand', 'Directrice Innovation', 'SNCF Voyageurs', 'champion', 2, 'sophie.durand@sncf.fr', TRUE, 'Pilote la transformation digitale', 'contacted', 'apollo'),
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Marc Leroy', 'Responsable Achats IT', 'SNCF Réseau', 'purchasing', 3, 'marc.leroy@sncf.fr', FALSE, 'Gère les budgets IT', 'new', 'ai_generated'),
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Claire Petit', 'CTO', 'SNCF Connect', 'champion', 4, 'claire.petit@sncf.fr', TRUE, 'Responsable technique plateforme digitale', 'new', 'apollo'),
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Thomas Bernard', 'Chef de projet Cloud', 'SNCF SA', 'operational', 5, NULL, FALSE, 'Opérationnel migration Cloud', 'new', 'ai_generated');

INSERT INTO attack_angles (account_id, user_id, title, description, entry_point, is_recommended, rank) VALUES
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Migration Cloud Azure/AWS', 'SNCF en pleine migration cloud hybride', 'Sophie Durand - Innovation', TRUE, 1),
  ('10000000-0000-0000-0000-000000000001', test_user_id, 'Modernisation SI legacy', 'Remplacement mainframe par architectures modernes', 'Jean-Pierre Martin - DSI', FALSE, 2);

INSERT INTO action_plans (account_id, user_id, strategy_type, strategy_justification, weeks)
VALUES ('10000000-0000-0000-0000-000000000001', test_user_id, 'multi-entry', 'Plusieurs entités décisionnaires',
  '[{"week": 1, "actions": ["Connexion LinkedIn Sophie Durand", "Message Cloud"]}, {"week": 2, "actions": ["Relance Sophie", "Connexion Jean-Pierre Martin"]}]'::JSONB);

-- ============================================================
-- AXA
-- ============================================================

INSERT INTO accounts (id, user_id, company_name, sector, employees, revenue, headquarters, website, status, priority_score, raw_analysis)
VALUES (
  '10000000-0000-0000-0000-000000000002', test_user_id, 'AXA', 'Assurance', '145000', '102.7 milliards EUR', 'Paris', 'https://www.axa.com', 'completed', 7.8,
  '{"businessDescription": "Leader mondial assurance et gestion actifs", "sector": "Assurance", "technologyStack": ["AWS", "Guidewire", "Salesforce", "Python", "Kubernetes"]}'::JSONB
);

INSERT INTO contacts (account_id, user_id, full_name, title, entity, decision_role, priority, email, email_verified, why_contact, user_status, source) VALUES
  ('10000000-0000-0000-0000-000000000002', test_user_id, 'Pierre Moreau', 'DSI France', 'AXA France', 'sponsor', 1, 'pierre.moreau@axa.fr', TRUE, 'Décideur IT AXA France', 'new', 'apollo'),
  ('10000000-0000-0000-0000-000000000002', test_user_id, 'Marie Lambert', 'Head of Data', 'AXA Group', 'champion', 2, 'marie.lambert@axa.com', TRUE, 'Stratégie data groupe', 'new', 'apollo'),
  ('10000000-0000-0000-0000-000000000002', test_user_id, 'Nicolas Roux', 'Responsable DevOps', 'AXA Tech', 'operational', 3, 'nicolas.roux@axa.com', FALSE, 'Pipelines CI/CD', 'new', 'ai_generated'),
  ('10000000-0000-0000-0000-000000000002', test_user_id, 'Isabelle Chen', 'Directrice Achats', 'AXA France', 'purchasing', 4, 'isabelle.chen@axa.fr', TRUE, 'Contrats prestation IT', 'new', 'apollo');

INSERT INTO action_plans (account_id, user_id, strategy_type, strategy_justification, weeks)
VALUES ('10000000-0000-0000-0000-000000000002', test_user_id, 'top-down', 'Approche via le DSI puis descente opérationnels',
  '[{"week": 1, "actions": ["InMail Pierre Moreau", "Recherche actualités AXA Tech"]}, {"week": 2, "actions": ["Connexion Marie Lambert", "Article Data/IA assurance"]}]'::JSONB);

-- ============================================================
-- TotalEnergies
-- ============================================================

INSERT INTO accounts (id, user_id, company_name, sector, employees, revenue, headquarters, website, status, priority_score, raw_analysis)
VALUES (
  '10000000-0000-0000-0000-000000000003', test_user_id, 'TotalEnergies', 'Énergie', '101000', '218.9 milliards EUR', 'Courbevoie', 'https://www.totalenergies.com', 'completed', 9.1,
  '{"businessDescription": "Major énergétique mondial en transition renouvelables", "sector": "Énergie", "technologyStack": ["Azure", "SAP S/4HANA", "Databricks", "Python", "Terraform"]}'::JSONB
);

INSERT INTO contacts (account_id, user_id, full_name, title, entity, decision_role, priority, email, email_verified, why_contact, user_status, source) VALUES
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'François Dubois', 'VP IT & Digital', 'TotalEnergies SE', 'sponsor', 1, 'francois.dubois@totalenergies.com', TRUE, 'VP transformation digitale', 'new', 'apollo'),
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'Amina Benali', 'Head of Cloud', 'TotalEnergies Digital Factory', 'champion', 2, 'amina.benali@totalenergies.com', TRUE, 'Stratégie Cloud Azure', 'contacted', 'apollo'),
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'David Rousseau', 'Engineering Manager', 'TotalEnergies OneTech', 'operational', 3, 'david.rousseau@totalenergies.com', FALSE, 'Manage équipes dev', 'new', 'ai_generated'),
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'Léa Nguyen', 'Data Engineer Lead', 'TotalEnergies Digital Factory', 'operational', 4, NULL, FALSE, 'Pipelines data Databricks', 'new', 'ai_generated'),
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'Alexandre Petit', 'Directeur Achats IT', 'TotalEnergies SE', 'purchasing', 5, 'alexandre.petit@totalenergies.com', TRUE, 'Budget IT et contrats ESN', 'new', 'apollo');

INSERT INTO attack_angles (account_id, user_id, title, description, entry_point, is_recommended, rank) VALUES
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'Migration SAP S/4HANA', 'Programme majeur de migration SAP', 'François Dubois - VP IT', TRUE, 1),
  ('10000000-0000-0000-0000-000000000003', test_user_id, 'Data Platform Databricks', 'Construction plateforme data unifiée', 'Amina Benali - Head of Cloud', TRUE, 2);

INSERT INTO action_plans (account_id, user_id, strategy_type, strategy_justification, weeks)
VALUES ('10000000-0000-0000-0000-000000000003', test_user_id, 'multi-entry', 'Deux angles forts : SAP et Data en parallèle',
  '[{"week": 1, "actions": ["InMail François Dubois - angle SAP", "Connexion Amina Benali"]}, {"week": 2, "actions": ["Relance François", "Message Amina - use case Cloud énergie"]}]'::JSONB);

END $$;
