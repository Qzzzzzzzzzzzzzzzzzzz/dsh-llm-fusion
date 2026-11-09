/**
 * Merged browser half of `dsh-llm-fusion`.
 *
 * Both engines are registered as sibling loader entries in
 * `cordis.patch.yml`, and each keeps the settings namespace it always had
 * (`opencode-go`, `protocom-api`). DSH loads ONE client module per package, so
 * this entry wires both engines' client plugins into that single module: the
 * OpenCode Go section with its usage pill and analytics dialog, and the
 * Protocom / Command Code / ClinePass sections with Fusion.
 *
 * The two `inject` lists are unioned: an engine that needs an extra service
 * keeps working, and a deployment that lacks one still loads the rest of the
 * bundle through cordis' per-service deactivation of the owning plugin.
 *
 * @module dsh-llm-fusion/client
 */

import { apply as applyGo, inject as goInject } from '../engines/opencode-go/client/index.ts'
import { apply as applyProtocom, inject as protocomInject } from '../engines/protocom/client/index.ts'

/** The client root, as both engines declare it (structurally identical). */
type ClientRoot = Parameters<typeof applyGo>[0]

/**
 * Services either engine needs. `remote.settings` is Protocom's;
 * `remote.llm` is shared.
 */
export const inject = [...new Set([...protocomInject, ...goInject, 'remote.settings'])]

/**
 * Install both client halves on one client context.
 *
 * The guard exists because a package that inserts two child entries can be
 * asked for its client module once per child; registering both halves twice
 * would double every slot declaration.
 * @param ctx - the DSH client root context.
 */
export function apply(ctx: ClientRoot): void {
  const key = Symbol.for('dsh-llm-fusion.client.applied')
  const marked = ctx as ClientRoot & Record<symbol, boolean | undefined>
  if (marked[key] === true) return
  marked[key] = true
  applyGo(ctx)
  applyProtocom(ctx)
}
