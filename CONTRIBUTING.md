# Contributing

Thank you for helping improve NoPostNow.

## Before opening a change

- Search existing issues and pull requests.
- Discuss large behavior, data-model, or dependency changes in an issue first.
- Report security vulnerabilities privately as described in `SECURITY.md`.
- Do not submit secrets, private user data, generated Firebase state, or
  production database exports.

## Development

1. Fork the repository and create a focused branch.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` or run `npm run setup:firebase`.
4. Use a disposable Firebase development project, not production.
5. Make the smallest coherent change and add documentation where needed.
6. Run `npm run check`.

## Pull requests

Explain what changed, why it changed, how it was tested, and any security,
privacy, rules, index, or migration impact. Screenshots are useful for visual
changes, but remove personal information first.

By contributing, you agree that your contribution is licensed under the MIT
License.
