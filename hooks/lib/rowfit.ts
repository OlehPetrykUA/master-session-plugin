import { gitPill } from '../theme/icons'
import { modelFamilyOf } from './format'
import { dirtyOf } from './git'
import { LH, faceWidth, textWidth } from './layout'
import { displayNameOf, elapsedOfItem, lineOf, oneLine, rowsOf, stepsOfItem, tildeOf } from './list'
import type { Context, RowItem } from './list'
import { whereOf } from './rows'
import { ROW } from './sections'

export const hitPxOf = (height: number, isInCard: boolean) => (isInCard ? Math.max(ROW - 6, height - 8) : height)

export const modelWordOf = (item: RowItem) =>
  modelFamilyOf(item.kind === 'session' ? item.row.live?.model : item.kind === 'archived' ? item.one.model : item.kind === 'subagent' ? item.agent.requestedModel || item.agent.model : item.kind === 'agent' ? item.agent.model : undefined)

export type RowFitInput = { width: number; isNarrow: boolean; home: string; chat?: string; isInCard?: boolean }

export function rowFitOf(item: RowItem, context: Context, input: RowFitInput) {
  const name = displayNameOf(item)
  const line = lineOf(item, context)
  const isNeeds = item.status === 'needs'
  const elapsed = elapsedOfItem(item, context.at)
  const steps = stepsOfItem(item)
  const where = item.kind === 'session' ? whereOf(item.row, context.trees)?.tree : undefined
  const dirty = item.kind === 'session' && where ? dirtyOf(where, item.row.board?.files ?? [], input.home) : 0
  const git = dirty ? gitPill(dirty) : undefined
  const model = modelWordOf(item)
  const modelWidth = model ? 4 + 4 + 12 + 4 + textWidth(model, 12) : 0
  const isChat = isNeeds && !!input.chat
  const isMeta = !isChat && !input.isNarrow
  const metaWidth = isMeta ? Math.max(elapsed ? 16 + textWidth(elapsed, 12) : 0, item.kind === 'session' && !isNeeds ? (git?.width ?? 0) + 4 + 14 : 0) : 0
  const base = input.width - 2 - 12 - 4 - 28 - 12 - 24 - 12 - (metaWidth ? metaWidth + 12 : 0) - (steps && !isChat ? 34 + 12 : 0)
  const chatWidth = (isIcon: boolean) => (isChat ? (isIcon ? 32 : faceWidth(input.chat ?? '', 'b32') + 1) + 12 : 0)
  const personaWidth = textWidth(name.persona, 14, { isBold: true }) + (name.task ? 8 + textWidth('·', 14) : 0)
  const [shown = ''] = isChat && name.task ? rowsOf(name.task, base - chatWidth(false) - personaWidth - modelWidth, 14, 1) : []
  const isChatIcon = input.isNarrow || (shown !== oneLine(name.task) && Array.from(shown).length - 1 < 12)
  const column = base - chatWidth(isChatIcon)
  const ask = isNeeds ? rowsOf(tildeOf(line.text, input.home), column - 16, 12, 2, { isBold: true }) : []
  const askPx = 16 * Math.max(1, ask.length)
  const nameLines = input.isInCard
    ? Math.max(rowsOf(oneLine(name.persona), column - modelWidth, 14, 12, { isBold: true }).length, name.task ? rowsOf(oneLine(name.task), column - modelWidth - personaWidth, 14, 12).length : 1)
    : 1
  const wrapped = (Math.max(1, nameLines) - 1) * LH
  const height = wrapped + (isNeeds ? Math.max(ROW, 2 + 16 + 20 + 2 + (line.chain ? 16 + 2 + askPx : askPx)) : ROW)
  return { name, line, model, isNeeds, elapsed, steps, where, dirty, git, isChatIcon, isPersonaCut: !input.isInCard && personaWidth + modelWidth > column, ask, height }
}
