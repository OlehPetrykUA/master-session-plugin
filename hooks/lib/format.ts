export function compactOf(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const updatedOf = (ms: number) => (ms < 5_000 ? 'updated just now' : ms < 60_000 ? `updated ${Math.floor(ms / 1_000)}s ago` : `updated ${compactOf(ms)} ago`)

export const modelFamilyOf = (model: string | undefined) => (model ? (model.replace(/^claude-/, '').split('-')[0] ?? model) : '')

export const modelOf = (model: string | undefined, effort: string | undefined) => [modelFamilyOf(model), effort].filter(Boolean).join(' · ')

export const shortOf = (name: string) => (/^~\/[^/]+$/.test(name) ? name : ((name.split('/').at(-1) ?? name).split('-').at(-1) ?? name))
