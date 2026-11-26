W='apps/web/src/features/'
def edit(f, pairs):
    p=W+f
    s=open(p).read()
    for a,b in pairs:
        assert a in s,(f,a[:90])
        s=s.replace(a,b)
    open(p,'w').write(s)

edit('demo/demo-chat-script.ts',[
(""" * ⚠️ Les réponses parlent de SOCIÉTÉS RÉELLES (Société Générale, Thales,
 * leboncoin, BlaBlaCar, SNCF), celles que le visiteur peut ouvrir dans l'app.""",""" * ⚠️ Les réponses parlent de SOCIÉTÉS RÉELLES (Société Générale, Groupe BPCE,
 * SNCF — les trois comptes de la salle depuis le retrait du 01/10/2026), celles
 * que le visiteur peut ouvrir dans l'app."""),
("const BLABLACAR_TARGET = 'BlaBlaCar — siège de décision'","const BPCE_TARGET = 'Groupe BPCE — organe central'"),
(""" *  1. faite — le brouillon d'e-mail : c'est celui que `p-message` dit « dans le
 *     dossier », sur le même angle (l'arrêt de l'activité autocar en janvier 2027) ;""",""" *  1. faite — le brouillon d'e-mail : c'est celui que `p-message` dit « dans le
 *     dossier », sur le même angle (une banque régionale, pas l'organe central) ;"""),
(""" * Aucune personne nommée (`contact_name: null`) : le dossier ne nomme que le
 * siège de décision.""",""" * Aucune personne nommée (`contact_name: null`) : le dossier ne nomme que
 * l'organe central."""),
("contact_id: 'demo-blablacar', contact_name: null, channel: 'email'","contact_id: 'demo-bpce', contact_name: null, channel: 'email'"),
("contact_id: 'demo-blablacar', contact_name: null, channel: 'linkedin'","contact_id: 'demo-bpce', contact_name: null, channel: 'linkedin'"),
("'Générer un brouillon (e-mail) pour le siège de décision de BlaBlaCar.'","'Générer un brouillon (e-mail) pour l’organe central du Groupe BPCE.'"),
("targetObject: BLABLACAR_TARGET","targetObject: BPCE_TARGET"),
("content: 'Angle : l’arrêt de l’activité autocar en janvier 2027.'","content: 'Angle : une banque régionale, cliente autonome, plutôt que l’organe central.'"),
("dataUsed: 'Le dossier BlaBlaCar'","dataUsed: 'Le dossier Groupe BPCE'"),
("'Le brouillon est dans le dossier BlaBlaCar. Rien n’a été envoyé.'","'Le brouillon est dans le dossier Groupe BPCE. Rien n’a été envoyé.'"),
("'Générer un message pour les réseaux professionnels, adressé au siège de décision de BlaBlaCar.'","'Générer un message pour les réseaux professionnels, adressé à l’organe central du Groupe BPCE.'"),
# p-signals
("question: 'Quels signaux justifient de prioriser Thales ?',","question: 'Quels signaux justifient de prioriser SNCF ?',"),
("""      "• l'acquisition d'Exail pour 4 Md€, annoncée en avril 2026 — une intégration de cette taille se traduit en chantiers dans les six mois ;\\n" +
      '• 3 300 recrutements annoncés en France pour 2026 : un volume que le marché du travail ne couvrira pas seul ;\\n' +
      "• des postes de production et d'intégration-tests ouverts publiquement sur plusieurs sites, dont certains en intérim.\\n\\n" +""","""      '• un partenariat de trois ans sur l’IA, les données et la maintenance prédictive, annoncé en juin 2026 — des cas d’usage à industrialiser derrière ;\\n' +
      '• une chaire sur l’IA et l’optimisation pour les mobilités, portée par la direction du numérique du groupe : le sponsor est identifié, reste à trouver son budget de production ;\\n' +
      '• une réorganisation de la gouvernance numérique autour de six entités métiers, avec un objectif affiché d’autonomie et de résilience.\\n\\n' +"""),
# p-portfolio
("""      "Cinq comptes suivis, tous en veille active, et tous notés PRUDENT — ce qui est la vérité d'un portefeuille de grands comptes travaillés à froid. " +
      "SNCF et BlaBlaCar sortent devant : pas parce qu'ils sont plus gros, mais parce qu'ils sont les plus ACCESSIBLES pour une structure de 50 à 150 consultants. " +""","""      "Trois comptes suivis, deux notés et un pas encore arbitré : Groupe BPCE, dont le relevé importé décrit la structure et les portes d'entrée, pas la décision de ton équipe — il n'a donc pas de note. " +
      "SNCF sort devant : pas parce qu'elle est plus grosse, mais parce qu'elle est la plus ACCESSIBLE pour une structure de 50 à 150 consultants. " +"""),
("""'Espace de démonstration — cinq sociétés réelles, notes issues de l’analyse, sources citées dans chaque fiche.',""","""'Espace de démonstration — trois sociétés réelles dont deux notées, notes issues de l’analyse, sources citées dans chaque fiche.',"""),
("""        { label: 'SNCF', value: 18, unit: '/ 25' },
        { label: 'BlaBlaCar', value: 18, unit: '/ 25' },
        { label: 'Société Générale', value: 15, unit: '/ 25' },
        { label: 'Thales', value: 15, unit: '/ 25' },
        { label: 'leboncoin', value: 15, unit: '/ 25' },
      ],""","""        { label: 'SNCF', value: 18, unit: '/ 25' },
        { label: 'Société Générale', value: 15, unit: '/ 25' },
      ],"""),
# p-message
("question: 'Que dire à BlaBlaCar en premier message ?',","question: 'Que dire à Groupe BPCE en premier message ?',"),
("title: 'Premier message à BlaBlaCar',","title: 'Premier message à Groupe BPCE',"),
("""          "L'arrêt de l'activité autocar en janvier 2027. C'est une date ferme, annoncée publiquement, et elle impose de fermer des systèmes avant elle. Le calendrier ne vient pas de toi — il n'y a donc rien à négocier dessus.",
        use_case:
          "Personne ne lève la main en interne pour démonter des systèmes. C'est précisément ce qui en fait une porte d'entrée plutôt qu'une corvée.",""","""          "Une banque régionale, pas l'organe central. Le groupe est coopératif : chaque banque régionale est cliente autonome, avec sa gouvernance, son budget et ses achats locaux.",
        use_case:
          "Un référencement central ne garantit pas l'accès aux banques régionales. Une première référence se prend plutôt sur un compte aux cycles de décision plus courts, comme les filiales de paiement.","""),
# p-competition
("""      "Sur Thales, un partenaire est annoncé publiquement sur la navigation résiliente : entrer frontalement là-dessus n'a pas de sens, et le dossier l'écarte explicitement — avec la raison, et comment le rouvrir un jour.\\n\\n" +
      'Sur les autres comptes, les grandes ESN""","""      "Sur Groupe BPCE, le relevé importé recense quinze prestataires déjà en place : entrer frontalement sur un périmètre déjà tenu n'a pas de sens, et le dossier le dit — avec sa source.\\n\\n" +
      'Sur les autres comptes, les grandes ESN"""),
("Sur ces cinq dossiers, les personnes NOMMÉES","Sur ces trois dossiers, les personnes NOMMÉES"),
# p-priorities
("'Voici l’ordre dans lequel j’ouvrirais tes cinq comptes, et ce qui le justifie.\\n\\n' +","'Voici l’ordre dans lequel j’ouvrirais tes trois comptes, et ce qui le justifie.\\n\\n' +"),
("""          {
            name: 'BlaBlaCar',
            verdict: 'À travailler en premier : calendrier et taille compatibles.',
            why: [
              'Expansion annoncée dans vingt nouveaux pays et prise de poste technique récente.',
              'Zones sans titulaire identifié ; 250 à 499 salariés au registre.',
            ],
            why_now: 'Arrêt de l’activité autocar en France annoncé pour janvier 2027.',
            limits: ['Budget non confirmé côté client.', 'Équipe interne mature.'],
            action: { label: 'Relire le brouillon de premier message dans le dossier' },
          },
          {
            name: 'SNCF',""","""          {
            name: 'SNCF',"""),
("""          {
            name: 'Thales',
            why: [
              'Acquisition d’Exail pour 4 Md€ : des chantiers d’intégration dans les six mois.',
              '3 300 recrutements annoncés en France pour 2026.',
            ],
            limits: [
              'Programmes de défense hors de portée d’un prestataire non habilité : viser les périmètres civils.',
            ],
            action: { label: 'Se placer sur la fenêtre d’intégration' },
          },
          {
            name: 'leboncoin',
            why: ['Besoins alignés sur le catalogue : industrialisation de l’IA, exploitation de plateforme.'],
            limits: ['Équipe interne mature, qui construit l’essentiel elle-même.'],
            action: { label: 'Vérifier ce compte maintenant' },
          },
        ],""","""          {
            name: 'Groupe BPCE',
            verdict: 'À arbitrer : le relevé décrit la structure, pas la décision.',
            why: [
              'Deux réseaux coopératifs — quatorze Banques Populaires et quinze Caisses d’Epargne — dont chaque banque est cliente autonome.',
            ],
            limits: ['Un référencement central ne garantit pas l’accès aux banques régionales.', 'Budget non confirmé.'],
            action: { label: 'Choisir une banque régionale ou une filiale de paiement' },
          },
        ],"""),
("""        title: 'BlaBlaCar et SNCF',
        columns: ['BlaBlaCar', 'SNCF'],
        rows: [
          { label: 'Taille au registre', cells: ['250 à 499 salariés', '10 000 salariés et plus'] },
          { label: 'Porte d’entrée', cells: ['Zones sans titulaire identifié', 'Une des six entités métiers'] },
          {
            label: 'Signal daté',
            cells: ['Arrêt de l’activité autocar, janvier 2027', 'Aucun signal récent qui crée une urgence'],
          },
          { label: 'Frein principal', cells: ['Équipe interne mature', 'Référencement du groupe'] },""","""        title: 'SNCF et Société Générale',
        columns: ['SNCF', 'Société Générale'],
        rows: [
          { label: 'Porte d’entrée', cells: ['Une des six entités métiers', 'Une filiale à autonomie propre'] },
          {
            label: 'Signal daté',
            cells: ['Aucun signal récent qui crée une urgence', 'Nouveau plan stratégique à horizon 2029'],
          },
          {
            label: 'Frein principal',
            cells: ['Référencement du groupe', 'Direction informatique du groupe verrouillée'],
          },"""),
("""          'Quels signaux justifient de prioriser Thales ?',
          'Faut-il attaquer SNCF par le groupe ou par une entité ?',
          'Que dire à BlaBlaCar en premier message ?',""","""          'Quels signaux justifient de prioriser SNCF ?',
          'Faut-il attaquer SNCF par le groupe ou par une entité ?',
          'Que dire à Groupe BPCE en premier message ?',"""),
("# Un classement de cinq comptes","# Un classement de trois comptes") if False else ("   // #1914","   // #1914"),
# timeline
("""    // Les trois événements reprennent des faits DÉJÀ écrits dans ce fichier
    // pour BlaBlaCar (`p-priorities` : expansion vingt marchés, prise de poste
    // récente, brouillon de premier message) — aucun fait nouveau.""","""    // Les trois événements reprennent des faits DÉJÀ écrits dans ce fichier
    // pour Groupe BPCE (`p-priorities` : relevé importé, filiales de paiement,
    // brouillon de premier message) — aucun fait nouveau."""),
("question: 'Qu’est-ce qui s’est passé chez BlaBlaCar ?',","question: 'Qu’est-ce qui s’est passé chez Groupe BPCE ?',"),
("""        title: 'Historique — BlaBlaCar',
        account: { name: 'BlaBlaCar' },""","""        title: 'Historique — Groupe BPCE',
        account: { name: 'Groupe BPCE' },"""),
("""            detail: 'Objectif : trente minutes, pas une vente. Angle : arrêt de l’activité autocar en janvier 2027.',
            at: '2026-08-01T09:10:00.000Z',""","""            detail: 'Objectif : trente minutes, pas une vente. Angle : une banque régionale, pas l’organe central.',
            at: '2026-10-01T09:10:00.000Z',"""),
("""            label: 'Signal retenu : expansion dans vingt nouveaux marchés',
            detail: 'Concomitant à une prise de poste technique récente côté client.',
            at: '2026-08-01T09:05:00.000Z',""","""            label: 'Porte d’entrée retenue : les filiales de paiement',
            detail: 'Cycles de décision plus courts et structures plus accessibles que les banques régionales.',
            at: '2026-10-01T09:05:00.000Z',"""),
("""            label: 'Dossier analysé',
            detail: 'Jeu de démonstration — sources citées dans la fiche.',
            at: '2026-08-01T09:00:00.000Z',""","""            label: 'Relevé importé',
            detail: 'Jeu de démonstration — relevé du 30/09/2026, sources citées dans la fiche.',
            at: '2026-10-01T09:00:00.000Z',"""),
# export
("question: 'Exporte la note de mes cinq comptes dans un fichier',","question: 'Exporte la note de mes comptes dans un fichier',"),
("""          { cells: ['SNCF', '18'] },
          { cells: ['BlaBlaCar', '18'] },
          { cells: ['Société Générale', '15'] },
          { cells: ['Thales', '15'] },
          { cells: ['leboncoin', '15'] },""","""          { cells: ['SNCF', '18'] },
          { cells: ['Société Générale', '15'] },"""),
# contact gap
("""    // Reprend deux faits DÉJÀ écrits dans ce fichier — le partenaire annoncé
    // publiquement sur la navigation résiliente de Thales (`p-competition`) et
    // la règle des mandataires sociaux (`p-contacts`) — aucun fait nouveau.""","""    // Reprend deux faits DÉJÀ écrits dans ce fichier — les six entités métiers
    // de SNCF qui gardent leurs équipes (`p-entity-or-group`) et la règle des
    // mandataires sociaux (`p-contacts`) — aucun fait nouveau."""),
("question: 'As-tu le nom du décideur chez Thales sur la navigation résiliente ?',","question: 'As-tu le nom du décideur chez SNCF sur l’entité que je vise ?',"),
("""            what: 'Le nom du décideur sur ce périmètre',
            why: 'Un partenaire est déjà annoncé publiquement sur ce sujet, et aucune source consultée ne nomme de décideur derrière lui — seuls les mandataires sociaux du registre le sont.',""","""            what: 'Le nom du décideur sur cette entité',
            why: 'Six entités métiers gardent leurs équipes, et aucune source consultée ne désigne le décideur de celle que tu vises — seuls les mandataires sociaux du registre sont nommés.',"""),
("still_possible: ['Écrire au siège de décision du périmètre, sans nom dessus.'],","still_possible: ['Écrire au siège de décision de l’entité, sans nom dessus.'],"),
# plan
("question: 'Prépare ma relance BlaBlaCar en plusieurs étapes',","question: 'Prépare ma relance Groupe BPCE en plusieurs étapes',"),
("'Voici le plan pour relancer BlaBlaCar, en trois étapes.\\n\\n' +","'Voici le plan pour relancer Groupe BPCE, en trois étapes.\\n\\n' +"),
("objective: 'Relancer BlaBlaCar avec un message","objective: 'Relancer Groupe BPCE avec un message"),
# closure
("la relance Société Générale, en retard, et l’acheteur Thales, dû aujourd’hui","la relance Société Générale, en retard, et l’acheteur SNCF, dû aujourd’hui"),
])

