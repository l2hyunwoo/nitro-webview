# Changesets

For a change that needs a release, run `yarn changeset` from the repository root.
Select `nitro-webview`, choose patch, minor, or major, and describe the user-visible change.
Commit the generated Markdown file with your change.
Documentation and CI-only changes do not need a changeset.

Run `yarn changeset status` to review pending releases.

Maintainers run the **Release** workflow from `main` after merging changesets.
Use `dry_run=true` to validate the release without publishing.
The workflow consumes changesets, updates `package.json` and `CHANGELOG.md`, and creates the release commit.
It stops if no changeset updates the package version.
After all checks pass, it pushes the commit and tag, publishes the verified archive, and creates the GitHub release.
GitHub release notes include the new changelog entry.

`yarn version-packages` previews versioning locally. Do not commit that preview before running Release.
The Release workflow performs versioning itself. Do not run `changeset publish`, which bypasses the release checks.

See the [Changesets guide](https://changesets.dev/guide/getting-started) for more information.
