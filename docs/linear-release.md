# Linear Release Action (retirée)

L'intégration GitHub Actions `linear/linear-release-action` a été retirée du pipeline CI.

Le dépôt ne déclenche plus de workflow `Linear Release` lors des push sur `main`, et aucun secret `LINEAR_ACCESS_KEY` n'est requis pour les builds automatisés.

Les changelogs de pull request peuvent rester utiles pour la revue humaine, mais ils ne sont plus consommés par une étape CI Linear Release.
