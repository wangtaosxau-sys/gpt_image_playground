import { useEffect, useMemo, useState } from 'react'
import type { PromptLibraryItem } from '../types'
import { ensureImageThumbnailCached, subscribeImageThumbnail, useStore } from '../store'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { CopyIcon, EditIcon, PhotoIcon, PlusIcon, TrashIcon } from './icons'

type PromptFormState = {
  title: string
  description: string
  prompt: string
  category: string
  tags: string
  notes: string
}

const ALL_FILTER = '__all__'
const UNCATEGORIZED = '未分类'

function createEmptyFormState(): PromptFormState {
  return {
    title: '',
    description: '',
    prompt: '',
    category: UNCATEGORIZED,
    tags: '',
    notes: '',
  }
}

function formStateFromItem(item: PromptLibraryItem): PromptFormState {
  return {
    title: item.title,
    description: item.description ?? '',
    prompt: item.prompt,
    category: item.category,
    tags: item.tags.join(', '),
    notes: item.notes ?? '',
  }
}

function parseTags(value: string) {
  return Array.from(new Set(value.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean)))
}

function PromptThumbnail({ imageId, className = '' }: { imageId?: string; className?: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    setSrc('')
    if (!imageId) return
    let cancelled = false
    const unsubscribe = subscribeImageThumbnail(imageId, (thumbnail) => {
      if (!cancelled) setSrc(thumbnail.dataUrl)
    })
    ensureImageThumbnailCached(imageId).then((thumbnail) => {
      if (!cancelled && thumbnail) setSrc(thumbnail.dataUrl)
    }).catch(() => {})
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [imageId])

  if (src) return <img src={src} alt="" className={`h-full w-full object-cover ${className}`} />
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gray-100 text-gray-300 dark:bg-white/[0.04] dark:text-gray-600 ${className}`}>
      <PhotoIcon className="h-8 w-8" />
    </div>
  )
}

function PromptEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: PromptFormState
  submitLabel: string
  onCancel: () => void
  onSubmit: (state: PromptFormState) => void
}) {
  const [draft, setDraft] = useState(initial)

  useEffect(() => {
    setDraft(initial)
  }, [initial])

  const update = (patch: Partial<PromptFormState>) => setDraft((current) => ({ ...current, ...patch }))

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(draft)
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">标题</span>
          <input
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">文件夹</span>
          <input
            value={draft.category}
            onChange={(event) => update({ category: event.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">描述</span>
        <input
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">提示词</span>
        <textarea
          value={draft.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          rows={5}
          className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">标签</span>
        <input
          value={draft.tags}
          onChange={(event) => update({ tags: event.target.value })}
          placeholder="用逗号分隔"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">备注</span>
        <textarea
          value={draft.notes}
          onChange={(event) => update({ notes: event.target.value })}
          rows={3}
          className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]">
          取消
        </button>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

function formatRelativeTime(ts?: number) {
  if (!ts) return ''
  const diffMs = Math.max(0, Date.now() - ts)
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / dayMs)
  if (days <= 0) return '今天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `大约 ${Math.max(1, Math.floor(days / 30))} 个月前`
  return `${Math.max(1, Math.floor(days / 365))} 年前`
}

function ActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200/80 bg-white/95 text-gray-500 shadow-sm backdrop-blur transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:bg-gray-900/95 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
    >
      {children}
    </button>
  )
}

export default function PromptLibraryView() {
  const promptLibraryItems = useStore((s) => s.promptLibraryItems)
  const createPromptLibraryItem = useStore((s) => s.createPromptLibraryItem)
  const updatePromptLibraryItem = useStore((s) => s.updatePromptLibraryItem)
  const deletePromptLibraryItem = useStore((s) => s.deletePromptLibraryItem)
  const usePromptLibraryItem = useStore((s) => s.usePromptLibraryItem)
  const usePromptLibraryItemImages = useStore((s) => s.usePromptLibraryItemImages)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const [query, setQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState(ALL_FILTER)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)

  const activeItems = useMemo(() => promptLibraryItems.filter((item) => !item.isArchived), [promptLibraryItems])

  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of activeItems) counts.set(item.category || UNCATEGORIZED, (counts.get(item.category || UNCATEGORIZED) ?? 0) + 1)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 12)
  }, [activeItems])

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of activeItems) {
      for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 18)
  }, [activeItems])

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeItems.filter((item) => {
      if (activeFolder !== ALL_FILTER && item.category !== activeFolder && !item.tags.includes(activeFolder)) return false
      if (!q) return true
      return [
        item.title,
        item.description ?? '',
        item.prompt,
        item.category,
        item.tags.join(' '),
      ].join(' ').toLowerCase().includes(q)
    })
  }, [activeFolder, activeItems, query])

  const selectedItem = useMemo(() => {
    if (!visibleItems.length) return null
    return visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0]
  }, [selectedId, visibleItems])

  useEffect(() => {
    if (!selectedItem) {
      setSelectedId(null)
      return
    }
    if (selectedItem.id !== selectedId) setSelectedId(selectedItem.id)
  }, [selectedId, selectedItem])

  const handleCreate = async (state: PromptFormState) => {
    const item = await createPromptLibraryItem({
      title: state.title,
      description: state.description,
      prompt: state.prompt,
      category: state.category || UNCATEGORIZED,
      tags: parseTags(state.tags),
      notes: state.notes,
      source: 'user',
    })
    if (item) {
      setSelectedId(item.id)
      setCreating(false)
      setActiveFolder(item.category)
    }
  }

  const handleUpdate = async (item: PromptLibraryItem, state: PromptFormState) => {
    await updatePromptLibraryItem(item.id, {
      title: state.title,
      description: state.description,
      prompt: state.prompt,
      category: state.category || UNCATEGORIZED,
      tags: parseTags(state.tags),
      notes: state.notes,
    })
    setEditingId(null)
    setActiveFolder(state.category || UNCATEGORIZED)
  }

  const handleDelete = (item: PromptLibraryItem) => {
    setConfirmDialog({
      title: '删除提示词',
      message: `确定要删除「${item.title}」吗？图库独占引用的图片会一起清理。`,
      confirmText: '删除',
      cancelText: '取消',
      action: () => {
        void deletePromptLibraryItem(item.id)
      },
    })
  }

  const handleCopy = async (item: PromptLibraryItem) => {
    try {
      await copyTextToClipboard(item.prompt)
      showToast('提示词已复制', 'success')
    } catch (error) {
      showToast(getClipboardFailureMessage('复制提示词失败', error), 'error')
    }
  }

  const handleUseImages = (item: PromptLibraryItem) => {
    void usePromptLibraryItemImages(item.id)
  }

  const handleUsePrompt = (item: PromptLibraryItem) => {
    usePromptLibraryItem(item.id)
  }

  const editingItem = editingId ? promptLibraryItems.find((item) => item.id === editingId) ?? null : null

  return (
    <main className="safe-area-x mx-auto max-w-7xl pb-12">
      <div className="px-0 py-5">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">提示词图库</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                {visibleItems.length} / {activeItems.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">保存好用的提示词和生成样图，使用时回填到 Gallery。</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-2xl">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、提示词、标签、文件夹"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                setCreating(true)
                setEditingId(null)
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              <PlusIcon className="h-4 w-4" />
              新建
            </button>
          </div>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveFolder(ALL_FILTER)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeFolder === ALL_FILTER
                ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            全部
          </button>
          {folders.map(([folder, count]) => (
            <button
              key={folder}
              type="button"
              onClick={() => setActiveFolder(folder)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeFolder === folder
                  ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {folder}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveFolder(tag)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeFolder === tag
                  ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400/60 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              #{tag}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
        </div>

        {creating && (
          <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">新建提示词</div>
            <PromptEditor
              initial={createEmptyFormState()}
              submitLabel="保存"
              onCancel={() => setCreating(false)}
              onSubmit={(state) => void handleCreate(state)}
            />
          </section>
        )}

        {editingItem && (
          <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">编辑提示词</div>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]">
                收起
              </button>
            </div>
            <PromptEditor
              initial={formStateFromItem(editingItem)}
              submitLabel="保存修改"
              onCancel={() => setEditingId(null)}
              onSubmit={(state) => void handleUpdate(editingItem, state)}
            />
          </section>
        )}

        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 py-16 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-500">
            没有找到提示词
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => {
              const hasImages = item.imageIds.length > 0
              const primaryImageId = item.coverImageId ?? item.imageIds[0]
              return (
                <article
                  key={item.id}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId((current) => current === item.id ? null : current)}
                  onFocus={() => setHoveredItemId(item.id)}
                  onClick={() => {
                    setSelectedId(item.id)
                    setCreating(false)
                  }}
                  className={`group cursor-pointer overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:bg-gray-900 ${
                    selectedItem?.id === item.id
                      ? 'border-gray-900 ring-1 ring-gray-900/10 dark:border-white/50 dark:ring-white/10'
                      : 'border-gray-200 dark:border-white/[0.08] dark:hover:border-white/20'
                  }`}
                >
                  {hasImages && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        useStore.getState().setLightboxImageId(primaryImageId, item.imageIds)
                      }}
                      className="relative block aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-800"
                      aria-label="查看参考图"
                    >
                      <PromptThumbnail imageId={primaryImageId} />
                      {item.imageIds.length > 1 && (
                        <span className="absolute right-3 top-3 rounded-full bg-gray-900/70 px-2 py-1 text-xs text-white backdrop-blur">{item.imageIds.length} 图</span>
                      )}
                    </button>
                  )}
                  <div className="relative p-4">
                    <div className={`absolute right-3 top-3 flex gap-2 opacity-100 transition sm:pointer-events-auto ${hoveredItemId === item.id ? 'sm:opacity-100' : 'sm:opacity-80'}`}>
                      <ActionButton label="使用提示词" onClick={() => handleUsePrompt(item)}>
                        <span className="text-base leading-none">✦</span>
                      </ActionButton>
                      <ActionButton label="使用参考图" disabled={!hasImages} onClick={() => handleUseImages(item)}>
                        <PhotoIcon className="h-4 w-4" />
                      </ActionButton>
                      <ActionButton label="复制提示词" onClick={() => { void handleCopy(item) }}>
                        <CopyIcon className="h-4 w-4" />
                      </ActionButton>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2 pr-28">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{item.category}</span>
                      {item.source === 'builtin' && <span className="text-[11px] text-blue-500 dark:text-blue-400">内置</span>}
                    </div>
                    <h3 className="pr-2 text-base font-semibold leading-snug text-gray-900 dark:text-white">{item.title}</h3>
                    <p className="mt-2 line-clamp-3 min-h-[3.9rem] text-sm leading-relaxed text-gray-500 dark:text-gray-400">{item.description || item.prompt}</p>
                    {item.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-400 dark:bg-white/[0.04] dark:text-gray-500">#{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
                      <span>使用 {item.useCount} 次 · {formatRelativeTime(item.lastUsedAt || item.updatedAt || item.createdAt)}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditingId(item.id)
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                          title="编辑"
                          aria-label="编辑"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleDelete(item)
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                          title="删除"
                          aria-label="删除"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
