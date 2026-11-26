# Intégration — vieilles issues, vague 1 (01/11/2026)

Branche `integration/vieilles-vague1-01-11`. Fusion de cinq branches déjà poussées :
`claude/vieilles-l1-briefing-moteur`, `l3-agenda-brief`, `l4-pipe-ao`, `l5-cibles-apercu`, `l9-besoin-matching`.

Lots : #2095 #2107 #2102 #2097 #2152 #2170 #2157 #2176 #2178

Périmètre : apps/api/src/modules/action-router/**, apps/api/src/modules/briefing/**, apps/api/src/modules/consultants/**, apps/api/src/modules/crm-core/**, apps/api/src/modules/demo/**, apps/api/src/modules/target-lists/**, apps/web/src/features/agenda/**, apps/web/src/features/briefing/**, apps/web/src/features/consultants/**, apps/web/src/features/contacts/**, apps/web/src/features/matching/**, apps/web/src/features/projects/**, apps/web/src/features/rfp/**, apps/web/src/features/settings/**, apps/web/src/features/target-lists/**, apps/web/src/i18n/locales/**, packages/contracts/src/schemas/**, changes/**, docs/briefs/\*\*

Arbitrage Louis 01/11 : `sales_ops` garde le réglage des durées cibles par étape (`team:manage`), sur la route `PUT /pipeline/stage-sla/:stage` et sur l'écran `/settings/pipeline` de l'action-router.
