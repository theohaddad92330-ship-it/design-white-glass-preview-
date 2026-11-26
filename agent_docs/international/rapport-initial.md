# Rapport international initial — sources, registres, go/no-go, méthode « pack pays »

> **Statut** : livrable roadmap « mini rapport international initial ».
> **Date** : 2026-07-16.
> **Portée** : Belgique, Luxembourg, Suisse, Monaco, Maroc, UAE/Dubaï, Hong Kong.
> **Méthode** : chaque affirmation sur une source (existence, accès API/scraping, coût, légalité) est adossée à une vérification web citée. Les points non confirmés sont explicitement marqués **« à vérifier »**. Aucune donnée inventée — cohérent avec la règle produit « JAMAIS de données fictives ».

---

## 1. Synthèse exécutive & priorisation

BellumAI repose aujourd'hui sur un socle FR très riche (INSEE/SIRENE, Pappers, INPI/RNE, BODACC, France Travail, BOAMP/DECP) où presque tout est **gratuit, ouvert et scriptable**. La question de l'internationalisation est d'abord une question de **disponibilité et d'ouverture des registres officiels** : c'est ce qui conditionne la richesse déterministe du dossier de conquête (identité légale, dirigeants, comptes, signaux). La couverture contacts (Apollo/LinkedIn) et les job boards viennent en second rideau.

**Constat central** : l'ouverture des registres décroît fortement à mesure qu'on s'éloigne de l'UE/EEE.

- **Tier 1 — registres ouverts, gratuits, API/open-data** : **Suisse** (Zefix + UID, le plus ouvert de tous), **Belgique** (KBO/BCE open data + Public Search). Effort faible, quasi « plug » sur l'architecture FR existante.
- **Tier 2 — registre consultable gratuitement mais accès automatisé bridé/payant** : **Luxembourg** (recherche + docs gratuits, mais API RCS ~5 000 €/an et bulk restreint).
- **Tier 3 — petit marché, registre en ligne mais sans API, adjacence FR** : **Monaco** (RCI en ligne depuis 2023, pas d'API, volume faible).
- **Tier 4 — conditionnel, seulement si cas client** : **Maroc** (info entreprise via Directinfo largement payante, pas d'API ouverte ; mais atout francophone + forte présence ESN offshore), **UAE** (registre fragmenté DED + free zones, pas d'API publique, MAIS la meilleure couverture LinkedIn du monde), **Hong Kong** (registre payant à l'acte, pas d'API, marché anglophone lointain du cœur ESN).

**Verdict sur l'hypothèse roadmap** (France → Belgique/Luxembourg/Suisse → Monaco → Maroc/UAE/HK si cas client) : **globalement CONFIRMÉE, avec deux nuances** :

1. **Réordonner le trio Tier 1/2 en Suisse → Belgique → Luxembourg**. La Suisse et la Belgique sont plus faciles à intégrer que le Luxembourg, dont l'accès automatisé au RCS est devenu payant/restreint (~5 000 €) — contre-intuitif pour un « petit pays réputé API-friendly ». Le Luxembourg reste prioritaire **business** (densité d'ESN/SSII, holdings, finance) mais demande un pattern d'accès (recherche unitaire + fichier open-data) plutôt qu'une API temps réel.
2. **Le Maroc mérite d'être surclassé au sein du Tier 4** si la cible commerciale est l'offshore/nearshore IT francophone : la langue et la densité d'ESN y sont des atouts que n'ont ni UAE ni HK. La contrainte est la **donnée registre payante** (Directinfo), pas la culture.

**Recommandation de séquencement** :

```
Palier A (quick win, réutilise le pattern FR)      : Suisse, Belgique
Palier B (business fort, effort d'accès données)    : Luxembourg
Palier C (adjacence, petit volume)                  : Monaco
Palier D (uniquement pull client, par ordre d'atout): Maroc → UAE → Hong Kong
```

---

## 2. Fiches pays

Légende accès registre : 🟢 gratuit + automatisable / 🟡 gratuit à l'écran mais automatisation bridée/payante / 🔴 payant à l'acte ou fermé.

### 2.1 Belgique 🟢

**Registry map**

