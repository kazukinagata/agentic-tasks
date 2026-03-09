# Contributing to Headless Tasks

Thank you for your interest in contributing to Headless Tasks!

## Getting Started

1. Fork and clone the repository
2. Install dependencies for the view server:
   ```bash
   cd skills/viewing-tasks/server && npm install
   ```
3. Run tests:
   ```bash
   cd skills/viewing-tasks/server && npm test
   ```

## How to Contribute

### Reporting Issues

- Search existing issues before creating a new one
- Include steps to reproduce, expected behavior, and actual behavior
- Mention your environment (OS, Node.js version, Claude Code version)

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes following the coding conventions below
3. If your changes modify `skills/` or `agents/`, bump the version in `.claude-plugin/plugin.json`
4. Run tests to ensure nothing is broken
5. Submit a PR with a clear description of the changes

### Coding Conventions

- **Language**: All natural language in the project (SKILL.md, comments, scripts, docs) must be in **English**
- **Self-contained skills**: Each skill must be self-contained — scripts and resources live within the skill's own directory
- **No cross-references**: Skills must not directly reference another skill's SKILL.md by path. Shared logic should be extracted into shared skills (`user-invocable: false`)
- **Provider-specific logic**: Belongs in `skills/providers/{name}/`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
