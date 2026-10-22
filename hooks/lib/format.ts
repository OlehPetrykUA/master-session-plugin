export function spanOf(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export const agoOf = (ms: number) => (ms < 60_000 ? 'just now' : `${spanOf(ms)} ago`)

export function compactOf(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const updatedOf = (ms: number) => (ms < 5_000 ? 'updated just now' : ms < 60_000 ? `updated ${Math.floor(ms / 1_000)}s ago` : `updated ${compactOf(ms)} ago`)

export const modelOf = (model: string | undefined, effort: string | undefined) => {
  const family = model?.replace(/^claude-/, '').split('-')[0]
  return [family, effort].filter(Boolean).join(' · ')
}

export const shortOf = (name: string) => (/^~\/[^/]+$/.test(name) ? name : ((name.split('/').at(-1) ?? name).split('-').at(-1) ?? name))
