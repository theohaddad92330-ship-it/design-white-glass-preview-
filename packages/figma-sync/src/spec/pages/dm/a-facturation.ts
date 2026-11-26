import type { PageSpec } from '../../types'

/**
 * `/facturation` — écran consolidé à quatre sous-vues (`?view=usage|offres|
 * manuel|calendrier`), les quatre empilées ici sous leur titre : Coûts &
 * usage (défaut), Offres (ce que chaque offre rapporte + éditeur de
 * catalogue), Sur facture (clients provisionnés à la main, facturés hors
 * Stripe), Calendrier (douze mois de facturation par ESN). `?view=fournisseurs`
 * redirige vers `/couts` (#1661).
 *
 * Lu dans : `src/app/facturation/page.tsx` → `_components/usage-panel.tsx`,
 * `offers-panel.tsx` + `offers-economics.tsx` + `plans-editor.tsx`,
 * `manual-clients-panel.tsx` + `invoice-ledger.tsx` + `billing-health-badge.tsx`,
 * `billing-calendar-panel.tsx` + `billing-reminder-panel.tsx`.
 */
export const facturationPage: PageSpec = {
  id: 'dm/facturation',
  surface: 'dm',
  domain: 'clients',
  route: 'apps/dashboard-manager/src/app/facturation/page.tsx',
  title: 'Facturation',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Facturation', style: 'title' },
      {
        type: 'text',
        text: 'Backoffice — coûts & usage (cross-tenant), catalogue des offres, clients facturés sur facture et leur calendrier de facturation sur douze mois.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'underline', items: ['Coûts & usage', 'Offres', 'Sur facture', 'Calendrier'] },
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Coût total (plancher — 3 non mesurées)' } },
            children: [{ type: 'text', text: '842,10 $', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Coût 30 derniers jours' } },
            children: [{ type: 'text', text: '96,40 $', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Analyses' } },
            children: [{ type: 'text', text: '1 204', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Coût moyen / analyse' } },
            children: [{ type: 'text', text: '0,6990 $', style: 'display' }],
          },
        ],
      },
      { type: 'text', text: 'Top users par coût', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Email', 'Nom', 'Analyses', 'Coût total', '30 j', 'Coût moyen', 'Non mesurées'],
            rows: [
              ['j••••@wavestone-consulting.fr', 'Julie Ferrand', '186', '128,40 $', '18,60 $', '0,6903 $', '0'],
              ['l••••@synaltic-group.fr', 'Léo Marchand', '142', '98,70 $', '14,20 $', '0,6951 $', '1'],
              ['m••••@cassiopee-digital.fr', 'Manon Girard', '96', '64,30 $', '9,80 $', '0,6698 $', '0'],
              ['s••••@nextedia-conseil.fr', 'Sami Belhadj', '58', '41,20 $', '6,10 $', '0,7103 $', '2'],
            ],
          },
        },
      },
      { type: 'text', text: 'Top ESN par coût', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['ESN', 'Analyses', 'Coût total', '30 j', 'Coût moyen', 'Non mesurées'],
            rows: [
              ['Wavestone Consulting', '412', '286,90 $', '38,40 $', '0,6964 $', '2'],
              ['Synaltic Group', '298', '204,60 $', '28,10 $', '0,6866 $', '0'],
              ['Cassiopée Digital', '164', '112,80 $', '15,90 $', '0,6878 $', '1'],
              ['Nextedia Conseil', '210', '146,20 $', '19,60 $', '0,6962 $', '0'],
              ['Ekitia Systems', '77', '52,30 $', '7,40 $', '0,6792 $', '0'],
              ['Arion Technologies', '43', '29,10 $', '4,20 $', '0,6767 $', '0'],
            ],
          },
        },
      },
      { type: 'text', text: 'Offres — ce que chaque offre rapporte', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Offre',
              'Prix',
              'Crédits/mois',
              'Clients',
              'MRR généré',
              'Marge',
              'Consommation médiane',
              'Taux de dépassement',
            ],
            rows: [
              [
                'Starter (retiré de la vente)',
                '49 €/mois',
                '50',
                '2',
                '98 €',
                'non mesurable — coût fournisseur en $, MRR en €',
                '32 crédits',
                '4,0 %',
              ],
              [
                'Team',
                '149 €/mois',
                '200',
                '6',
                '894 €',
                'non mesurable — coût fournisseur en $, MRR en €',
                '168 crédits',
                '11,2 %',
              ],
              [
                'Growth',
                '349 €/mois',
                '600',
                '5',
                '1 745 €',
                'non mesurable — coût fournisseur en $, MRR en €',
                '512 crédits',
                '18,6 %',
              ],
              [
                'Entreprise (sur devis)',
                'sur devis',
                'sur devis',
                '4',
                'facturé sur facture',
                'non mesurable — coût fournisseur en $, MRR en €',
                '890 crédits',
                '2,1 %',
              ],
              ['Beta', '0 €/mois', '100', '1', '0 €', 'sans objet — offre gratuite', '44 crédits', '0,0 %'],
            ],
          },
        },
      },
      { type: 'text', text: 'Catalogue des offres', style: 'heading' },
      {
        type: 'text',
        text: 'Changer un prix s’applique aux nouveaux abonnements ET aux abonnés en cours, à leur prochaine échéance — sans facture ni avoir immédiat. Décocher une fonction incluse la retire IMMÉDIATEMENT aux abonnés du palier.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Clé',
              'Nom',
              'Prix €/mois',
              'Crédits/mois',
              'Enrichissements (obsolète)',
              'Sièges',
              'Prix siège €/mois',
              'Self-serve',
            ],
            rows: [
              [
                'starter',
                'Starter (retiré de la vente)',
                '49',
                '50',
                '0',
                '1',
                'sans objet — 1 seul utilisateur',
                'non',
              ],
              ['team', 'Team', '149', '200', '0', '3', '39', 'oui'],
              ['growth', 'Growth', '349', '600', '0', '5', '39', 'oui'],
              ['enterprise', 'Entreprise (sur devis)', 'sur devis', 'sur devis', '0', 'sur devis', 'sur devis', 'non'],
              ['beta', 'Beta', '0', '100', '0', '1', 'sans objet — 1 seul utilisateur', 'non'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Confirmer l’enregistrement — Growth' } },
        children: [
          {
            type: 'text',
            text: '6 clients sont sur cette offre aujourd’hui.',
            style: 'body',
          },
          {
            type: 'text',
            text: 'Champs modifiés : Prix €/mois, Crédits/mois.',
            style: 'body',
          },
          {
            type: 'text',
            text: '⚠️ Un prix change : les abonnements EN COURS y passeront à leur prochaine échéance, sans facture ni avoir immédiat.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Confirmer l’enregistrement' } },
              },
              { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Annuler' } } },
            ],
          },
        ],
      },
      { type: 'text', text: 'Sur facture — clients provisionnés hors Stripe', style: 'heading' },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          content: {
            title: '1 contrat(s) à traiter aujourd’hui',
            description:
              'Arion Technologies — engagement échu depuis le 30/08/2026. Aucun accès n’est coupé automatiquement — la suspension reste une décision à prendre.',
          },
        },
      },
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Clients sur facture' } },
            children: [{ type: 'text', text: '4', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'À traiter' } },
            children: [
              { type: 'text', text: '1', style: 'display' },
              { type: 'text', text: '1 urgent — engagement échu', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Factures non encaissées' } },
            children: [{ type: 'text', text: '2 400 €', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Valeur annualisée' } },
            children: [
              { type: 'text', text: '38 200 €', style: 'display' },
              { type: 'text', text: 'hors contrats ponctuels', style: 'caption', color: 'text/muted' },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'ESN',
              'Propriétaire',
              'Plan',
              'Montant',
              'Périodicité',
              'Début',
              'Engagement · état',
              'Factures émises',
            ],
            rows: [
              [
                'Wavestone Consulting',
                'j••••@wavestone-consulting.fr',
                'Entreprise',
                '2 400 €',
                'Annuel',
                '02/01/2026',
                'À jour — jusqu’au 02/01/2027',
                '1/1 période facturée',
              ],
              [
                'Arion Technologies',
                'p••••@arion-technologies.fr',
                'Entreprise',
                '900 €',
                'Trimestriel',
                '30/08/2026',
                'Engagement échu — à renouveler',
                '3/4 périodes facturées',
              ],
              [
                'Groupe Delmas Ingénierie',
                'r••••@delmas-ingenierie.fr',
                'Entreprise',
                '1 800 €',
                'Semestriel',
                '15/03/2026',
                'À jour — jusqu’au 15/03/2027',
                '2/2 périodes facturées',
              ],
              [
                'Odalys Numérique',
                'c••••@odalys-numerique.fr',
                'Entreprise',
                '600 €',
                'Ponctuel',
                '10/09/2026',
                'Sans engagement',
                '1/1 période facturée',
              ],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Journal des factures — Wavestone Consulting' } },
        children: [
          {
            type: 'text',
            text: 'FA-2026-0104 · 02/01/2026 → 02/01/2027 · encaissée',
            style: 'body',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              { type: 'component', component: 'Input', props: { content: { label: 'N° de facture', value: '' } } },
              { type: 'component', component: 'Checkbox', props: { content: { label: 'encaissée' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', content: { label: 'Enregistrer' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'La période n’est pas demandée : l’API la déduit de la plus ancienne qui manque. Aucune suppression — une facture fausse se corrige, elle ne s’efface pas.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      { type: 'text', text: 'Calendrier de facturation — douze mois', style: 'heading' },
      {
        type: 'text',
        text: '← 12 mois précédents · 12 mois suivants → · revenir au mois courant',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Fenêtre affichée' } },
            children: [{ type: 'text', text: 'oct. 2025 → sept. 2026 · 4 clients', style: 'body' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Périodes en retard' } },
            children: [{ type: 'text', text: '1', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'À émettre' } },
            children: [{ type: 'text', text: '1', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Émises' } },
            children: [
              { type: 'text', text: '5', style: 'display' },
              { type: 'text', text: 'dont 1 en attente d’encaissement', style: 'caption', color: 'text/muted' },
            ],
          },
        ],
      },
      {
        type: 'text',
        text: '✓ émise et encaissée · ○ émise, en attente · ⚠ à émettre · ✗ en retard · non applicable — aucune période ne commence ce mois-ci',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'ESN',
              'jan.',
              'fév.',
              'mars',
              'avr.',
              'mai',
              'juin',
              'juil.',
              'août',
              'sept.',
              'oct.',
              'nov.',
              'déc.',
            ],
            rows: [
              [
                'Wavestone Consulting',
                '✓',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
              ],
              ['Arion Technologies', 'n/a', 'n/a', '✗', 'n/a', 'n/a', '✓', 'n/a', '✓', 'n/a', 'n/a', '✗', 'n/a'],
              [
                'Groupe Delmas Ingénierie',
                'n/a',
                'n/a',
                '✓',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                'n/a',
                '✓',
                'n/a',
                'n/a',
                'n/a',
              ],
              ['Odalys Numérique', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', '○', 'n/a', 'n/a', 'n/a'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: '1 contrat(s) dépassent les 240 périodes que le module dérive (Wavestone Consulting) : au-delà, la grille ne peut rien affirmer sur les mois affichés. Le suivi de ces contrats se fait dans l’onglet « Sur facture ».',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Période · Arion Technologies' } },
        children: [
          { type: 'text', text: 'Période : du 01/03/2026 au 31/03/2026', style: 'body' },
          { type: 'text', text: 'État : ✗ En retard — depuis 27 jours', style: 'body' },
          { type: 'text', text: 'Facture émise : aucune', style: 'body' },
          { type: 'text', text: 'Montant facturé : non facturé', style: 'body' },
          { type: 'text', text: 'Montant du contrat : 900 € · Trimestriel', style: 'body' },
          { type: 'text', text: 'Engagement : non renseigné', style: 'body' },
          {
            type: 'text',
            text: 'Pour enregistrer la facture émise dans la comptabilité, passer par l’onglet Sur facture. Aucun document n’est émis d’ici, et aucun accès n’est coupé automatiquement.',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'text', text: 'Relance', style: 'heading' },
          {
            type: 'text',
            text: 'Le message est préparé, jamais envoyé d’ici : copiez-le, envoyez-le depuis votre messagerie, puis consignez-le pour que la cadence avance et que la trace existe.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'FilterChips',
            props: { items: ['Courtois', 'Ferme (actif)', 'Escalade'] },
          },
          { type: 'text', text: 'Rang : relance n°2 · ton ferme', style: 'body' },
          { type: 'text', text: 'Destinataire : p••••@arion-technologies.fr', style: 'body' },
          { type: 'text', text: 'Échéance : le 03/03/2026 · 27 jours de retard', style: 'body' },
          { type: 'text', text: 'Objet : Facture FA-2026-0830 — 27 jours de retard', style: 'body' },
          {
            type: 'text',
            text: 'Bonjour, nous n’avons pas encore reçu le règlement de la facture FA-2026-0830 (900 €), échue le 03/03/2026. Merci de nous indiquer une date de règlement.',
            style: 'body',
            color: 'text/secondary',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'Copier le message' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'J’ai envoyé cette relance' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', content: { label: 'Déclarer un litige' } },
              },
            ],
          },
          { type: 'text', text: 'Historique', style: 'caption', color: 'text/muted' },
          {
            type: 'text',
            text: 'Relance n°1 · ton courtois · consignée le 10/03/2026',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucune analyse enregistrée' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Impossible de joindre l’endpoint admin',
            description: 'Vérifie API_BASE_URL et INTERNAL_API_SECRET.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '`null` n’est PAS `0` : une moyenne sur zéro analyse tarifée n’existe pas. L’API rend `null` là où elle rendait `0`, et l’écran l’affiche en tiret — pas un « 0,0000 $ » qui se relirait comme une mesure.',
      source: 'apps/dashboard-manager/src/app/facturation/_components/usage-panel.tsx:11',
    },
    {
      kind: 'decision',
      text: 'Sous-vue « Offres » : commence par ce que chaque offre RAPPORTE (clients, MRR généré, marge, consommation médiane, taux de dépassement, 8 colonnes) avant le catalogue éditable — le catalogue seul disait ce qu’on vend, pas ce que ça rapporte. La marge n’est jamais un pourcentage inventé : coût fournisseur en dollars, MRR en euros, Bellum ne convertit rien (même refus qu’en D436 sur `/couts`). Le catalogue éditable porte 14 fonctions incluses par plan (checkboxes), masquées ici pour la lisibilité de la maquette.',
      source: 'apps/dashboard-manager/src/app/facturation/_components/offers-panel.tsx:12',
    },
    {
      kind: 'decision',
      text: 'Sous-vue « Sur facture » : clients provisionnés à la main, facturés hors Stripe — l’écran enregistre les conditions commerciales, ne génère aucun document et n’envoie aucune relance. Conforme à la doctrine « préparée ≠ créée ≠ envoyée » : une facture ne s’écrit « facturé » que sur preuve du connecteur. La relance elle-même (ton courtois/ferme/escalade, historique consigné) vit dans un panneau dédié par période, condensé ici en un état « Engagement · état ».',
      source: 'apps/dashboard-manager/src/app/facturation/page.tsx:13',
    },
    {
      kind: 'decision',
      text: 'Sous-vue « Calendrier » : grille 12 mois par ESN, chaque case porte un symbole ET sa phrase (`aria-label`) — jamais l’un sans l’autre — et le tableau porte sa légende à part. « n/a » (aucune période ne commence ce mois-ci) est un cinquième symbole à part entière, jamais une case vide qui se lirait comme un oubli.',
      source: 'apps/dashboard-manager/src/app/facturation/_components/billing-calendar-panel.tsx:51',
    },
    {
      kind: 'decision',
      text: '`?view=fournisseurs` redirige vers `/couts` depuis le 07/09/2026 (#1661) : les coûts fournisseurs sont sortis de Facturation (« technique, pas revenu ») — la redirection évite qu’un signet atterrisse en silence sur l’onglet par défaut.',
      source: 'apps/dashboard-manager/src/app/facturation/page.tsx:28',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la grille de 4 KPI passerait à 3 et le tableau « Top users » masquerait Non mesurées et 30 j (déjà visibles ailleurs) ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) « Top users » et « Top ESN » passeraient côte à côte plutôt que d’étirer chaque tableau.',
      source: 'apps/dashboard-manager/src/app/facturation/_components/usage-panel.tsx:45',
    },
    {
      kind: 'ecart',
      text: '`gridTemplateColumns: repeat(4, 1fr)` est un style inline sans media query : à 1280 les 4 tuiles se resserrent, elles ne passent jamais à 3 aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/facturation/_components/usage-panel.tsx:45',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : colonne « Enrichissements (obsolète) » du catalogue, `ConfirmationPanel` d’édition d’offre (clients concernés, champs modifiés, avertissements prix/fonction retirée — EN LIGNE sous la ligne éditée, pas une surcouche), bandeau de contrats critiques du jour sur « Sur facture », journal interactif de factures par client (`InvoiceLedger`), navigation temporelle du calendrier, avertissement de troncature au-delà de 240 périodes dérivées, et panneau détaillé de période + panneau de relance complet (ton, aperçu, litige, historique) — tous deux EN LIGNE sous le calendrier au clic sur une case, pas une surcouche.',
      source: 'apps/dashboard-manager/src/app/facturation/_components/billing-reminder-panel.tsx:1',
    },
  ],
}
