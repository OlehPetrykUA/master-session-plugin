import { modelFamilyOf } from './format'
import { faceWidth, textWidth } from './layout'
import { displayNameOf, elapsedOfItem, oneLine, rowsOf, stepsOfItem } from './list'
import type { Context, RowItem } from './list'
import { ROW } from './sections'
import { starterOf, stateWordOf } from './status'

export const hitPxOf = (height: number, isInCard: boolean) => (isInCard ? Math.max(ROW - 6, height - 8) : height)

export const modelWordOf = (item: RowItem) =>
  modelFamilyOf(item.kind === 'session' ? item.row.live?.model : item.kind === 'archived' ? item.one.model : item.kind === 'subagent' ? item.agent.requestedModel || item.agent.model : item.kind === 'agent' ? item.agent.model : undefined)

export type RowFitInput = { width: number; isNarrow: boolean; chat?: string; isInCard?: boolean }

export function rowFitOf(item: RowItem, context: Context, input: RowFitInput) {
  const name = displayNameOf(item)
  const word = stateWordOf(item.status)
  const starter = starterOf(item, context)
  const elapsed = elapsedOfItem(item, context.at)
  const steps = stepsOfItem(item)
  const model = modelWordOf(item)
  const modelWidth = model ? 4 + 4 + 12 + (input.isNarrow ? 0 : 4 + textWidth(model, 12)) : 0
  const elapsedWidth = elapsed ? 4 + 12 + 4 + textWidth(elapsed, 12) : 0
  const isChat = item.status === 'needs' && !!input.chat
  const base = input.width - 2 - 12 - 4 - 28 - 12 - 24 - 12 - (steps && !isChat ? 34 + 12 : 0)
  const chatWidth = (isIcon: boolean) => (isChat ? (isIcon ? 32 : faceWidth(input.chat ?? '', 'b32') + 1) + 12 : 0)
  const personaWidth = textWidth(name.persona, 14, { isBold: true }) + (name.task ? 8 + textWidth('·', 14) : 0)
  const [shown = ''] = isChat && name.task ? rowsOf(name.task, base - chatWidth(false) - personaWidth - modelWidth - elapsedWidth, 14, 1) : []
  const isChatIcon = input.isNarrow || (shown !== oneLine(name.task) && Array.from(shown).length - 1 < 12)
  const column = base - chatWidth(isChatIcon)
  return {
    name,
    starter,
    word,
    model,
    elapsed,
    steps,
    isChatIcon,
    isPersonaCut: personaWidth + modelWidth + elapsedWidth > column,
    height: input.isInCard ? ROW - 6 : ROW,
  }
}
