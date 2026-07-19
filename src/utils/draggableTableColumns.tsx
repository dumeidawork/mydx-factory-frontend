import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type ThHTMLAttributes } from 'react'
import type { ColumnType, ColumnsType } from 'antd/es/table'

export function normalizeColumnOrder(saved: string[] | null | undefined, defaultOrder: string[]): string[] {
  if (!saved?.length) return defaultOrder
  const known = new Set(defaultOrder)
  const valid = saved.filter((key) => known.has(key))
  const missing = defaultOrder.filter((key) => !valid.includes(key))
  return [...valid, ...missing]
}

export function usePersistedColumnOrder(storageKey: string, defaultOrder: string[]) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return defaultOrder
      return normalizeColumnOrder(JSON.parse(raw) as string[], defaultOrder)
    } catch {
      return defaultOrder
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(order))
    } catch {
      // ignore quota / private mode errors
    }
  }, [storageKey, order])

  const reorder = useCallback((dragKey: string, dropKey: string) => {
    setOrder((prev) => {
      const from = prev.indexOf(dragKey)
      const to = prev.indexOf(dropKey)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, dragKey)
      return next
    })
  }, [])

  return [order, setOrder, reorder] as const
}

export function buildOrderedColumns<T>(
  fixedLeft: ColumnsType<T>,
  middleDefs: ColumnsType<T>,
  fixedRight: ColumnsType<T>,
  order: string[]
): ColumnsType<T> {
  const map = new Map(
    (middleDefs as ColumnType<T>[]).map((col) => {
      const key = String(col.key ?? col.dataIndex ?? '')
      return [key, col]
    })
  )
  const middle = order.map((key) => map.get(key)).filter(Boolean) as ColumnsType<T>
  return [...fixedLeft, ...middle, ...fixedRight]
}

export type DraggableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  columnKey?: string
  draggableKeys?: string[]
  onReorder?: (dragKey: string, dropKey: string) => void
  dragHandleClassName?: string
  dropTargetClassName?: string
}

export function DraggableHeaderCell({
  columnKey,
  draggableKeys,
  onReorder,
  dragHandleClassName,
  dropTargetClassName,
  children,
  className,
  ...restProps
}: DraggableHeaderCellProps) {
  const dragKeyRef = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState(false)

  const isDraggable = !!columnKey && !!draggableKeys?.includes(columnKey)

  const handleDragStart = (event: DragEvent<HTMLSpanElement>) => {
    if (!columnKey) return
    dragKeyRef.current = columnKey
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', columnKey)
    event.currentTarget.closest('th')?.classList.add('table-column-dragging')
  }

  const handleDragEnd = (event: DragEvent<HTMLSpanElement>) => {
    dragKeyRef.current = null
    setDropTarget(false)
    event.currentTarget.closest('th')?.classList.remove('table-column-dragging')
  }

  const handleDragOver = (event: DragEvent<HTMLTableCellElement>) => {
    if (!isDraggable) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(true)
  }

  const handleDragLeave = () => {
    setDropTarget(false)
  }

  const handleDrop = (event: DragEvent<HTMLTableCellElement>) => {
    if (!isDraggable || !columnKey) return
    event.preventDefault()
    setDropTarget(false)
    const dragKey = event.dataTransfer.getData('text/plain') || dragKeyRef.current
    if (dragKey && dragKey !== columnKey) {
      onReorder?.(dragKey, columnKey)
    }
  }

  return (
    <th
      {...restProps}
      className={[className, dropTarget ? dropTargetClassName : ''].filter(Boolean).join(' ')}
      onDragOver={isDraggable ? handleDragOver : undefined}
      onDragLeave={isDraggable ? handleDragLeave : undefined}
      onDrop={isDraggable ? handleDrop : undefined}
    >
      {isDraggable ? (
        <span className={dragHandleClassName} draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {children}
        </span>
      ) : (
        children
      )}
    </th>
  )
}

export function withDraggableHeaderCells<T>(
  columns: ColumnsType<T>,
  draggableKeys: string[],
  onReorder: (dragKey: string, dropKey: string) => void
): ColumnsType<T> {
  return columns.map((col) => {
    const typedCol = col as ColumnType<T>
    const columnKey = String(typedCol.key ?? typedCol.dataIndex ?? '')
    return {
      ...col,
      onHeaderCell: () =>
        ({
          columnKey,
          draggableKeys,
          onReorder,
        }) as HTMLAttributes<HTMLTableCellElement>,
    }
  })
}
