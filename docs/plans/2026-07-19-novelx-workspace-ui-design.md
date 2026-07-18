# NovelX workspace UI first batch

## Scope

This batch turns the OpenCode session surface into the first NovelX workspace shell without changing the OpenCode server, Provider, Runtime, public protocol, or persistence model.

- Left pane: a real new-task action, the primary Agents exposed by the current project, and root project sessions from the current directory sync.
- Center pane: the existing OpenCode conversation, composer, streaming, permission, tool, and session lifecycle UI remains authoritative.
- Right pane: the existing project file browser gains a Files/World switch. World is a projection of the real `World/**` directory and opens files through the same file tabs as Files.

## Data flow and truth boundaries

`useLocal().agent` remains the authority for Agent selection. `useSync().data.session` remains the current project's loaded session list. `useTabs()` creates drafts and selects session tabs. `useFile().tree` remains the only file-tree source for both Files and World.

World is not a second database and does not claim that a Growth run, image generation, Canon write, or Change Set has completed. Missing `World` content is shown as an empty state; file-list failures remain failures and are not replaced with fixtures.

## Interaction and layout

The center conversation is the primary surface. The left pane is supporting navigation, can collapse to a rail, and is omitted below the existing desktop breakpoint where OpenCode's current project/session and composer controls remain available. The right pane keeps its existing resize and visibility controls. Switching Files/World does not discard open file tabs or modify the persisted Changes/All filter.

## Acceptance

- New Task creates and navigates to a real draft for the current server and directory.
- Selecting an Agent updates the same state used by the composer.
- Selecting a project session opens the real session tab; archived and child sessions are excluded.
- Files preserves Changes/All behavior.
- World lists only the real `World/**` tree and opens files through existing file tabs.
- App unit tests, App/Desktop type checks, App production build, and a real rendered visual check pass before commit.

## Explicitly deferred

Brand-wide renaming, updater/protocol changes, World schema enforcement, domain cards, Growth orchestration, image generation, and a real Provider end-to-end run are not part of this batch.
