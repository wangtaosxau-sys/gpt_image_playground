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

function createEmptyFormState(): PromptFormState {
  return {
    title: '',
    description: '',
    prompt: '',
    category: '未分类',
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
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">分类</span>
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

function formatTime(ts?: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('zh-CN')
}

export default function PromptLibraryView() {
  const promptLibraryItems = useStore((s) => s.promptLibraryItems)
  const createPromptLibraryItem = useStore((s) => s.createPromptLibraryItem)
  const updatePromptLibraryItem = useStore((s) => s.updatePromptLibraryItem)
  const deletePromptLibraryItem = useStore((s) => s.deletePromptLibraryItem)
  const usePromptLibraryItem = useStore((s) => s.usePromptLibraryItem)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const activeItems = promptLibraryItems.filter((item) => !item.isArchived)
    if (!q) return activeItems
    return activeItems.filter((item) => [
      item.title,
      item.description ?? '',
      item.prompt,
      item.category,
      item.tags.join(' '),
    ].join(' ').toLowerCase().includes(q))
  }, [promptLibraryItems, query])

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

  const categories = useMemo(() => Array.from(new Set(promptLibraryItems.map((item) => item.category))).filter(Boolean).slice(0, 8), [promptLibraryItems])

  const handleCreate = async (state: PromptFormState) => {
    const item = await createPromptLibraryItem({
      title: state.title,
      description: state.description,
      prompt: state.prompt,
      category: state.category || '未分类',
      tags: parseTags(state.tags),
      notes: state.notes,
      source: 'user',
    })
    if (item) {
      setSelectedId(item.id)
      setCreating(false)
    }
  }

  const handleUpdate = async (item: PromptLibraryItem, state: PromptFormState) => {
    await updatePromptLibraryItem(item.id, {
      title: state.title,
      description: state.description,
      prompt: state.prompt,
      category: state.category || '未分类',
      tags: parseTags(state.tags),
      notes: state.notes,
    })
    setEditingId(null)
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

  const editingItem = editingId ? promptLibraryItems.find((item) => item.id === editingId) ?? null : null

  return (
    <main className="safe-area-x mx-auto max-w-7xl pb-12">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">提示词图库</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">保存好用的提示词和生成样图，使用时回填到 Gallery。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true)
            setEditingId(null)
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <PlusIcon className="h-4 w-4" />
          新建提示词
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题、提示词、标签、分类"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
        />
        {categories.length > 0 && (
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:max-w-[42%]">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setQuery(category)}
                className="shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:border-gray-300 hover:text-gray-800 dark:border-white/[0.08] dark:text-gray-400 dark:hover:text-gray-200"
              >
                {category}
              </button>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">新建提示词</div>
          <PromptEditor
            initial={createEmptyFormState()}
            submitLabel="保存"
            onCancel={() => setCreating(false)}
            onSubmit={(state) => void handleCreate(state)}
          />
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <section className="min-w-0">
          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
              没有找到提示词
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id)
                    setEditingId(null)
                    setCreating(false)
                  }}
                  className={`group overflow-hidden rounded-xl border bg-white text-left transition dark:bg-white/[0.03] ${
                    selectedItem?.id === item.id
                      ? 'border-gray-900 shadow-sm dark:border-white/60'
                      : 'border-gray-200 hover:border-gray-300 dark:border-white/[0.08] dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex min-h-[132px]">
                    <div className="h-auto w-28 shrink-0 sm:w-32">
                      <PromptThumbnail imageId={item.coverImageId ?? item.imageIds[0]} />
                    </div>
                    <div className="min-w-0 flex-1 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{item.category}</span>
                        {item.source === 'builtin' && <span className="text-[11px] text-blue-500">内置</span>}
                      </div>
                      <div className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-white">{item.title}</div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{item.description || item.prompt}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-400 dark:bg-white/[0.04] dark:text-gray-500">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
          {!selectedItem ? (
            <div className="flex min-h-[360px] items-center justify-center text-sm text-gray-400 dark:text-gray-500">
              选择一条提示词查看详情
            </div>
          ) : editingItem ? (
            <>
              <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">编辑提示词</div>
              <PromptEditor
                initial={formStateFromItem(editingItem)}
                submitLabel="保存修改"
                onCancel={() => setEditingId(null)}
                onSubmit={(state) => void handleUpdate(editingItem, state)}
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{selectedItem.category}</span>
                    {selectedItem.imageIds.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500">{selectedItem.imageIds.length} 张样图</span>}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedItem.title}</h3>
                  {selectedItem.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedItem.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => handleCopy(selectedItem)} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.06] dark:hover:text-gray-200" title="复制">
                    <CopyIcon className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setEditingId(selectedItem.id)} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.06] dark:hover:text-gray-200" title="编辑">
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(selectedItem)} className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" title="删除">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {selectedItem.imageIds.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {selectedItem.imageIds.map((imageId) => (
                    <button
                      key={imageId}
                      type="button"
                      onClick={() => useStore.getState().setLightboxImageId(imageId, selectedItem.imageIds)}
                      className="aspect-square overflow-hidden rounded-lg border border-gray-100 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.04]"
                    >
                      <PromptThumbnail imageId={imageId} />
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
                <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">提示词</div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-200">{selectedItem.prompt}</p>
              </div>

              {selectedItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedItem.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{tag}</span>
                  ))}
                </div>
              )}

              {selectedItem.notes && (
                <div className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {selectedItem.notes}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-xs text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
                <span>{selectedItem.source === 'task' ? '来自任务' : selectedItem.source === 'builtin' ? '内置示例' : '手动创建'} · 使用 {selectedItem.useCount} 次{selectedItem.lastUsedAt ? ` · 最近 ${formatTime(selectedItem.lastUsedAt)}` : ''}</span>
                <button
                  type="button"
                  onClick={() => usePromptLibraryItem(selectedItem.id)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  使用提示词
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
