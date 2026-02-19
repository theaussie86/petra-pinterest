---
description: Bump version, push branch, and create a PR for release
---

Automate a release for this project. The release type is: $ARGUMENTS

Follow these steps exactly:

1. **Validate the release type argument.** It must be one of `patch`, `minor`, or `major`. If "$ARGUMENTS" is empty or invalid, ask the user which type they want and stop.

2. **Check git status.** Run `git status --porcelain`. If there are uncommitted changes, warn the user and ask if they want to proceed (changes won't be included in the release commit).

3. **Ensure we're on a feature branch.** Run `git branch --show-current`. If on `main`:
   - First, peek at the current version with `node -p "require('./package.json').version"` and compute what the new version will be (e.g. 1.0.4 → patch → 1.0.5).
   - Create and checkout `release/v<new-version>` (e.g. `release/v1.0.5`).

4. **Run the release script.** Execute `npm run release -- <type>` where `<type>` is the validated argument. This bumps the version in package.json and creates a commit.

5. **Read the new version.** Run `node -p "require('./package.json').version"` to confirm the bumped version string.

6. **Push the branch.** Run `git push -u origin HEAD`.

7. **Create or find the PR.** Check if a PR already exists for this branch with `gh pr list --head <branch> --json number`. If not, create one:
   ```
   gh pr create --title "Release v<version>" --body "Bumps version to v<version>."
   ```

8. **Report the result.** Show the PR URL and remind the user that merging will auto-create the git tag and GitHub Release.
