/** @type {import("@commitlint/types").UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'website',
        'api',
        'ia',
        'mcp',
        // La console d'opération. Elle existait depuis longtemps sans nom ici :
        // ses commits devaient donc emprunter le périmètre d'une autre
        // application, ce qui les rendait invisibles à toute lecture par
        // périmètre — `git log --grep` compris.
        'dashboard-manager',
        'ui',
        'contracts',
        'tooling',
        'errors',
        'http',
        'observable',
        'infra',
        'packages',
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always', Infinity],
  },
}
