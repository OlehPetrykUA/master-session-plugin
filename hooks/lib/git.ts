import type { Repo, Worktree } from '../../types'

export function parseWorktrees(porcelain: string) {
  return porcelain
    .split('\n\n')
    .map(block => block.split('\n').filter(Boolean))
    .filter(lines => lines[0]?.startsWith('worktree '))
    .map((lines, index) => ({
      path: (lines[0] as string).slice('worktree '.length),
      sha: lines.find(line => line.startsWith('HEAD '))?.slice(5, 12) ?? '',
      branch: lines.find(line => line.startsWith('branch '))?.slice('branch refs/heads/'.length) ?? '',
      isMain: index === 0,
      isBare: lines.includes('bare'),
    }))
    .filter(tree => !tree.isBare)
}

const pathOf = (line: string) => {
  const fields = line.split(' ')
  if (line.startsWith('1 ')) return fields.slice(8).join(' ')
  if (line.startsWith('2 ')) return (fields.slice(9).join(' ').split('\t')[0] ?? '')
  if (line.startsWith('u ')) return fields.slice(10).join(' ')
  return line.slice(2)
}

export function dirtyOf(tree: { path: string; dirty: number; paths?: readonly string[] }, files: readonly string[], home: string) {
  if (!files.length) return tree.dirty
  const owned = files
    .map(file => (file.startsWith('~/') ? `${home}${file.slice(1)}` : file))
    .map(file => (file.startsWith(`${tree.path}/`) ? file.slice(tree.path.length + 1) : file))
    .map(file => file.replace(/\/+$/, ''))
    .filter(Boolean)
  return (tree.paths ?? []).filter(path => owned.some(file => path === file || path.startsWith(`${file}/`))).length
}

export function parseStatus(porcelain: string) {
  const lines = porcelain.split('\n').filter(Boolean)
  const header = (key: string) => lines.find(line => line.startsWith(`# branch.${key} `))?.slice(`# branch.${key} `.length) ?? ''
  const ab = header('ab').match(/^\+(\d+) -(\d+)$/)
  const paths = lines.filter(line => !line.startsWith('#')).map(pathOf)
  return {
    dirty: paths.length,
    paths,
    upstream: header('upstream'),
    ahead: Number(ab?.[1] ?? 0),
    behind: Number(ab?.[2] ?? 0),
  }
}

export function locate(path: string, repos: readonly Repo[]) {
  let best: { repo: Repo; tree: Worktree } | undefined
  for (const repo of repos) {
    for (const tree of repo.worktrees) {
      const isInside = path === tree.path || path.startsWith(`${tree.path}/`)
      if (isInside && (!best || tree.path.length > best.tree.path.length)) best = { repo, tree }
    }
  }
  return best
}

export const isRepoClean = (repo: Repo) => repo.worktrees.every(tree => !tree.dirty && !tree.ahead && !tree.behind)

export const expandHome = (path: string, home: string) => (path === '~' ? home : path.replace(/^~\//, `${home}/`))
