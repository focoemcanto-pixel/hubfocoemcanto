'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type VoiceStudioCommandCategory =
  | 'recording'
  | 'tracks'
  | 'editing'
  | 'mixer'
  | 'export'
  | 'studio'
  | 'custom'

export type VoiceStudioCommand = {
  id: string
  label: string
  description?: string
  category: VoiceStudioCommandCategory
  keywords?: string[]
  shortcut?: string[]
  disabled?: boolean
  hidden?: boolean
  icon?: string
  run: () => void | Promise<void>
}

type VoiceStudioCommandPaletteProps = {
  commands: VoiceStudioCommand[]
  open?: boolean
  defaultOpen?: boolean
  placeholder?: string
  emptyMessage?: string
  recentLimit?: number
  onOpenChange?: (open: boolean) => void
  onCommandRun?: (command: VoiceStudioCommand) => void
  onCommandError?: (command: VoiceStudioCommand, error: unknown) => void
}

const CATEGORY_LABELS: Record<VoiceStudioCommandCategory, string> = {
  recording: 'Gravação',
  tracks: 'Tracks',
  editing: 'Edição',
  mixer: 'Mixer',
  export: 'Exportação',
  studio: 'Studio',
  custom: 'Outros',
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const scoreCommand = (command: VoiceStudioCommand, query: string) => {
  if (!query) return 1

  const normalizedQuery = normalize(query)
  const searchable = normalize(
    [
      command.label,
      command.description,
      CATEGORY_LABELS[command.category],
      ...(command.keywords ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  )

  if (searchable === normalizedQuery) return 100
  if (normalize(command.label).startsWith(normalizedQuery)) return 80
  if (searchable.includes(normalizedQuery)) return 60

  let cursor = 0
  for (const character of searchable) {
    if (character === normalizedQuery[cursor]) cursor += 1
    if (cursor === normalizedQuery.length) return 30
  }

  return 0
}

export function VoiceStudioCommandPalette({
  commands,
  open,
  defaultOpen = false,
  placeholder = 'Digite um comando…',
  emptyMessage = 'Nenhum comando encontrado.',
  recentLimit = 6,
  onOpenChange,
  onCommandRun,
  onCommandError,
}: VoiceStudioCommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const isOpen = open ?? internalOpen

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
      if (!nextOpen) {
        setQuery('')
        setActiveIndex(0)
      }
    },
    [onOpenChange, open],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(!isOpen)
        return
      }

      if (!isOpen || isTyping) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setOpen])

  useEffect(() => {
    if (!isOpen) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

  const visibleCommands = useMemo(() => {
    const recentPosition = new Map(recentIds.map((id, index) => [id, index]))

    return commands
      .filter((command) => !command.hidden)
      .map((command) => ({ command, score: scoreCommand(command, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const aRecent = recentPosition.get(a.command.id)
        const bRecent = recentPosition.get(b.command.id)
        if (aRecent !== undefined && bRecent !== undefined) return aRecent - bRecent
        if (aRecent !== undefined) return -1
        if (bRecent !== undefined) return 1
        return a.command.label.localeCompare(b.command.label, 'pt-BR')
      })
      .map(({ command }) => command)
  }, [commands, query, recentIds])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(visibleCommands.length - 1, 0)))
  }, [visibleCommands.length])

  const runCommand = useCallback(
    async (command: VoiceStudioCommand) => {
      if (command.disabled || runningId) return

      setRunningId(command.id)
      try {
        await command.run()
        setRecentIds((current) => [
          command.id,
          ...current.filter((id) => id !== command.id),
        ].slice(0, recentLimit))
        onCommandRun?.(command)
        setOpen(false)
      } catch (error) {
        onCommandError?.(command, error)
      } finally {
        setRunningId(null)
      }
    },
    [onCommandError, onCommandRun, recentLimit, runningId, setOpen],
  )

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) =>
        visibleCommands.length ? (current + 1) % visibleCommands.length : 0,
      )
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        visibleCommands.length
          ? (current - 1 + visibleCommands.length) % visibleCommands.length
          : 0,
      )
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const command = visibleCommands[activeIndex]
      if (command) void runCommand(command)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <section
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos do Voice Studio"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span aria-hidden="true" className="text-lg text-violet-300">
            ⌘
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            aria-label="Pesquisar comandos"
          />
          <kbd className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-zinc-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2">
          {visibleCommands.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-zinc-500">
              {emptyMessage}
            </div>
          ) : (
            visibleCommands.map((command, index) => {
              const active = index === activeIndex
              const running = runningId === command.id

              return (
                <button
                  key={command.id}
                  type="button"
                  disabled={command.disabled || Boolean(runningId)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void runCommand(command)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    active ? 'bg-violet-500/15 ring-1 ring-violet-400/30' : 'hover:bg-white/5'
                  } ${command.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-base"
                    aria-hidden="true"
                  >
                    {running ? '…' : command.icon ?? '›'}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-100">
                      {command.label}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {command.description ?? CATEGORY_LABELS[command.category]}
                    </span>
                  </span>

                  {command.shortcut?.length ? (
                    <span className="flex shrink-0 gap-1">
                      {command.shortcut.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-zinc-400"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2 text-[10px] text-zinc-500">
          <span>↑↓ navegar · Enter executar · Esc fechar</span>
          <span>{visibleCommands.length} comando(s)</span>
        </footer>
      </section>
    </div>
  )
}
