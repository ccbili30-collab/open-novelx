# NovelX `/study` Framework Status — 2026-07-23

## Implemented

- Added a protected `/study` command and three permission-separated roles: coordinator, bounded source worker and canonical integrator.
- Added a versioned Study materialization ledger at `.novelx/study/materialization.json`, separate from Growth state.
- Added project inventory for text, document, image, audio, video, archive and unknown sources. `.git`, `.novelx`, dependencies and build outputs are excluded.
- Added conservative multilingual source-token estimation and semantic source windows capped at 80,000 estimated tokens.
- A worker reads its assigned source window in contiguous pages of at most 16,000 estimated tokens. The Harness rejects extraction until the full window has been read.
- Added source-bound entity, relation, gap and visual-candidate extraction contracts with hashes, ownership and idempotency gates.
- Added paginated integration output (maximum eight sealed extractions per page) so a large corpus is not returned in one tool result.
- Added deterministic public placement:
  - world dossier: `World/<group>/<title>.md`
  - character dossier: `Characters/<title>.md`
  - story/work index: `Stories/作品档案/<title>.md`
  - reference dossier: `Stories/文献/<group>/<title>.md`
- Original sources cannot be overwritten. Public dossiers require their registered title, all registered sections and an explicit origin for every known gap: `local`, `web`, `inferred`, `generated` or `unknown`.
- Visual candidates are registered as non-blocking `pending` records. Text may reach `text_completed` without waiting for images.
- All Study filesystem mutations use the OpenCode permission request boundary.

## Verification

- `packages/schema`: `bun run typecheck` passed.
- `packages/opencode`: 63 targeted tests passed, 0 failed, 341 assertions after the real run and final prompt hardening.
- `git diff --check` passed; line-ending warnings are repository working-copy warnings, not whitespace errors.
- A real Provider was invoked against `C:\Users\16014\Desktop\诡秘之主完整解析`. Four local Markdown sources became four bounded segments; all four were fully read and sealed.
- The real run reached `text_completed`: 4/4 extractions and 4/4 public dossiers committed. The public projection contains one world dossier, one character dossier, one story/work index and one reference dossier.
- The run registered 29 truthful visual candidates (4 covers, 7 maps, 8 portraits and 10 scenery images). All remain `pending`; no image Provider result is claimed.
- A public-file leakage scan found no Agent, Prompt, session ID, hash, registration or `.novelx` execution language in the four generated dossiers.
- The original four source files retained their byte sizes and modification timestamps.
- A second clean-directory run against `C:\Users\16014\Desktop\诡秘之主-Study演示-20260723` completed in one uninterrupted root session in about 16 minutes. All four Workers sealed on their first structured submission, the integrator committed 4/4 dossiers, the coordinator closed the run, and 23 visual candidates remained pending. No manual session resume or artifact editing was used.
- Full OpenCode typecheck is currently blocked by an unrelated concurrent change in `test/session/compaction.test.ts` where `MessageV2.Info` is accessed as if every variant has `error`.

## Not implemented / not Live

- PDF, EPUB, Office, OCR, audio transcription and video-frame/transcript adapters are not implemented. Those sources fail closed as `adapter_required`; they are never represented as parsed.
- Web enrichment currently uses the integrator's bounded `websearch`/`webfetch` permissions and persists each gap's origin/URL in the Study ledger. A dedicated research cache and fetched-content fingerprint are not implemented.
- Study visual records are not yet submitted into the existing map/scenery, portrait and cover workers. They remain truthful `pending` records.
- There is no Study-specific renderer progress panel or streaming public-file lock projection yet.
- Incremental re-study and cross-session adoption/migration are not implemented. The current owner session may resume its ledger; another session fails closed.
- The text-only multi-segment route is now Live for this Markdown corpus. This does not establish Live support for unsupported source adapters, visual generation, renderer progress, incremental re-study or arbitrary corpora.

## Real-run corrections and limits

- A missing first-run ledger was previously raised as a synchronous defect, so `novelx_start_study` incorrectly behaved as though initialization required an existing ledger. The loader now has an explicit optional first-run path while corrupt ledgers still fail closed.
- Legacy `.novax` state is excluded from source inventory, preventing an old workspace database from being treated as Study material.
- The Worker prompt now mirrors deterministic submission constraints: relation/gap/visual keys must bind to entities in the same extraction, evidence IDs must match the assigned segment, and aliases are capped at 16. This avoids expensive full-object retransmission for predictable contract violations without weakening validation.
- The integrator is explicitly forbidden from closing the root run. `novelx_finish_study` remains the coordinator's responsibility.
- Generic CLI resume does not infer a hidden child Agent when `--agent` is omitted. The real run completed through its original root session; manual child-session resumption is not a supported product recovery route and remains a separate design item.

## Recovery entry

Continue from `docs/plans/2026-07-23-novelx-study-materialization.md`. The next safe batch is renderer progress/file-lock projection and Study visual-queue dispatch. Additional source adapters remain separate fail-closed work.
