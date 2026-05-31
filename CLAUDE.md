<!-- ooo:START -->
<!-- ooo:VERSION:0.40.0 -->
# Ouroboros — Specification-First AI Development

> Before telling AI what to build, define what should be built.
> As Socrates asked 2,500 years ago — "What do you truly know?"
> Ouroboros turns that question into an evolutionary AI workflow engine.

Most AI coding fails at the input, not the output. Ouroboros fixes this by
**exposing hidden assumptions before any code is written**.

1. **Socratic Clarity** — Question until ambiguity ≤ 0.2
2. **Ontological Precision** — Solve the root problem, not symptoms
3. **Evolutionary Loops** — Each evaluation cycle feeds back into better specs

```
Interview → Seed → Execute → Evaluate
    ↑                           ↓
    └─── Evolutionary Loop ─────┘
```

## ooo Commands

Each command loads its agent/MCP on-demand. Details in each skill file.

| Command | Loads |
|---------|-------|
| `ooo` | — |
| `ooo interview` | `ouroboros:socratic-interviewer` |
| `ooo seed` | `ouroboros:seed-architect` |
| `ooo run` | MCP required |
| `ooo evolve` | MCP: `evolve_step` |
| `ooo evaluate` | `ouroboros:evaluator` |
| `ooo unstuck` | `ouroboros:{persona}` |
| `ooo status` | MCP: `session_status` |
| `ooo setup` | — |
| `ooo help` | — |

## Agents

Loaded on-demand — not preloaded.

**Core**: socratic-interviewer, ontologist, seed-architect, evaluator,
wonder, reflect, advocate, contrarian, judge
**Support**: hacker, simplifier, researcher, architect
<!-- ooo:END -->

## Code style

### Comment style — match the platform, not the cross-cutting tool
Use the doc-comment syntax native to each language. Never carry one platform's style into another, and never leave AI-tool context in source.

- **Swift (`ios/`, `iosTests/`)** — DocC `///` (triple-slash) on every line for doc comments. Do **not** use `/** … */`. Plain inline notes use `//`.
- **Kotlin (`android/src/.../*.kt`)** — KDoc `/** … */` for doc comments, single-line `/** … */` for short ones. Plain inline notes use `//`.
- **TypeScript (`src/**`)** — JSDoc `/** … */` for exported symbols. Plain inline notes use `//`.

### Section markers — only the platform-native form
Do not use box-drawing characters (`─`, `━`, `═`, etc.) to draw long horizontal section separators in source files. And do not carry one language's folding marker into another. Section markers are platform-specific and the wrong one is dead text in the wrong file.

Allowed forms:
- **Kotlin** (`*.kt`): `// region: <name>` (matches IntelliJ folding). **`// MARK: -` is banned in Kotlin** — it has no effect outside Xcode and only signals the author was thinking in Swift.
- **Swift** (`*.swift`): `// MARK: - <name>` for Xcode navigability. **`// region:` is banned in Swift** — Xcode does not fold it.
- **TypeScript** (`*.ts`, `*.tsx`): no section markers. Plain `// <name>` line at most. Do not invent dividers.

A function/class is its own visual boundary — long divider lines just add noise and break grep. If a file is large enough that it needs internal section markers to navigate, that is usually a sign the file should be split.

### Imports — always at the top of the file, never inline
Reference every external type / class through a normal `import` at the top of the file. Do **not** use fully-qualified names (`foo.bar.Baz`) in the middle of a class body or expression just because there is already an import for a sibling type. Inline FQNs hide dependencies from grep/IDE rename, encourage drift, and look like a workaround for missing imports.

- **Kotlin**: add `import foo.bar.Baz` at the top, then write `Baz` (not `foo.bar.Baz`) in the code.
- **Swift**: same — `import Foo` at the top, then `Foo.Type` (not `Foo.Bar.Baz` qualified through a module).
- **TypeScript**: same — `import { Baz } from 'foo/bar'`, then `Baz`.

If two imports collide on a short name, alias one (`import com.facebook.react.uimanager.ThemedReactContext as RNThemedContext`) rather than inlining the FQN.

### Commit convention
Match the existing history before adding new commits — `git log --oneline -20` shows the prevailing shape. As of this writing the repo uses **Conventional Commits**:

```
type(scope): subject

optional body — explains the WHY, wrapped at ~75 columns, separated by a blank line
```

- **type** — one of `feat`, `fix`, `refactor`, `chore`, `style`, `build`, `docs`, `test`, `perf`. No new types unless the existing set genuinely cannot describe the change.
- **scope** — the affected surface, in parentheses: `ios`, `android`, `example`, `src`, `spec`, `codegen`, `nitro`, `public-api`, `lint`, etc. Pick the smallest scope that's still accurate.
- **subject** — imperative mood, lowercase, no trailing period, ≤ 70 columns. Says *what changed*, not *why*. Example: `feat(android): wire WebChromeClient.onShowFileChooser into ActivityEventListener`.
- **body** (optional) — only for non-obvious changes. Explains the constraint or motivation in plain prose. Past commits use 2–6 line bodies. Example body fragment: `WebView.evaluateJavascript / loadUrl / goBack and friends require the UI thread; the Hybrid spec setters and methods can be invoked from RN's mqt_v_js thread, so wrap each native dispatch in view.post.`

Keep commits **small and single-purpose**. The history already includes one-line commits like `chore(android): add JUnit4 dependency for JVM unit tests` — that's the granularity. A reviewer should be able to read a single subject line and understand exactly what the diff does.

Do not author co-authored-by trailers or AI attribution lines.

### Never leak orchestration context into code or comments
Do **not** write AC, Sub-AC, seed IDs, ouroboros / orchestrator references, interview/session IDs, "Level N" feature-tracking labels, "spec-literal", or any other workflow-tool vocabulary into source files, tests, or comments. The reader of this repo three months from now does not have that context, and these references rot.

Concretely, the following are **banned in source/tests/comments**:
- `AC <N>`, `Sub-AC <N>`, `acceptance criterion`, `acceptance criteria`
- `seed_<hex>`, `interview_<id>`, `orch_<id>`, `qa_<id>`
- "ouroboros", "orchestrator", "the seed", "the spec" (when "the spec" means the seed document, not `src/specs/`)
- "Level 1/2/3/4" used as a workflow-phase marker (Level-of-the-feature versioning is a different thing and is fine if it appears in user-facing docs or release notes)
- "spec-literal", "contract per the seed"

Describe **what the code does and why** in the language native to the platform, with no reference to how the change was orchestrated.
