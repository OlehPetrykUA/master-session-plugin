import { expect, test } from 'claude-code/testing'

import { glyph } from '../../theme/icons'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { Block } from './Block'
import { NameBlock } from './NameBlock'
import { StatusBlock } from './StatusBlock'

type Node = { type?: string; props?: { [name: string]: unknown }; children?: unknown }

const ui = { Box: 'Box', Text: 'Text', Button: 'Button', Svg: 'Svg' } as unknown as Ui

const nodesOf = (node: unknown): Node[] => (Array.isArray(node) ? node.flatMap(nodesOf) : node && typeof node === 'object' ? [node as Node, ...nodesOf((node as Node).children)] : [])

const find = (tree: unknown, key: string) => nodesOf(tree).find(node => node.props?.key === key)

const texts = (tree: unknown) => nodesOf(tree).filter(node => node.type === 'Text')

const textOf = (node: Node | undefined) => String(node?.children ?? '')

test('Block keeps its look by default: inset ground, muted label glyph and label', () => {
  const block = find(Block(ui, { id: 'b', icon: 'now', label: 'Task', children: [] }), 'b')
  expect(block?.props?.backgroundColor).toBe(C.inset)
  const parts = nodesOf(block)
  expect(parts.find(node => node.type === 'Svg')?.props?.source).toBe(glyph('now', 14, 'muted', 2))
  expect(parts.find(node => node.type === 'Text')?.props?.color).toBe(C.muted)
})

test('Block takes a glyph tone, and isAlert puts it on the red tint with the label in the text colour', () => {
  const block = find(Block(ui, { id: 'b', icon: 'needs', label: 'Status', tone: 'red', isAlert: true, children: [] }), 'b')
  expect(block?.props?.backgroundColor).toBe(C.redTint)
  const parts = nodesOf(block)
  expect(parts.find(node => node.type === 'Svg')?.props?.source).toBe(glyph('needs', 14, 'red', 2))
  expect(parts.find(node => node.type === 'Text')?.props?.color).toBe(C.text)
})

test('NameBlock shows a 300-character name whole, wrapping and never cut, with its ident line under it', () => {
  const full = `Researcher · ${'x'.repeat(300)}`
  const tree = NameBlock(ui, { id: 's1', icon: 'session', name: { full, ident: 'subagent master-session:researcher' } })
  expect(find(tree, 'name-s1')?.props?.backgroundColor).toBe(C.inset)
  const [, name, ident] = texts(tree)
  expect([textOf(name), name?.props?.wrap, name?.props?.weight]).toEqual([full, 'wrap', 'semibold'])
  expect([textOf(ident), ident?.props?.wrap, ident?.props?.mono, ident?.props?.color]).toEqual(['subagent master-session:researcher', 'wrap', true, C.muted])
  expect(JSON.stringify(tree)).not.toContain('…')
})

test('StatusBlock draws the sentence wrapped, with the glyph and tone of its state word', () => {
  const tree = StatusBlock(ui, { id: 's1', status: 'queued', sentence: { text: 'Waiting for the go.', isAlert: false } })
  const block = find(tree, 'status-s1')
  expect(block?.props?.backgroundColor).toBe(C.inset)
  const [, text] = texts(tree)
  expect([textOf(text), text?.props?.wrap]).toEqual(['Waiting for the go.', 'wrap'])
  expect(nodesOf(block).find(node => node.type === 'Svg')?.props?.source).toBe(glyph('clock', 14, 'amber', 2))
  const idle = StatusBlock(ui, { id: 's1', status: 'idle', sentence: { text: 'Idle for 5m.', isAlert: false } })
  expect(nodesOf(idle).find(node => node.type === 'Svg')?.props?.source).toBe(glyph('idle', 14, 'grey', 2))
})

test('StatusBlock puts needs you, failed and a risk on the red tint', () => {
  for (const [status, isAlert] of [['needs', true], ['failed', true], ['working', true], ['working', false]] as const) {
    const block = find(StatusBlock(ui, { id: 'x', status, sentence: { text: 'T.', isAlert } }), 'status-x')
    expect([status, isAlert, block?.props?.backgroundColor]).toEqual([status, isAlert, isAlert ? C.redTint : C.inset])
  }
})
