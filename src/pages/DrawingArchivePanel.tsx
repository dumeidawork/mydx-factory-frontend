import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { Button, Checkbox, Collapse, Form, Input, Modal, Select, Space, Table, Tag, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UploadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { getDownloadFileName, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'
import { CORE_LIST_DIM_KEYS, DIM_FIELDS, DIM_LABELS, matchHeader } from '../utils/drawingSourceFields'
import { buildDrawingName, extractSpecModel, normalizeDrawingRevForDb, parsedFormPatch } from '../utils/specParser'
import type { DrawingArchiveRow } from './drawingReviewTypes'
import styles from './WorkflowPages.module.css'

type UserOption = { id: number; name: string; username: string }
type SourceHeader = { key: string; label: string; source: string }
type SourceRow = Record<string, string> & { _id: string }

function isExcelPasteText(text: string): boolean {
  if (text.includes('\t')) return true
  return text.split(/\r?\n/).filter((line) => line.trim()).length > 1
}

function parseSourcePaste(text: string, startKey: string, columns: SourceHeader[]): Record<string, string> | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
  if (!lines.length) return null

  const firstCells = lines[0].split('\t').map((cell) => cell.trim())
  const mappedKeys = firstCells.map((cell) => matchHeader(cell))
  const hasHeader = mappedKeys.some(Boolean)
  if (hasHeader && lines.length < 2) return null

  const dataLine = hasHeader ? lines[1] : lines[0]
  const cells = dataLine.split('\t').map((cell) => cell.trim())
  const patch: Record<string, string> = {}
  if (hasHeader) {
    mappedKeys.forEach((key, index) => {
      if (key) patch[key] = cells[index] ?? ''
    })
  } else {
    const startIndex = Math.max(
      0,
      columns.findIndex((col) => col.key === startKey),
    )
    cells.forEach((cell, index) => {
      const col = columns[startIndex + index]
      if (col) patch[col.key] = cell
    })
  }
  return Object.keys(patch).length ? patch : null
}

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string }).msg || JSON.stringify(d)))
      .join('; ')
  }
  return '请求失败'
}

async function readJson<T = unknown>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}

function statusColor(status?: string) {
  if (status === '审核') return 'green'
  if (status === '修改') return 'gold'
  return 'orange'
}

const CHAIRMAN_ROLE_CODE = 'super_admin'

function canDeleteOwnedRow(
  row: { uploaded_by_user_id?: number | null; updated_by_user_id?: number | null },
  userId?: number,
  roleCode?: string,
) {
  if (roleCode === CHAIRMAN_ROLE_CODE) return true
  if (!userId) return false
  return userId === row.uploaded_by_user_id || userId === row.updated_by_user_id
}

function appendArchiveForm(
  fd: FormData,
  values: Record<string, unknown>,
  row: Record<string, string>,
) {
  const append = (key: string, value: unknown) => fd.append(key, String(value ?? '').trim())
  const parsed = extractSpecModel(String(row.spec_model || values.spec_model || ''))
  append('customer_code', values.customer_code)
  append('standard_no', parsed.standard_no || values.standard_no)
  append('drawing_rev_no', normalizeDrawingRevForDb(String(values.drawing_rev_no ?? '')))
  append('material', values.material)
  append('spec_model', row.spec_model || values.spec_model)
  append('spec', parsed.spec || values.spec)
  append('model', parsed.model || values.model)
  append('material_no', parsed.material_no || row.material_no || values.material_no)
  append('drawing_type', parsed.drawing_type || values.drawing_type)
  DIM_FIELDS.forEach((key) => append(key, row[key] ?? values[key] ?? ''))
}