edit('demo/demo-day-closure.ts',[
("""      line('thales-cr', 'Envoyer le compte rendu du point programme', today, {
        accountName: 'Thales',""","""      line('sncf-cr', 'Envoyer le compte rendu du point', today, {
        accountName: 'SNCF',"""),
("""      line('lbc-dej', 'Caler un déjeuner avec le responsable plateforme', today, {
        accountName: 'leboncoin',""","""      line('bpce-dej', 'Caler un déjeuner avec un responsable technique du groupe', today, {
        accountName: 'Groupe BPCE',"""),
("line('thales-acheteur', 'Obtenir le nom de l’acheteur référent', today, { accountName: 'Thales' }),","line('sncf-acheteur', 'Obtenir le nom de l’acheteur référent', today, { accountName: 'SNCF' }),"),
("""    firstTomorrow: line('lbc-angle', 'Préparer l’angle renfort plateforme', dayOffset(now, 1), {
      accountName: 'leboncoin',""","""    firstTomorrow: line('bpce-angle', 'Préparer l’angle renfort sur les domaines ouverts', dayOffset(now, 1), {
      accountName: 'Groupe BPCE',"""),
])

edit('chat/api/demo-turn.ts',[
("/** Les cinq comptes de la salle, ceux que les réponses scriptées classent. */\nconst DEMO_PORTFOLIO_NAMES = ['BlaBlaCar', 'SNCF', 'Société Générale', 'Thales', 'leboncoin'] as const","/** Les trois comptes de la salle, ceux que les réponses scriptées classent. */\nconst DEMO_PORTFOLIO_NAMES = ['SNCF', 'Société Générale', 'Groupe BPCE'] as const"),
])
edit('chat/api/demo-turn.test.ts',[
("const DEMO_COMPANIES = ['Société Générale', 'Thales', 'leboncoin', 'BlaBlaCar', 'SNCF']","const DEMO_COMPANIES = ['Société Générale', 'Groupe BPCE', 'SNCF']"),
("un contact chez Thales ou la\n   * SNCF,","un contact chez Groupe BPCE ou la\n   * SNCF,"),
("toMatch(/BlaBlaCar/)","toMatch(/Groupe BPCE/)"),
])
edit('chat/view/demo-runs-the-real-shell.test.tsx',[
("toContain('1. BlaBlaCar')","toContain('1. SNCF')"),
("toContain('- BlaBlaCar — non mesuré')","toContain('- SNCF — non mesuré')"),
])
print('ok')
