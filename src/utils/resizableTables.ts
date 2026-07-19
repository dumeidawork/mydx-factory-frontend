const HANDLE_WIDTH = 8
const MIN_COLUMN_WIDTH = 64

let globalTableColumnResizeInstalled = false

type ResizeState = {
  header: HTMLTableCellElement
  col: HTMLTableColElement | null
  table: HTMLTableElement | null
  startX: number
  startWidth: number
}

function findHeaderCell(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLTableCellElement>('.ant-table-thead th.ant-table-cell')
}

function isResizeHandle(pointerX: number, pointerY: number, header: HTMLTableCellElement) {
  if (header.colSpan !== 1) return false
  const rect = header.getBoundingClientRect()
  const distanceFromRight = rect.right - pointerX
  return pointerY >= rect.top && pointerY <= rect.bottom && distanceFromRight >= 0 && distanceFromRight <= HANDLE_WIDTH
}

function getHeaderCol(header: HTMLTableCellElement) {
  const table = header.closest('table')
  if (!table) return { table: null, col: null }
  const index = header.cellIndex + 1
  return {
    table,
    col: table.querySelector<HTMLTableColElement>(`colgroup col:nth-child(${index})`),
  }
}

function applyColumnWidth(state: ResizeState, width: number) {
  const nextWidth = `${Math.max(MIN_COLUMN_WIDTH, width)}px`
  state.header.style.width = nextWidth
  state.header.style.minWidth = nextWidth
  if (state.col) {
    state.col.style.width = nextWidth
    state.col.style.minWidth = nextWidth
  }
  if (state.table) {
    state.table.style.tableLayout = 'fixed'
  }
}

export function installGlobalTableColumnResize() {
  if (globalTableColumnResizeInstalled || typeof window === 'undefined') return
  globalTableColumnResizeInstalled = true

  let resizeState: ResizeState | null = null

  const clearResizeCursor = () => {
    document.documentElement.classList.remove('table-column-resizing')
    document.body.style.cursor = ''
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const header = findHeaderCell(event.target)
    if (!header || !isResizeHandle(event.clientX, event.clientY, header)) return

    const { table, col } = getHeaderCol(header)
    resizeState = {
      header,
      table,
      col,
      startX: event.clientX,
      startWidth: header.getBoundingClientRect().width,
    }
    document.documentElement.classList.add('table-column-resizing')
    document.body.style.cursor = 'col-resize'
    event.preventDefault()
    event.stopPropagation()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (resizeState) {
      applyColumnWidth(resizeState, resizeState.startWidth + event.clientX - resizeState.startX)
      event.preventDefault()
      return
    }

    const header = findHeaderCell(event.target)
    document.body.style.cursor = header && isResizeHandle(event.clientX, event.clientY, header) ? 'col-resize' : ''
  }

  const onPointerUp = () => {
    if (!resizeState) return
    resizeState = null
    clearResizeCursor()
  }

  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerUp, true)
}