export default function DrawingArchivePanel() {
  const currentUser = getStoredUser()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<DrawingArchiveRow[]>([])
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<DrawingArchiveRow | null>(null)
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [rowSaving, setRowSaving] = useState(false)
  const [sourceHeaders, setSourceHeaders] = useState<SourceHeader[]>([])
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([])
  const [sourcePdfs, setSourcePdfs] = useState<Record<string, File>>({})
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const sourceFileRef = useRef<File | null>(null)
  const rowSeq = useRef(0)

  const watchedCustomer = Form.useWatch('customer_code', form)
  const watchedStandard = Form.useWatch('standard_no', form)
  const watchedRev = Form.useWatch('drawing_rev_no', form)
  const watchedMaterial = Form.useWatch('material', form)
  const watchedSpec = Form.useWatch('spec', form)
  const watchedModel = Form.useWatch('model', form)
  const watchedMaterialNo = Form.useWatch('material_no', form)
  const watchedType = Form.useWatch('drawing_type', form)

  const firstSource = sourceRows[0]

  const previewDrawingName = useMemo(() => {
    const parsed = extractSpecModel(String(firstSource?.spec_model || ''))
    return buildDrawingName({
      customerCode: watchedCustomer || '',
      standardNo: watchedStandard || parsed.standard_no || '',
      drawingRevNo: watchedRev || '',
      material: watchedMaterial || '',
      spec: parsed.spec || watchedSpec || '',
      model: parsed.model || watchedModel || '',
      materialNo: parsed.material_no || firstSource?.material_no || watchedMaterialNo || '',
      drawingType: parsed.drawing_type || watchedType || '',
    })
  }, [
    firstSource,
    watchedCustomer,
    watchedStandard,
    watchedRev,
    watchedMaterial,
    watchedSpec,
    watchedModel,
    watchedMaterialNo,
    watchedType,
  ])

  const loadUsers = useCallback(async (q = '') => {
    const res = await authFetch(apiUrl(`/api/v1/auth/users/suggest?q=${encodeURIComponent(q)}&limit=30`))
    const data = await readJson<{ items?: UserOption[] }>(res)
    if (!res.ok) return
    setUserOptions(data.items || [])
  }, [])

  useEffect(() => {
    void loadUsers('')
  }, [loadUsers])

  const loadList = useCallback(async () => {
    const values = form.getFieldsValue()
    const map: Record<string, string> = {
      customer_code: (values.customer_code || '').trim(),
      standard_no: (values.standard_no || '').trim(),
      drawing_rev_no: (values.drawing_rev_no || '').trim(),
      drawing_no: (values.drawing_no_query || '').trim(),
      material: (values.material || '').trim(),
      spec_model: (values.spec_model || '').trim(),
      spec: (values.spec || '').trim(),
      model: (values.model || '').trim(),
      material_no: (values.material_no || '').trim(),
      drawing_type: (values.drawing_type || '').trim(),
      drawing_name: (values.drawing_name_query || '').trim(),
    }
    if (!Object.values(map).some(Boolean)) {
      message.warning('请至少输入一个查询条件')
      return
    }
    const qs = new URLSearchParams()
    Object.entries(map).forEach(([k, v]) => {
      if (v) qs.set(k, v)
    })
    qs.set('limit', '200')
    setQuerying(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives?${qs.toString()}`))
      const data = await readJson<{ items?: DrawingArchiveRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows(data.items || [])
      setEditingId(null)
      setDraft(null)
      setReplaceFile(null)
      if (!(data.items || []).length) message.info('未查询到匹配图纸')
    } finally {
      setQuerying(false)
    }
  }, [form])

  const applyParsedSource = useCallback(
    (data: {
      sheet?: string
      sheet_names?: string[]
      drawing_rev_no?: string
      standard_no?: string
      material?: string
      headers?: SourceHeader[]
      rows?: Record<string, string>[]
      detail?: unknown
    }) => {
      const headers = data.headers || []
      const nextRows: SourceRow[] = (data.rows || []).map((row) => {
        rowSeq.current += 1
        const parsed = extractSpecModel(row.spec_model || '')
        return {
          _id: `src-${rowSeq.current}`,
          ...row,
          material_no: row.material_no || parsed.material_no,
        }
      })
      setSourceHeaders(headers.length ? headers : [{ key: 'spec_model', label: '规格型号', source: '规格型号' }])
      setSourceRows(nextRows)
      setSourcePdfs({})
      setSheetNames(data.sheet_names || [])
      setActiveSheet(data.sheet || '')
      const patch: Record<string, string> = {}
      if (data.material) patch.material = data.material
      if (data.drawing_rev_no) patch.drawing_rev_no = data.drawing_rev_no
      const first = nextRows[0]
      if (first?.spec_model) Object.assign(patch, parsedFormPatch(first.spec_model))
      if (first?.material_no) patch.material_no = first.material_no
      if (!patch.standard_no && data.standard_no) patch.standard_no = data.standard_no
      if (Object.keys(patch).length) form.setFieldsValue(patch)
    },
    [form],
  )

  const parseSourceFile = useCallback(
    async (file: File, sheet?: string) => {
      setParsing(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        if (sheet) fd.append('sheet_name', sheet)
        const res = await authFetch(apiUrl('/api/v1/drawing-archives/parse-source-xlsx'), { method: 'POST', body: fd })
        const data = await readJson<{
          sheet?: string
          sheet_names?: string[]
          drawing_rev_no?: string
          standard_no?: string
          material?: string
          headers?: SourceHeader[]
          rows?: Record<string, string>[]
          detail?: unknown
        }>(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        applyParsedSource(data)
        message.success(`已解析 ${data.rows?.length || 0} 条规格`)
      } finally {
        setParsing(false)
      }
    },
    [applyParsedSource],
  )

  const patchSourceRow = (id: string, patch: Record<string, string>) => {
    setSourceRows((prev) => prev.map((row) => (row._id === id ? { ...row, ...patch } : row)))
  }

  const handleSourcePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text')
    if (!isExcelPasteText(text)) return
    e.preventDefault()
    const target = e.target as HTMLElement | null
    const colKey = target?.closest('[data-source-col]')?.getAttribute('data-source-col') || 'spec_model'
    const rowId = target?.closest('[data-source-row]')?.getAttribute('data-source-row')
    const patch = parseSourcePaste(text, colKey, sourceHeaders)
    if (!patch) {
      message.warning('没有可粘贴的数据')
      return
    }
    if (rowId) {
      const next = { ...patch }
      if (next.spec_model) {
        const parsed = extractSpecModel(next.spec_model)
        if (parsed.material_no) next.material_no = parsed.material_no
        if (sourceRows[0]?._id === rowId) form.setFieldsValue(parsedFormPatch(next.spec_model))
      }
      patchSourceRow(rowId, next)
    }
    message.success('已粘贴到当前行')
  }

  const handleUpload = async () => {
    try {
      await form.validateFields([
        'customer_code',
        'standard_no',
        'drawing_rev_no',
        'material',
        'drawing_type',
        'reviewer_user_id',
      ])
      const values = form.getFieldsValue(true) as Record<string, unknown>
      const ready = sourceRows.filter((row) => sourcePdfs[row._id] && String(row.spec_model || '').trim())
      if (!ready.length) {
        message.warning('请先解析尺寸表，并为至少一行填写规格型号、配上 PDF')
        return
      }
      setSaving(true)
      let ok = 0
      const failures: string[] = []
      const created: DrawingArchiveRow[] = []
      let materialUpdated = false
      for (const row of ready) {
        const pdf = sourcePdfs[row._id]
        if (!pdf) continue
        const fd = new FormData()
        appendArchiveForm(fd, values, row)
        fd.append('reviewer_user_id', String(values.reviewer_user_id ?? ''))
        fd.append('file', pdf)
        const res = await authFetch(apiUrl('/api/v1/drawing-archives'), { method: 'POST', body: fd })
        const data = await readJson<{ item?: DrawingArchiveRow; material_action?: string; detail?: unknown }>(res)
        if (!res.ok || !data.item) {
          failures.push(`${row.spec_model || row._id}：${parseApiDetail(data)}`)
          continue
        }
        ok += 1
        created.push(data.item)
        if (data.material_action === 'updated') materialUpdated = true
      }
      if (ok) {
        message.success(`上传成功 ${ok} 条${failures.length ? `，失败 ${failures.length} 条` : ''}`)
        setRows((prev) => {
          const next = [...created, ...prev]
          const seen = new Set<number>()
          return next.filter((item) => {
            if (seen.has(item.id)) return false
            seen.add(item.id)
            return true
          })
        })
        setSourcePdfs((prev) => {
          const copy = { ...prev }
          ready.forEach((row) => {
            if (created.some((item) => item.spec_model === row.spec_model)) delete copy[row._id]
          })
          return copy
        })
        notifyWorkbenchUnreadChanged()
      } else {
        message.error(failures[0] || '上传失败')
      }
      if (failures.length && ok) {
        Modal.warning({ title: '部分行未上传', content: failures.join('\n') })
      }
      if (materialUpdated) {
        Modal.warning({ title: '物料已覆盖', content: '物料表已存在该物料，已覆盖原数据' })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async (row: DrawingArchiveRow) => {
    const fileName = `${row.drawing_name}.pdf`
    const saveInfo = await askSavePathAndFileName('下载图纸', '', fileName, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${row.id}/download`))
    if (!res.ok) {
      const data = await readJson(res)
      message.error(parseApiDetail(data))
      return
    }
    const blob = await res.blob()
    const finalName = getDownloadFileName(res, saveInfo.fileName || fileName)
    const saved = await saveGeneratedBlob(blob, finalName, saveInfo.directoryPath)
    if (saved) message.success('下载完成')
  }

  const handleDelete = (row: DrawingArchiveRow) => {
    let alsoDeleteMaterial = false
    Modal.confirm({
      title: '确认删除该图纸？',
      content: (
        <div>
          <div style={{ marginBottom: 12 }}>将删除磁盘文件并清除建档记录：{row.drawing_name}</div>
          <Checkbox onChange={(e) => { alsoDeleteMaterial = e.target.checked }}>
            同时删除物料表对应记录（物料号 + 图纸号 + 标准号）
          </Checkbox>
        </div>
      ),
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const qs = alsoDeleteMaterial ? '?delete_material=true' : ''
        const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${row.id}${qs}`), { method: 'DELETE' })
        const data = await readJson<{ detail?: unknown; material_deleted?: boolean }>(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success(data.material_deleted ? '已删除图纸，并删除物料表对应记录' : '已删除图纸')
        if (alsoDeleteMaterial && data.material_deleted === false) {
          message.info('物料表中未找到对应记录')
        }
        setRows((prev) => prev.filter((r) => r.id !== row.id))
        if (editingId === row.id) {
          setEditingId(null)
          setDraft(null)
          setReplaceFile(null)
        }
        notifyWorkbenchUnreadChanged()
      },
    })
  }

  const patchDraft = (patch: Partial<DrawingArchiveRow>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handleStartEdit = (row: DrawingArchiveRow) => {
    setEditingId(row.id)
    setDraft({ ...row })
    setReplaceFile(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setDraft(null)
    setReplaceFile(null)
  }

  const handleSaveRow = async () => {
    if (!draft || editingId == null) return
    const customer = String(draft.customer_code || '').trim()
    const material = String(draft.material || '').trim()
    const drawingType = String(draft.drawing_type || '').trim()
    const specModel = String(draft.spec_model || '').trim()
    const spec = String(draft.spec || '').trim()
    const model = String(draft.model || '').trim()
    const materialNo = String(draft.material_no || '').trim()
    const standardNo = String(draft.standard_no || '').trim()
    const drawingRevNo = normalizeDrawingRevForDb(String(draft.drawing_rev_no || ''))
    const missing: string[] = []
    if (!customer) missing.push('客户代码')
    if (!material) missing.push('材质')
    if (!drawingType) missing.push('类型')
    if (!specModel) missing.push('规格型号')
    if (missing.length) {
      message.warning(`请填写必填项：${missing.join('、')}`)
      return
    }
    if (!standardNo && !drawingRevNo) {
      message.warning('标准号与图纸号-版本号必须填写其中一个')
      return
    }
    if (!materialNo && !spec && !model) {
      message.warning('物料号为空时，规格与型号不能同时为空')
      return
    }
    if (replaceFile && !replaceFile.name.toLowerCase().endsWith('.pdf')) {
      message.error('仅支持 PDF 文件')
      return
    }
    setRowSaving(true)
    try {
      const fd = new FormData()
      const draftMap = draft as unknown as Record<string, string>
      appendArchiveForm(fd, {
        customer_code: customer,
        standard_no: standardNo,
        drawing_rev_no: drawingRevNo,
        material,
        spec_model: specModel,
        spec,
        model,
        material_no: materialNo,
        drawing_type: drawingType,
      }, draftMap)
      if (replaceFile) fd.append('file', replaceFile)
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${editingId}/update`), {
        method: 'POST',
        body: fd,
      })
      const data = await readJson<{
        item?: DrawingArchiveRow
        material_action?: string
        detail?: unknown
      }>(res)
      if (!res.ok || !data.item) {
        message.error(parseApiDetail(data))
        return
      }
      message.success(`已保存并重新提交审核：${data.item.drawing_name}`)
      if (data.material_action === 'updated') {
        Modal.warning({
          title: '物料已覆盖',
          content: '物料表已存在该物料，已覆盖原数据',
        })
      }
      setRows((prev) => prev.map((r) => (r.id === data.item!.id ? data.item! : r)))
      handleCancelEdit()
      notifyWorkbenchUnreadChanged()
    } finally {
      setRowSaving(false)
    }
  }

  const renderEditInput = (row: DrawingArchiveRow, key: keyof DrawingArchiveRow, extra?: {
    disabled?: boolean
    onChange?: (value: string) => void
    onBlur?: () => void
  }) => {
    if (editingId !== row.id || !draft) {
      const value = row[key]
      return value == null || value === '' ? '-' : String(value)
    }
    return (
      <Input
        size="small"
        value={String(draft[key] ?? '')}
        disabled={extra?.disabled}
        allowClear
        onChange={(e) => {
          const value = e.target.value
          if (extra?.onChange) extra.onChange(value)
          else patchDraft({ [key]: value } as Partial<DrawingArchiveRow>)
        }}
        onBlur={extra?.onBlur}
      />
    )
  }

  const columns: ColumnsType<DrawingArchiveRow> = [
    {
      title: '图纸名',
      dataIndex: 'drawing_name',
      fixed: 'left',
      width: 280,
      render: (_v: string, row) => {
        if (editingId === row.id && draft) {
          return (
            buildDrawingName({
              customerCode: draft.customer_code || '',
              standardNo: draft.standard_no || '',
              drawingRevNo: draft.drawing_rev_no || '',
              material: draft.material || '',
              spec: draft.spec || '',
              model: draft.model || '',
              materialNo: draft.material_no || '',
              drawingType: draft.drawing_type || '',
            }) || '-'
          )
        }
        return row.drawing_name
      },
    },
    {
      title: '客户代码',
      dataIndex: 'customer_code',
      width: 110,
      render: (_v, row) => renderEditInput(row, 'customer_code'),
    },
    {
      title: '标准号',
      dataIndex: 'standard_no',
      width: 130,
      render: (_v, row) => renderEditInput(row, 'standard_no'),
    },
    {
      title: '图纸号-版本号',
      dataIndex: 'drawing_rev_no',
      width: 180,
      render: (_v, row) => renderEditInput(row, 'drawing_rev_no'),
    },
    {
      title: '材质',
      dataIndex: 'material',
      width: 90,
      render: (_v, row) => renderEditInput(row, 'material'),
    },
    {
      title: '规格',
      dataIndex: 'spec',
      width: 80,
      render: (_v, row) => renderEditInput(row, 'spec'),
    },
    {
      title: '型号',
      dataIndex: 'model',
      width: 80,
      render: (_v, row) => renderEditInput(row, 'model'),
    },
    {
      title: '物料号',
      dataIndex: 'material_no',
      width: 120,
      render: (_v, row) => renderEditInput(row, 'material_no'),
    },
    {
      title: '类型',
      dataIndex: 'drawing_type',
      width: 90,
      render: (_v, row) => renderEditInput(row, 'drawing_type'),
    },
    ...CORE_LIST_DIM_KEYS.map((key) => ({
      title: key === 'spec_model' ? '规格型号*' : DIM_LABELS[key] || key,
      dataIndex: key,
      width: key === 'spec_model' ? 160 : 110,
      render: (_v: string | undefined, row: DrawingArchiveRow) =>
        renderEditInput(row, key as keyof DrawingArchiveRow, {
          onBlur:
            key === 'spec_model'
              ? () => {
                  const parsed = extractSpecModel(String(draft?.spec_model || ''))
                  patchDraft({
                    spec: parsed.spec || draft?.spec,
                    model: parsed.model || draft?.model,
                    material_no: parsed.material_no || draft?.material_no,
                    standard_no: parsed.standard_no || draft?.standard_no,
                    drawing_type: parsed.drawing_type || draft?.drawing_type,
                  })
                }
              : undefined,
        }),
    })),
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v?: string) => <Tag color={statusColor(v)}>{v || '-'}</Tag>,
    },
    { title: '审核人', dataIndex: 'reviewer_name', width: 100, render: (v?: string) => v || '-' },
    { title: '上传时间', dataIndex: 'uploaded_at', width: 160 },
    { title: '上传者', dataIndex: 'uploaded_by_name', width: 90 },
    { title: '更改时间', dataIndex: 'updated_at', width: 160, render: (v?: string) => v || '-' },
    { title: '更改者', dataIndex: 'updated_by_name', width: 90, render: (v?: string) => v || '-' },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 280,
      render: (_, row) => {
        const editing = editingId === row.id
        return (
          <Space size={0} wrap>
            {editing ? (
              <>
                <Button type="link" size="small" loading={rowSaving} onClick={() => void handleSaveRow()}>
                  保存
                </Button>
                <Button type="link" size="small" disabled={rowSaving} onClick={handleCancelEdit}>
                  取消
                </Button>
                <Upload
                  accept=".pdf,application/pdf"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    if (!file.name.toLowerCase().endsWith('.pdf')) {
                      message.error('仅支持 PDF 文件')
                      return Upload.LIST_IGNORE
                    }
                    setReplaceFile(file)
                    return false
                  }}
                >
                  <Button type="link" size="small">
                    {replaceFile ? '已选PDF' : '更换PDF'}
                  </Button>
                </Upload>
              </>
            ) : (
              <Button type="link" size="small" onClick={() => handleStartEdit(row)}>
                编辑
              </Button>
            )}
            <Button type="link" size="small" onClick={() => void handleDownload(row)}>
              下载
            </Button>
            {canDeleteOwnedRow(row, currentUser?.id, currentUser?.role_code) ? (
              <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
                删除
              </Button>
            ) : null}
          </Space>
        )
      },
    },
  ]

  const sourceTableColumns: ColumnsType<SourceRow> = [
    ...sourceHeaders.map((col) => ({
      title: col.key === 'spec_model' ? `${col.label}*` : col.label,
      dataIndex: col.key,
      width: col.key === 'spec_model' ? 220 : 110,
      render: (_v: string, row: SourceRow) => (
        <span data-source-col={col.key} data-source-row={row._id}>
          <Input
            size="small"
            value={row[col.key] || ''}
            allowClear
            placeholder={col.label}
            onChange={(e) => patchSourceRow(row._id, { [col.key]: e.target.value })}
            onBlur={(e) => {
              if (col.key !== 'spec_model') return
              const parsedPatch = parsedFormPatch(e.target.value)
              if (parsedPatch.material_no) patchSourceRow(row._id, { material_no: parsedPatch.material_no })
              if (sourceRows[0]?._id === row._id && Object.keys(parsedPatch).length) {
                form.setFieldsValue(parsedPatch)
              }
            }}
          />
        </span>
      ),
    })),
    {
      title: 'PDF*',
      key: 'pdf',
      fixed: 'right',
      width: 140,
      render: (_v, row) => (
        <Upload
          accept=".pdf,application/pdf"
          showUploadList={false}
          beforeUpload={(file) => {
            if (!file.name.toLowerCase().endsWith('.pdf')) {
              message.error('仅支持 PDF 文件')
              return Upload.LIST_IGNORE
            }
            setSourcePdfs((prev) => ({ ...prev, [row._id]: file }))
            return false
          }}
        >
          <Button type="primary" size="small" className={styles.qcQueryButton} icon={<UploadOutlined />}>
            {sourcePdfs[row._id] ? sourcePdfs[row._id].name.slice(0, 12) : '选择PDF'}
          </Button>
        </Upload>
      ),
    },
  ]

  const readyCount = sourceRows.filter((row) => sourcePdfs[row._id] && String(row.spec_model || '').trim()).length

  return (
    <div className={styles.stack}>
      <Collapse
        className={styles.opGuide}
        defaultActiveKey={[]}
        items={[
          {
            key: 'guide',
            label: '操作说明',
            children: (
              <div className={styles.opGuideBody}>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>操作步骤</div>
                  <ol className={styles.opGuideList}>
                    <li>
                      点「选择尺寸表 xlsx」，上传一份加工尺寸表（.xlsx）。系统只解析、不归档原件。默认读活跃工作表；若文件有多个工作表，可用下拉切换后再解析。
                    </li>
                    <li>
                      解析成功后：表头「图纸号」「材质」写入下方建档表单（可改）；规格表按本文件实际出现的列显示，没有的列不会出现。每一行规格将各建一条图纸档。
                    </li>
                    <li>
                      填写共用项：客户代码、材质、类型、指定审核负责人必填。标准号与图纸号-版本号至少填一个，可以同时填；有图纸号时图纸名用图纸号，否则用标准号。规格型号失焦后会自动拆出物料号、标准号、规格、型号、类型，可手改。
                    </li>
                    <li>
                      在每一行右侧选择对应的 PDF（每行一个）。单元格仍可从 Excel 粘贴补录。需要手工补行时点「添加一行」。
                    </li>
                    <li>
                      点橙色「上传」。只提交已配 PDF 且已填规格型号的行；共用字段复制到每一行，尺寸与规格型号用该行自己的值。成功/失败会汇总提示。
                    </li>
                    <li>
                      查询：在上方共用项或「图纸名（查询用）」中至少填一个条件，再点「查询」。列表只显示核心尺寸列（规格型号、外径、内径、厚度、单重）。可编辑、更换 PDF、下载或删除；保存编辑会重新提交审核。
                    </li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>
                      请上传加工尺寸表，不要上传物料清单。表头同时含「序号 / 名称 / 物料号」时会提示「不是尺寸表」，不会填入画面。
                    </li>
                    <li>
                      尺寸列全部选填：表上没有的字段不读、不校验、存空。缺单重时同步到物料的单重按 0。件数、数量、序号、备注不建档。
                    </li>
                    <li>
                      表头「图纸号」写入图纸号-版本号（形如 A5E… Rev…）；不像图纸号的内容进标准号，仍可手改。规格列里的 A5E… 不会覆盖表头图纸号。订单号不保存。
                    </li>
                    <li>
                      规格列整段进入规格型号（例如 FDK-115-518 AS4087 PN16 DN450 SO RF），并自动拆：物料号=第一段，标准号=物料号与规格/型号之间，类型=规格/型号之后。图纸名第四段：有物料号用物料号，否则用「规格 型号」。
                    </li>
                    <li>
                      每行必须单独配 PDF。未配 PDF 或未填规格型号的行不会上传。同名图纸不允许覆盖，需先删除再传。
                    </li>
                    <li>
                      上传后状态为「上传」，由指定审核人在工作台下载 PDF 并核对；只展示该条非空的尺寸字段。一致后变为「审核」，不一致则退回「修改」。
                    </li>
                    <li>
                      粘贴仅用于改某一格或补录，不是主入口。xlsx 原件不会存到图纸归档目录，落库的是 PDF 与字段。
                    </li>
                    <li>
                      删除仅上传者、更新者或董事长（super_admin）可见。删除图纸时可选「同时删除物料表对应记录」。
                    </li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Form form={form} layout="vertical">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>图纸源文件信息</div>
        <Space wrap style={{ marginBottom: 8 }}>
          <Upload
            accept=".xlsx"
            showUploadList={false}
            beforeUpload={(file) => {
              if (!file.name.toLowerCase().endsWith('.xlsx')) {
                message.error('仅支持 .xlsx')
                return Upload.LIST_IGNORE
              }
              sourceFileRef.current = file
              void parseSourceFile(file)
              return false
            }}
          >
            <Button type="primary" className={styles.qcSelectAllButton} icon={<UploadOutlined />} loading={parsing}>
              选择尺寸表 xlsx
            </Button>
          </Upload>
          {sheetNames.length > 1 ? (
            <Select
              style={{ minWidth: 160 }}
              value={activeSheet || undefined}
              placeholder="工作表"
              options={sheetNames.map((name) => ({ value: name, label: name }))}
              onChange={(name) => {
                const file = sourceFileRef.current
                if (!file) return
                void parseSourceFile(file, name)
              }}
            />
          ) : null}
          <Button
            type="primary"
            onClick={() => {
              rowSeq.current += 1
              const id = `src-${rowSeq.current}`
              if (!sourceHeaders.length) {
                setSourceHeaders([{ key: 'spec_model', label: '规格型号', source: '规格型号' }])
              }
              setSourceRows((prev) => [...prev, { _id: id, spec_model: '' }])
            }}
          >
            添加一行
          </Button>
        </Space>
        <div onPaste={handleSourcePaste} tabIndex={0} style={{ outline: 'none' }}>
          <Table
            size="small"
            rowKey="_id"
            pagination={false}
            scroll={{ x: Math.max(900, sourceHeaders.length * 120 + 160) }}
            dataSource={sourceRows}
            columns={sourceTableColumns}
            locale={{ emptyText: '请选择尺寸表 xlsx，按表头自动填入；没有的列不会出现' }}
          />
        </div>
        <div style={{ marginBottom: 20, marginTop: 8, color: '#666', fontSize: 12 }}>
          xlsx 只解析、不归档。每一行规格需单独配 PDF。单元格仍可粘贴 Excel 补录。已配 PDF {readyCount} / {sourceRows.length} 行。
        </div>

        <div style={{ maxWidth: 960 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>图纸建档</div>
        <Form.Item
          name="customer_code"
          label="客户代码"
          rules={[{ required: true, message: '请输入客户代码' }]}
        >
          <Input placeholder="客户代码" allowClear />
        </Form.Item>
        <Form.Item
          name="standard_no"
          label="标准号"
          rules={[
            {
              validator: async (_, value) => {
                const other = String(form.getFieldValue('drawing_rev_no') || '').trim()
                if (!String(value || '').trim() && !other) {
                  throw new Error('标准号与图纸号-版本号必须填写其中一个')
                }
              },
            },
          ]}
        >
          <Input
            placeholder="可与图纸号同时填写；无图纸号时用于图纸名"
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="drawing_rev_no"
          label="图纸号-版本号"
          extra="支持 A5E02970605A Rev017 或 A5E02970605A-017，入库统一为前者。尺寸表表头图纸号会自动填入。可与标准号同时存在；有图纸号时图纸名优先用图纸号。"
          rules={[
            {
              validator: async (_, value) => {
                const other = String(form.getFieldValue('standard_no') || '').trim()
                if (!String(value || '').trim() && !other) {
                  throw new Error('标准号与图纸号-版本号必须填写其中一个')
                }
              },
            },
          ]}
        >
          <Input
            placeholder="A5E02970605A Rev017 或 A5E02970605A-017"
            allowClear
            onBlur={(e) => {
              const next = normalizeDrawingRevForDb(e.target.value)
              if (next !== e.target.value) form.setFieldValue('drawing_rev_no', next)
            }}
          />
        </Form.Item>
        <Form.Item name="material" label="材质" rules={[{ required: true, message: '请输入材质' }]}>
          <Input placeholder="材质" allowClear />
        </Form.Item>
        <Form.Item name="spec" label="规格">
          <Input placeholder="可由规格型号自动带出，可手改" allowClear />
        </Form.Item>
        <Form.Item name="model" label="型号">
          <Input placeholder="可由规格型号自动带出，可手改" allowClear />
        </Form.Item>
        <Form.Item name="material_no" label="物料号">
          <Input placeholder="可由规格型号自动带出（第一段），可手改" allowClear />
        </Form.Item>
        <Form.Item name="drawing_type" label="类型" rules={[{ required: true, message: '请输入类型' }]}>
          <Input placeholder="可由规格型号自动带出（规格/型号之后），可手改" allowClear />
        </Form.Item>
        <Form.Item
          name="reviewer_user_id"
          label="指定审核负责人"
          rules={[{ required: true, message: '请指定审核负责人' }]}
        >
          <Select
            showSearch
            allowClear
            placeholder="输入姓名或用户名检索"
            filterOption={false}
            onSearch={(q) => void loadUsers(q)}
            options={userOptions.map((u) => ({ value: u.id, label: `${u.name}（${u.username}）` }))}
          />
        </Form.Item>
        {previewDrawingName ? (
          <div style={{ marginBottom: 16, color: '#666' }}>首行图纸名预览：{previewDrawingName}</div>
        ) : null}
        <div style={{ marginBottom: 28 }}>
          <Button
            type="primary"
            loading={saving}
            onClick={() => void handleUpload()}
            style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
          >
            上传
          </Button>
        </div>
        <Form.Item label="图纸名（查询用）" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="drawing_name_query" noStyle>
              <Input placeholder="可按图纸名模糊查询" allowClear style={{ width: '100%' }} />
            </Form.Item>
            <Button type="primary" loading={querying} onClick={() => void loadList()}>
              查询
            </Button>
          </Space.Compact>
        </Form.Item>
        </div>
      </Form>

      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={rows}
        scroll={{ x: 2600 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </div>
  )
}