- Registre : **Banque-Carrefour des Entreprises (BCE / KBO / CBE)**, opéré par le SPF Économie. C'est l'équivalent direct de SIRENE. ([SPF Économie — CBE Public Search](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/consultation-and-research-data/cbe-public-search))
- Identifiant : **numéro d'entreprise** (10 chiffres) — l'équivalent du SIREN/SIRET. Codes d'activité = **NACE-BEL** (transposition belge de NACE, comparable au NAF).
- **Public Search** : portail gratuit `kbopub.economie.fgov.be`, sans compte, en FR/NL/DE/EN. ([Public Search](https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html))
- **KBO Open Data** : fichiers quotidiens gratuits (toutes les entités actives), téléchargement + SFTP, inscription requise pour sécuriser la réception ; réutilisation autorisée (licence type CC-BY / CC-BY-SA selon l'output). ([CBE Open Data](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data), [data.gov.be](https://data.gov.be/en/datasets/fpseco-cbeopen-download))
- **Public Search Web Service (API officielle)** : payante, **50 € / 2000 requêtes**. ([CBE Public Search Web Service](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-public-search-web-service))
- **Comptes annuels** : **Centrale des bilans de la BNB** — consultation gratuite via l'app **Consult** (PDF/XBRL/CSV, depuis 1999) ; web services pour professionnels. Équivalent d'un « Pappers comptes ». ([BNB Central Balance Sheet Office](https://www.nbb.be/en/central-balance-sheet-office/consultation/consult))
- **Annonces légales** : **Moniteur belge / ejustice** — publications sociétés gratuites en ligne, recherche par n° d'entreprise ou nom, archives depuis 1997. Équivalent BODACC. ([Moniteur belge](https://www.ejustice.just.fgov.be/cgi_tsv_pub/welcome.pl?language=fr))
- Tiers privé utile : `cbeapi.be` (API REST tierce avec free tier — à évaluer, pas source officielle). ([CBEAPI](https://cbeapi.be/en))

**Signaux emploi** : **VDAB** (Flandre, service public, 300k+ annonces, domine le marché flamand), **Le Forem** (Wallonie), **Actiris** (Bruxelles, bilingue), **StepStone.be**. ([VDAB](https://www.jobboardfinder.com/jobboard-vdab-belgium), [StepStone Belgium](https://www.stepstone.be/en/)) Attention : segmentation linguistique FR/NL obligatoire.

**Ontologie entités** : formes UE classiques — SA/NV, SRL/BV (ex-SPRL), holdings, ASBL/VZW. Pas de « free zone ». Mapping direct sur le modèle FR (société / établissement / dirigeant).

**Couverture contacts** : Apollo/LinkedIn — bonne (Europe de l'Ouest, forte pénétration pro), mais Apollo réputé plus faible/plus cher hors US en EMEA (mobiles/titres périmés). Cognism cité comme meilleur sur données européennes GDPR. ([Cognism EMEA](https://www.cognism.com/blog/emea-b2b-data)) — **à évaluer** vs coût.

**Culture commerciale** : marché bilingue FR/NL (+ DE à l'est) → messages et titres à adapter par région linguistique. Proximité culturelle FR forte côté Wallonie/Bruxelles.

**Légal/RGPD** : **membre UE → RGPD plein**. Aucune contrainte de transfert intra-UE. Réutilisation des données KBO explicitement autorisée sous licence.

**Verdict : GO — effort FAIBLE.** Copie quasi conforme du pattern FR (registre ouvert + comptes gratuits + annonces légales gratuites). Décision d'accès : open-data file + Public Search (le web service payant n'est utile qu'en temps réel volumineux).

---

### 2.2 Luxembourg 🟡

**Registry map**

- Registre : **RCS (Registre de Commerce et des Sociétés)**, opéré par **LBR (Luxembourg Business Registers)**. ([mj.gouvernement.lu](https://mj.gouvernement.lu/fr/service-citoyens/registre-commerces-societes.html))
- Identifiant : **numéro RCS** (format `B123456`) + n° TVA `LU########`.
- **Recherche gratuite** par nom / n° RCS / TVA sur `lbr.lu`, et **téléchargement gratuit des documents déposés** (statuts, comptes annuels, résolutions). ([businessdataguide LU](https://www.businessdataguide.com/blog/jurisdictions/luxembourg-company-search-guide))
- **Open data** : jeu de données « Extrait du RCS » sur `data.public.lu`. ([data.public.lu RCSL](https://data.public.lu/en/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl/))
- ⚠️ **API RCS restreinte et payante** : l'accès automatisé/API est réservé aux gros volumes, sur **demande + autorisation préalable + déclaration de volume**, avec une **tarification rapportée à ~5 000 € pour l'accès API (à partir de janvier 2026)** ; le **bulk download** des dépôts est restreint par les conditions d'utilisation du portail. Sources secondaires (advocacy + guides), **à confirmer sur la grille tarifaire officielle LBR**. ([modoperandi — restriction accès automatisé](https://modoperandi.substack.com/p/open-data-luxembourg), [grille tarifs LBR](https://www.lbr.lu/mjrcs/jsp/webapp/static/mjrcs/en/mjrcs/pdf/tarifs.pdf))
- **RESA** : gazette officielle (publications légales) gérée par LBR — équivalent annonces légales/BODACC.
- **RBE (bénéficiaires effectifs)** : **fermé au grand public** depuis l'arrêt CJEU (accès réservé autorités, professionnels AML, intérêt légitime prouvé). Ne pas compter dessus pour l'organigramme actionnarial. ([e-Justice LU](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en))

**Signaux emploi** : **Moovijob** (privé, principal job board LU depuis 2007) et **ADEM JobBoard** (service public de l'emploi ; toute vacance doit être déclarée à l'ADEM). ([Moovijob](https://en.moovijob.com/), [ADEM](https://adem.public.lu/en/demandeurs-demploi/consulter-offres-demploi.html))

**Ontologie entités** : SA, S.à r.l., SOPARFI (holding), fonds/SICAV, forte densité de **holdings et véhicules financiers** → l'ontologie doit distinguer holding financière vs société opérationnelle (beaucoup d'entités = coquilles patrimoniales, pas des prospects ESN). Analogue au filtrage « SCI/coquilles » déjà connu côté FR.

**Couverture contacts** : bonne (place financière internationale, forte présence LinkedIn cadres). Multilingue FR/DE/EN + luxembourgeois.

**Culture commerciale** : trilingue (FR administratif, DE, EN business/finance), très internationale, densité décisionnaire élevée par km². Cible ESN pertinente (beaucoup de DSI banque/assurance/fonds).

**Légal/RGPD** : **membre UE → RGPD plein**. Attention : la restriction d'accès automatisé RCS/RBE est une contrainte d'**accès**, pas de RGPD.

**Verdict : GO business fort, mais effort MOYEN sur l'accès données.** Prioriser recherche unitaire + fichier open-data ; ne pas budgéter l'API payante avant volume prouvé. Bien filtrer les holdings/coquilles.

---

### 2.3 Suisse 🟢 (registre le plus ouvert du panel)

**Registry map**

- Registre : **Zefix (Central Business Names Index)**, portail fédéral (Office fédéral du registre du commerce) au-dessus des **26 registres cantonaux**. ([opendata.swiss — Zefix](https://opendata.swiss/en/dataset/zefix-zentraler-firmenindex))
- Identifiant : **UID** `CHE-XXX.XXX.XXX` — identifiant unique reliant registre du commerce + TVA + assurances sociales + douanes + statistiques (bien plus intégré que le SIREN). ([kmu.admin — UID](https://www.kmu.admin.ch/kmu/en/home/concrete-know-how/setting-up-sme/starting-business/commercial-register%20.html))
- **Zefix** : recherche gratuite par nom/UID/canton, **API REST gratuite** (compte requis selon une source, à confirmer), + sous-ensemble **open data** sur `opendata.swiss` et **LINDAS** (linked data). ([register.ld.admin.ch](https://register.ld.admin.ch/.well-known/dataset/foj-zefix))
- **Registre UID** (`uid.admin.ch`) public et gratuit, confirme l'assujettissement TVA.
- **Extraits certifiés** : payants, émis par le **canton** (~CHF 20–35) ; les extraits **non certifiés sont gratuits via Zefix**. La donnée dont Bellum a besoin (identité, siège, forme, statut) est dans le tier gratuit. ([Zephira — Zefix 2026](https://zephira.ai/swiss-company-registry-data-how-to-search-zefix-2026/))
- **Annonces légales** : **SHAB / FOSC** (Feuille officielle suisse du commerce) — publications officielles (radiations, mutations). **à câbler** comme équivalent BODACC.
- Comptes annuels : **pas de dépôt public généralisé** comme en BE/FR (les PME non cotées ne publient pas leurs comptes publiquement) → **gap structurel** vs FR/BE, à documenter côté produit.

**Signaux emploi** : **jobs.ch** (leader, Suisse alémanique) et **jobup.ch** (leader Romandie francophone, ~1,3M visites/mois). ([jobs.ch](https://www.jobs.ch/en/), [jobup.ch](https://www.jobup.ch/en/))

**Ontologie entités** : AG/SA, GmbH/Sàrl, Zweigniederlassung (succursale), holdings. Fragmentation cantonale = un même groupe peut avoir des entités dans plusieurs cantons (l'UID les relie).

**Couverture contacts** : très bonne (forte pénétration LinkedIn Europe de l'Ouest). Trilingue DE/FR/IT → segmentation linguistique par région.

**Culture commerciale** : marché premium, trilingue, très décentralisé (cantons). Forte densité IT/finance/pharma (bassins Zurich, Genève, Zoug, Bâle). Cible ESN à haute valeur.

**Légal/RGPD** : **hors UE mais nFADP/revDSG en vigueur depuis le 1er sept. 2023**, et **adéquation RGPD confirmée par la Commission européenne le 15 janv. 2024** → transferts UE↔CH facilités, pas de barrière. ([nFADP](https://www.kmu.admin.ch/kmu/en/home/fakten-und-trends/digitalisierung/datenschutz/neues-datenschutzgesetz-revdsg.html))

**Verdict : GO — effort FAIBLE.** Meilleur ROI d'intégration du panel (registre ouvert, API gratuite, UID propre, adéquation RGPD). Seul manque : pas de comptes annuels publics → dossier financier plus léger qu'en FR/BE.

---

### 2.4 Monaco 🟡 (petit marché, adjacence FR)

**Registry map**

- Registre : **RCI (Répertoire du Commerce et de l'Industrie)**, **en ligne depuis le 13 janvier 2023** (avant : consultation physique). ([gouv.mc — RCI](https://www.gouv.mc/Action-Gouvernementale/Sites-lies/Sites-Officiels-du-Gouvernement-Princier/Repertoire-du-Commerce-et-de-l-Industrie-de-Monaco-RCI), [Monaco Hebdo](https://monaco-hebdo.com/politique/rci-disponible-sur-internet-monaco/))
- Identifiant : **numéro RCI** (ex. `17P08925`).
- **Recherche gratuite** : `rci.gouv.mc` (fiche gratuite `fichePPGratuit.jsp`) et `teleservice.gouv.mc/rci/` ; portail d'information `monentreprise.gouv.mc`. Extraits officiels commandables (payants). ([Consulter le RCI](https://www.rci.gouv.mc/rc/fichePPGratuit.jsp?rc=17P08925), [monentreprise.gouv.mc](https://monentreprise.gouv.mc/en/themes/starting-and-managing-a-business/starting-a-business/registration-and-statement-of-existence/trade-and-industry-directory))
- **Pas d'API documentée** : accès par le formulaire web RCI → intégration = scraping léger du téléservice (vérifier CGU). **à vérifier** : conditions de réutilisation.

**Signaux emploi** : marché minuscule (~40 000 emplois salariés). Offres via portail gouvernemental et sites locaux ; LinkedIn + job boards français en débordement. **à vérifier** — pas de job board local dominant identifié.

**Ontologie entités** : SAM (Société Anonyme Monégasque), SARL, SCS, SNC, sociétés civiles ; forte proportion de sociétés patrimoniales/gestion de fortune → filtrer comme LU (beaucoup de non-prospects ESN).

**Couverture contacts** : LinkedIn OK sur cadres finance/immobilier/yachting ; volume faible en absolu (micro-État).

**Culture commerciale** : francophone, très proche de la France (avantage direct), écosystème concentré (finance privée, immobilier de luxe, yachting, iGaming). Réseau/relationnel primordial.

**Légal/RGPD** : **hors UE, PAS (encore) d'adéquation RGPD**. Cadre = **Loi n° 1.165 (1993)** modernisée par la **Loi n° 1.565** (alignement Convention 108+ du Conseil de l'Europe) ; autorité = **APDP** (ex-CCIN). Monaco vise l'adéquation mais ne l'a pas → **prudence sur les transferts** de données personnelles UE→Monaco (encadrer par garanties type Convention 108+). ([CCIN/APDP](https://www.ccin.mc/en/legislation/international-context/), [Actis Monaco — nouvelle loi](https://www.actis.mc/monaco-new-law-on-the-protection-of-personal-data/))

**Verdict : GO opportuniste — effort FAIBLE technique mais ROI marché FAIBLE.** À faire surtout parce que l'adjacence FR rend l'ajout peu coûteux (même langue, même culture). Volume d'affaires limité. Pas d'API → scraping du RCI.

---

### 2.5 Maroc 🔴 (conditionnel — atout francophone/offshore, donnée payante)

**Registry map**

- Registres : **OMPIC** (Office Marocain de la Propriété Industrielle et Commerciale) centralise le **Registre de Commerce (RC)** ; recherche via **Directinfo** (`directinfo.ma` / `edemarche.directompic.ma`). ([OMPIC — recherche bases](http://www.ompic.ma/fr/content/recherche-dans-les-bases-de-donees-ompic), [Directinfo](https://www.directinfo.ma/))
- Identifiants : **ICE (Identifiant Commun de l'Entreprise, 15 chiffres)** = pivot inter-administrations (assigné par OMPIC ou DGI) + **n° RC** + **IF** (identifiant fiscal) + **CNSS**. ([OMPIC — ICE](http://www.ompic.ma/fr/content/identifiant-commun-de-lentreprise))
- ⚠️ **Directinfo est un service OMPIC largement payant** pour l'info légale/financière détaillée ; la recherche de base peut afficher RC + ICE. **Pas d'API ouverte gratuite** identifiée. Plateforme ICE officielle : `ice.gov.ma`.
- **Annonces légales** : publications dans journaux d'annonces légales + Bulletin officiel — **à vérifier** (couverture, accès en ligne structuré).

**Signaux emploi** : **Rekrute.com** (leader auto-déclaré ~80 % des offres cadres/mid, ~670k visites/mois) et **emploi.ma**. ([Rekrute](https://www.jobboardfinder.com/jobboard-rekrutecom-morocco), [workello — Morocco](https://workello.com/job-board-morocco/)) Bon proxy des signaux d'embauche IT (offshore, centres de service).

**Ontologie entités** : SA, SARL, SARL-AU, succursales de groupes étrangers, entités en **zones franches / CFC (Casablanca Finance City)** → distinguer entité locale vs filiale de groupe FR (beaucoup d'ESN FR ont des centres offshore au Maroc = cible et/ou concurrent).

**Couverture contacts** : LinkedIn correct sur cadres IT/finance urbains (Casablanca, Rabat) ; Apollo plus faible/à vérifier. Français = langue business dominante → gros avantage pour la génération de messages Bellum.

**Culture commerciale** : **francophone** (atout majeur vs UAE/HK), forte densité d'**ESN/centres offshore** IT, relationnel important. C'est le marché Tier 4 le plus « naturel » pour une ESN française.

**Légal/RGPD** : **Loi 09-08** + Décret 2-09-165 (2009), autorité **CNDP** ; enregistrement/autorisation préalable de certains traitements, **transferts transfrontaliers encadrés**. Maroc signataire de la Convention 108 mais **pas d'adéquation RGPD** → encadrer les flux. ([DLA Piper — Maroc](https://www.dlapiperdataprotection.com/?t=law&c=MA), [DPO Consulting — Loi 09-08](https://www.dpo-consulting.com/blog/morocco-data-protection-law-09-08))

**Verdict : NO-GO par défaut / GO si cas client.** Le blocage n'est pas la culture (favorable) mais l'**absence de registre ouvert gratuit/API** (Directinfo payant). Priorité 1 du Tier 4 si un client ESN cible l'offshore Maroc.

---

### 2.6 UAE / Dubaï 🔴 (registre fragmenté, mais LinkedIn n°1 mondial)

**Registry map**

- **Pas de registre national unique.** Structure fédérale + autonomie des zones franches. ([Counterscope — UAE registry](https://www.counterscope.ae/institutions/uae-company-registry))
- **NER (National Economic Register)** : agrégateur fédéral `ner.economy.ae`, **gratuit, sans login**, AR/EN ; recherche par nom commercial / n° de licence / activité / economic register number ; renvoie nom légal, statut de licence, activité, autorité émettrice. Toutes les entreprises (mainland + free zone) y figurent par la loi. ([u.ae — NER](https://u.ae/en/information-and-services/business/important-digital-services/national-economic-register))
- **Mainland** : chaque émirat a son **DED/DET** (Dubaï = **Dubai DET**). **Free zones** : registres séparés et juridiquement distincts — **DIFC** et **ADGM** (droit common law, portails de recherche publics), **DMCC** (public search), JAFZA/RAKEZ/IFZA/Meydan… (souvent : email au registrar avec n° de licence). Une entité DIFC **n'est pas** sur le registre du DED de Dubaï. ([Counterscope — comment vérifier](https://www.counterscope.ae/guides/how-to-check-the-uae-company-register), [DMCC public search](https://landing.dmcc.ae/public-search))
- **Pas d'API publique** documentée ; NER = recherche écran (scraping éventuel, CGU **à vérifier**).
- Identifiants : **n° de licence** (par autorité) + economic register number (NER). Pas d'équivalent SIREN unique national.

**Signaux emploi** : **Bayt.com** (#1 Moyen-Orient, 40k+ organisations) et **GulfTalent** (~9M professionnels région). ([Bayt](https://www.bayt.com/), [GulfTalent](https://www.gulftalent.com/))

**Ontologie entités** : dichotomie structurante **mainland (DED) vs free zone (DIFC/ADGM/DMCC/…)** + holdings ; 100 % détention étrangère autorisée sur le mainland depuis le Décret 26/2020. L'ontologie doit modéliser **la zone/juridiction** comme attribut de premier niveau (impacte fiscalité, droit applicable, registre source).

**Couverture contacts** : **excellente** — les UAE ont **la plus forte pénétration LinkedIn du monde** (chiffres rapportés : ~88 % des adultes, ~7,9M membres, « pays le plus connecté sur LinkedIn »). ([Gulf News — UAE most connected](https://gulfnews.com/business/uae-ranks-as-most-connected-country-on-linkedin-globally-1.2016914), [Talent Intelligence Collective](https://talentintelligencecollective.substack.com/p/linkedins-penetration-rate-by-country)) C'est le point fort du pays : la couche contacts compense la faiblesse du registre.

**Culture commerciale** : anglophone (business) + arabe, **relationnel/confiance primordiaux**, main-d'œuvre très majoritairement expatriée, cycles de décision « top-down ». Forte concentration décideurs finance/immobilier/logistique/tech.

**Légal/RGPD** : **PDPL — Federal Decree-Law 45/2021** (en vigueur 2 janv. 2022), calqué GDPR, portée extraterritoriale ; **les free zones dotées de leur propre loi (DIFC Data Protection Law, ADGM) sont exclues** du PDPL fédéral. UAE autorise les flux transfrontaliers sous conditions. ([Securiti — PDPL](https://securiti.ai/uae-personal-data-protection-law/), [Bird&Bird — PDPL vs GDPR](https://www.twobirds.com/en/insights/2021/uae/how-does-the-new-uae-federal-decree-law-on-personal-data-protection-compare-against-the-gdpr))

**Verdict : NO-GO par défaut / GO si cas client premium.** Registre fragmenté sans API = coût d'intégration élevé (N sources par free zone). Mais couverture contacts hors normes → si un client vise le Golfe, l'approche « NER + DIFC/ADGM/DMCC public search + LinkedIn/Bayt » est viable.

---

### 2.7 Hong Kong 🔴 (registre payant à l'acte, marché lointain)

**Registry map**

- Registre : **Companies Registry**, système **ICRIS** (Integrated Companies Registry Information System), portail **e-Services** `e-services.cr.gov.hk` + Cyber Search Centre. ([CR — e-Services](https://www.cr.gov.hk/en/electronic/e-servicesportal/overview.htm), [CR — obtenir info](https://www.cr.gov.hk/en/services/obtain-company-info.htm))
- Identifiants : company number + Business Registration number ; déploiement d'un **UBI (Unique Business Identifier)**.
- **Payant à l'acte** : info de base (nom, date d'incorporation, statut) souvent gratuite, mais **documents/filings détaillés = HKD 22–340** ; compte annuel HKD 500 (principal). ([businessdataguide — HK](https://www.businessdataguide.com/blog/jurisdictions/hong-kong-company-search-guide), [Kyckr — HK](https://www.kyckr.com/blog/hong-kong-companies-registry-compliance-guide))
- **Pas d'API officielle** : les institutions doivent créer un compte, consulter le portail, acheter les rapports.

**Signaux emploi** : **JobsDB** (plus grande base de talents d'Asie sur ce marché). ([JobsDB via Zoho](https://www.zoho.com/recruit/supported-job-boards.html))

**Ontologie entités** : Limited company (Ltd), branch of foreign company, holding ; hub régional → beaucoup d'entités = holdings/regional HQ de groupes internationaux.

**Couverture contacts** : LinkedIn correct (hub international) ; Apollo/EMEA-APAC réputé plus faible (mobiles/titres). Anglais + cantonais.

**Culture commerciale** : anglophone + chinois, business rapide et transactionnel, hub financier ; **très éloigné du cœur de cible ESN française**.

**Légal/RGPD** : **PDPO** (Personal Data Privacy Ordinance), autorité **PCPD**. Point notable : la **Section 33** (restriction de transfert transfrontalier) **n'est jamais entrée en vigueur** → à mi-2026, **aucune restriction statutaire** sur les transferts sortants de données depuis HK. ([Tanner De Witt — Section 33](https://www.tannerdewitt.com/cross-border-transfers-section-33/), [PCPD](https://www.pcpd.org.hk/english/resources_centre/publications/guidance/fact1_intro_1.html))

**Verdict : NO-GO sauf cas client explicite.** Registre payant à l'acte + pas d'API + langue/culture/fuseau éloignés du marché ESN FR. Le plus faible ROI du panel. À n'ouvrir que sur demande client ferme.

---

## 3. Méthode « pack pays » réutilisable

Checklist des **9 livrables** à produire pour chaque nouveau pays avant toute ligne de code. Un pays n'est « prêt à builder » que lorsque les 9 sont verts ou explicitement flaggés.

| #   | Livrable                | Question clé                                                                                                                                | Definition of Done                                                                                      |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | **Registry map**        | Quel(s) registre(s) officiel(s) ? Identifiant pivot (type SIREN) ? Accès : API / open-data / écran ? Coût ? Légalité (CGU, réutilisation) ? | Table des sources officielles + endpoint/fichier + coût + statut légal, chaque ligne avec URL vérifiée. |
| 2   | **Employment signals**  | Job boards dominants (public + privé) ? Couverture IT ? Accès/scraping OK ?                                                                 | ≥1 board vérifié par région linguistique, avec faisabilité de collecte.                                 |
| 3   | **Company ontology**    | Formes juridiques, holding vs opérationnel, zones franches/licences, coquilles à filtrer.                                                   | Schéma d'entités + règles de filtrage (ex. « exclure holdings patrimoniales »).                         |
| 4   | **Contact coverage**    | Apollo/LinkedIn : profondeur réelle par pays ? Alternative régionale (Cognism, Bayt, GulfTalent…) ?                                         | Estimation qualitative + provider recommandé + coût.                                                    |
| 5   | **Sales culture**       | Langue(s) business, registre de communication, cycle de décision, canaux.                                                                   | Note de cadrage 1 page pour l'adaptation des messages.                                                  |
| 6   | **Legal / privacy**     | RGPD, adéquation, loi locale, autorité, contraintes de transfert cross-border.                                                              | Statut d'adéquation + base légale de transfert + drapeaux de risque.                                    |
| 7   | **Prompt adaptation**   | Quelles sources injecter, quel identifiant, quelle langue de sortie, quels signaux locaux (marchés publics, annonces légales) ?             | Diff des system prompts + registre de sources par pays.                                                 |
| 8   | **Golden accounts**     | 3–5 comptes réels de test (ESN cible connue) pour validation e2e déterministe.                                                              | Jeu de golden accounts + sortie attendue documentée.                                                    |
| 9   | **Go / no-go + effort** | Verdict synthétique + estimation d'effort (faible/moyen/élevé) + dépendances.                                                               | Décision tranchée + backlog d'intégration priorisé.                                                     |

**Principe transverse** (aligné CLAUDE.md) : chaque source = **échec gracieux** (sans clé/accès = no-op, jamais de donnée inventée), déduplication par identifiant national, et injection **additive** dans les prompts (aucune source FR retirée). Réutiliser l'architecture existante : le pattern `collect_fr_signals` (interface multi-sources à échec gracieux par source) est le gabarit direct d'un futur `collect_<pays>_signals`.

---

## 4. Tableau comparatif final

| Pays            | Registre (identifiant pivot)       | Accès registre                    | Coût registre                        | API officielle         | Comptes annuels publics            | Annonces légales           | Job boards vérifiés             | Contacts (LinkedIn/Apollo)         | Cadre données perso                 | Adéquation RGPD      | Verdict               | Effort              |
| --------------- | ---------------------------------- | --------------------------------- | ------------------------------------ | ---------------------- | ---------------------------------- | -------------------------- | ------------------------------- | ---------------------------------- | ----------------------------------- | -------------------- | --------------------- | ------------------- |
| **Belgique**    | BCE/KBO (n° entreprise)            | 🟢 open-data + Public Search      | Gratuit (API 50 €/2000 req)          | Oui (payante)          | Oui — BNB Consult (gratuit)        | Moniteur belge (gratuit)   | VDAB, Forem, Actiris, StepStone | Bonne                              | RGPD (UE)                           | Oui (UE)             | **GO**                | Faible              |
| **Luxembourg**  | RCS (B######)                      | 🟡 recherche + docs gratuits      | Gratuit à l'écran ; **API ~5 000 €** | Oui (restreinte/chère) | Oui — dépôts gratuits              | RESA                       | Moovijob, ADEM                  | Bonne                              | RGPD (UE)                           | Oui (UE)             | **GO** (business)     | Moyen               |
| **Suisse**      | Zefix / **UID CHE-**               | 🟢 recherche + API + open-data    | Gratuit (extrait certifié CHF 20–35) | **Oui (gratuite)**     | ✗ (pas de dépôt public généralisé) | SHAB/FOSC                  | jobs.ch, jobup.ch               | Très bonne                         | nFADP/revDSG                        | **Oui** (15/01/2024) | **GO**                | Faible              |
| **Monaco**      | RCI (##P#####)                     | 🟡 recherche en ligne (2023)      | Gratuit à l'écran (extraits payants) | Non                    | ✗                                  | à vérifier                 | à vérifier (LinkedIn + FR)      | OK (petit volume)                  | Loi 1.165 + 1.565 (Conv. 108+)      | **Non** (visée)      | **GO** opportuniste   | Faible (ROI faible) |
| **Maroc**       | OMPIC / RC + **ICE**               | 🔴 Directinfo (payant)            | Payant (info détaillée)              | Non (ouverte)          | ✗ (à vérifier)                     | Journaux + BO (à vérifier) | Rekrute, emploi.ma              | LinkedIn OK ; FR = atout           | Loi 09-08 (CNDP)                    | Non (Conv. 108)      | **NO-GO** sauf client | Élevé               |
| **UAE / Dubaï** | NER + DED/free zones (n° licence)  | 🔴 NER gratuit mais **fragmenté** | Gratuit (NER) ; free zones variables | Non (publique)         | Variable par autorité              | ✗ (pas d'équiv. unique)    | Bayt, GulfTalent                | **Excellente** (LinkedIn #1 monde) | PDPL 45/2021 (free zones exclues)   | Non                  | **NO-GO** sauf client | Élevé               |
| **Hong Kong**   | Companies Registry / ICRIS (+ UBI) | 🔴 payant à l'acte                | HKD 22–340 / doc                     | Non                    | Partiel (payant)                   | ✗                          | JobsDB                          | Correcte                           | PDPO (PCPD) ; §33 jamais en vigueur | Non                  | **NO-GO** sauf client | Élevé               |

---

### Notes de rigueur / points « à vérifier »

- **Luxembourg — tarif API ~5 000 €** : issu de sources secondaires (advocacy + guides), à confirmer sur la grille tarifaire LBR officielle avant toute décision budgétaire.
- **Suisse — API Zefix « compte requis »** : une source l'indique, à confirmer (une partie de l'accès est clairement anonyme/gratuit).
- **Monaco & UAE — scraping des téléservices** : conditions générales d'utilisation à vérifier juridiquement avant automatisation (pas d'API → collecte écran).
- **Maroc — annonces légales structurées & profondeur Directinfo gratuite** : à cadrer précisément.
- **Comptes annuels** : disponibles publiquement en BE (gratuit) et LU (gratuit) ; **absents/partiels** en CH, MC, MA, UAE, HK — impacte la richesse du volet financier du dossier de conquête.
- **Apollo hors US (EMEA/APAC)** : couverture/fraîcheur réputées plus faibles ; évaluer Cognism (EU) / Bayt-GulfTalent (Golfe) comme compléments contacts.

---

## Sources principales

Belgique : [SPF Économie — CBE Public Search](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/consultation-and-research-data/cbe-public-search) · [CBE Open Data](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data) · [CBE Public Search Web Service (tarif)](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-public-search-web-service) · [BNB Central Balance Sheet Office](https://www.nbb.be/en/central-balance-sheet-office/consultation/consult) · [Moniteur belge](https://www.ejustice.just.fgov.be/cgi_tsv_pub/welcome.pl?language=fr)
Luxembourg : [mj.gouvernement.lu — RCS](https://mj.gouvernement.lu/fr/service-citoyens/registre-commerces-societes.html) · [data.public.lu — extrait RCSL](https://data.public.lu/en/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl/) · [modoperandi — restriction accès automatisé](https://modoperandi.substack.com/p/open-data-luxembourg) · [e-Justice LU](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en) · [Moovijob](https://en.moovijob.com/) · [ADEM](https://adem.public.lu/en/demandeurs-demploi/consulter-offres-demploi.html)
Suisse : [opendata.swiss — Zefix](https://opendata.swiss/en/dataset/zefix-zentraler-firmenindex) · [register.ld.admin.ch — Zefix LINDAS](https://register.ld.admin.ch/.well-known/dataset/foj-zefix) · [nFADP admin.ch](https://www.kmu.admin.ch/kmu/en/home/fakten-und-trends/digitalisierung/datenschutz/neues-datenschutzgesetz-revdsg.html) · [jobs.ch](https://www.jobs.ch/en/) · [jobup.ch](https://www.jobup.ch/en/)
Monaco : [gouv.mc — RCI](https://www.gouv.mc/Action-Gouvernementale/Sites-lies/Sites-Officiels-du-Gouvernement-Princier/Repertoire-du-Commerce-et-de-l-Industrie-de-Monaco-RCI) · [monentreprise.gouv.mc](https://monentreprise.gouv.mc/en/themes/starting-and-managing-a-business/starting-a-business/registration-and-statement-of-existence/trade-and-industry-directory) · [CCIN/APDP](https://www.ccin.mc/en/legislation/international-context/)
Maroc : [OMPIC — ICE](http://www.ompic.ma/fr/content/identifiant-commun-de-lentreprise) · [Directinfo](https://www.directinfo.ma/) · [DLA Piper — Maroc](https://www.dlapiperdataprotection.com/?t=law&c=MA) · [Rekrute (Jobboard Finder)](https://www.jobboardfinder.com/jobboard-rekrutecom-morocco)
UAE : [u.ae — NER](https://u.ae/en/information-and-services/business/important-digital-services/national-economic-register) · [Counterscope — vérifier le registre UAE](https://www.counterscope.ae/guides/how-to-check-the-uae-company-register) · [Securiti — PDPL](https://securiti.ai/uae-personal-data-protection-law/) · [Gulf News — LinkedIn UAE](https://gulfnews.com/business/uae-ranks-as-most-connected-country-on-linkedin-globally-1.2016914) · [Bayt](https://www.bayt.com/) · [GulfTalent](https://www.gulftalent.com/)
Hong Kong : [CR — obtenir info entreprise](https://www.cr.gov.hk/en/services/obtain-company-info.htm) · [businessdataguide — HK (tarifs)](https://www.businessdataguide.com/blog/jurisdictions/hong-kong-company-search-guide) · [Tanner De Witt — PDPO Section 33](https://www.tannerdewitt.com/cross-border-transfers-section-33/)
Contacts : [Cognism — EMEA B2B data](https://www.cognism.com/blog/emea-b2b-data) · [Talent Intelligence Collective — pénétration LinkedIn](https://talentintelligencecollective.substack.com/p/linkedins-penetration-rate-by-country)
