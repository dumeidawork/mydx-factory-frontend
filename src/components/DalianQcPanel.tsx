import { useMemo, useState } from 'react'
import { Button, Card, DatePicker, Descriptions, Form, Input, Modal, Select, Space, Table, Tag, notification } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import styles from '../pages/WorkflowPages.module.css'
import { apiUrl, isFetchGuardHandled, workflowQcDalianDetailUrl } from '../utils/api'
import { askSavePath } from '../utils/savePath'
import { message } from '../utils/feedback'
import {
  certificateExportLoadingText,
  getDownloadFileName,
  readFetchErrorMessage,
  saveCertificateOutput,
  serverCertificateOutputFormat,
} from '../utils/clientFileSave'
import { runBatchCertificateExport } from '../utils/certificateBatchExport'
import { runSnapshotBatchExport } from '../utils/snapshotBatchExport'
import CertificateExportProgress from './CertificateExportProgress'
import { CHEM_FIELDS, DALIAN_MECH_COLUMNS, ORDER_STATUS_OPTIONS } from './qcConstants'
import {
  QcBackToListButton,
  buildQcListColumns,
  buildSnapshotDisplayColumns,
  hasMissingConfirmedCertNo,
  hasPendingCertNoChanges,
  hasPendingQtyChanges,
  openRegenerateChoiceModal,
  qcGeneratedRowClassName,
  filterSelectedQcRows,
  qcListRowKey,
  type QcListMode,
} from './qcListShared'
import type { QcOutputFormat } from '../pages/QcWorkbenchPage'

type MechGroup = Record<string, string>

type CertAllocation = {
  certificate_no: string
  cert_date_yymmdd: string
  cert_daily_seq: number
  is_reused?: boolean
  allocated_cert_date_yymmdd?: string
  allocated_certificate_no?: string
}

function yymmddFromDayjs(value: Dayjs) {
  return value.format('YYMMDD')
}

function formatAllocatedDateLabel(yymmdd: string) {
  if (yymmdd.length !== 6) return yymmdd
  const yy = Number(yymmdd.slice(0, 2))
  const year = yy >= 70 ? 1900 + yy : 2000 + yy
  const month = Number(yymmdd.slice(2, 4))
  const day = Number(yymmdd.slice(4, 6))
  return `${year}年${month}月${day}日`
}

function resetListCertState(setters: {
  setDateConfirmed: (v: boolean) => void
  setConfirmedDateText: (v: string) => void
  setPendingCertNo: (v: Record<number, string>) => void
  setSavedCertNo: (v: Record<number, string>) => void
}) {
  setters.setDateConfirmed(false)
  setters.setConfirmedDateText('')
  setters.setPendingCertNo({})
  setters.setSavedCertNo({})
}

export default function DalianQcPanel({
  outputFormat = 'word',
  useUtmtpt = false,
}: {
  outputFormat?: QcOutputFormat
  useUtmtpt?: boolean
}) {
  const navigate = useNavigate()
  const [listRows, setListRows] = useState<Record<string, unknown>[]>([])
  const [selectedListKeys, setSelectedListKeys] = useState<(string | number)[]>([])
  const [batchDate, setBatchDate] = useState<dayjs.Dayjs | null>(dayjs())
  const [dateConfirmed, setDateConfirmed] = useState(false)
  const [confirmedDateText, setConfirmedDateText] = useState('')
  const [pendingCertNo, setPendingCertNo] = useState<Record<number, string>>({})
  const [savedCertNo, setSavedCertNo] = useState<Record<number, string>>({})
  const [mode, setMode] = useState<'list' | 'detail'>('list')
  const [selectedOrderNo, setSelectedOrderNo] = useState('')
  const [selectedOrderDetailId, setSelectedOrderDetailId] = useState<number | null>(null)
  const [selectedMaterialNo, setSelectedMaterialNo] = useState('')
  const [selectedHeatNo, setSelectedHeatNo] = useState('')
  const [selectedHeatTreatmentBatchNo, setSelectedHeatTreatmentBatchNo] = useState('')
  const [selectedItemNo, setSelectedItemNo] = useState<number | null>(null)
  const [detailDateConfirmed, setDetailDateConfirmed] = useState(false)
  const [certAllocation, setCertAllocation] = useState<CertAllocation | null>(null)
  const [delivery, setDelivery] = useState<Record<string, any>>({})
  const [mechGroups, setMechGroups] = useState<{ min: MechGroup; max: MechGroup }>({ min: {}, max: {} })
  const [chemRaw, setChemRaw] = useState<Record<string, string>>({})
  const [chemSelf, setChemSelf] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string | null>(null)
  const [saveDir, setSaveDir] = useState('')
  const [pendingQty, setPendingQty] = useState<Record<number, number>>({})
  const [listMode, setListMode] = useState<QcListMode>('pending')
  const [form] = Form.useForm()

  const mechTableRows = useMemo(
    () => [
      { key: 'min', group: '最薄', ...(mechGroups.min || {}) },
      { key: 'max', group: '最厚', ...(mechGroups.max || {}) },
    ],
    [mechGroups]
  )

  const listCertResetters = {
    setDateConfirmed,
    setConfirmedDateText,
    setPendingCertNo,
    setSavedCertNo,
  }

  const loadListByFilters = async (orderNo = '', materialNo = '', status = '') => {
    const qs = new URLSearchParams({ region: 'dalian' })
    if (orderNo) qs.set('order_no', orderNo)
    if (materialNo) qs.set('material_no', materialNo)
    if (status) qs.set('status', status)
    const res = await fetch(apiUrl(`/api/v1/workflow/qc/list?${qs.toString()}`))
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '加载失败')
    setListRows(data.rows || [])
    resetListCertState(listCertResetters)
    setListMode('pending')
    setSelectedListKeys([])
    return data.rows || []
  }

  const querySnapshots = async () => {
    const values = await form.validateFields(['query_order_no', 'query_material_no', 'query_status'])
    const orderNo = values.query_order_no || ''
    const materialNo = values.query_material_no || ''
    const status = values.query_status || ''
    if (!orderNo && !materialNo && !status) {
      message.warning('请至少填写订单号、物料号或状态')
      return
    }
    const qs = new URLSearchParams({ region: 'dalian' })
    if (orderNo) qs.set('order_no', orderNo)
    if (materialNo) qs.set('material_no', materialNo)
    if (status) qs.set('status', status)
    const res = await fetch(apiUrl(`/api/v1/workflow/qc/snapshots?${qs.toString()}`))
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '查询失败')
    setListRows(data.rows || [])
    setListMode('generated')
    setSelectedListKeys([])
    if (!(data.rows || []).length) message.info('未找到已生成的质保书记录')
  }

  const loadList = async () => {
    const values = await form.validateFields(['query_order_no', 'query_material_no', 'query_status'])
    await loadListByFilters(values.query_order_no || '', values.query_material_no || '', values.query_status || '')
  }

  const applyDetailData = (data: Record<string, any>, order_no: string, material_no: string, confirmed: boolean) => {
    const dateValue = dayjs(data.base_info?.date || dayjs().format('YYYY-MM-DD'))
    const allocation = (data.cert_allocation || {}) as CertAllocation
    setSelectedItemNo(
      data.order_row?.item_no != null && data.order_row?.item_no !== '' ? Number(data.order_row.item_no) : null
    )
    setCertAllocation(confirmed && allocation.certificate_no ? allocation : null)
    setDetailDateConfirmed(confirmed)
    setDelivery(data.delivery_result || {})
    setMechGroups({
      min: data.mechanical_readonly?.min || {},
      max: data.mechanical_readonly?.max || {},
    })
    setChemRaw(data.chemical_readonly?.raw || {})
    setChemSelf(data.chemical_readonly?.self || {})
    form.setFieldsValue({
      order_no,
      material_no,
      certificate_no: confirmed ? data.base_info?.certificate_no || allocation.certificate_no || '' : '',
      customer: data.base_info?.customer,
      contract_no: data.base_info?.contract_no,
      works_no: data.base_info?.works_no,
      material: data.base_info?.material,
      state_of_delivery: data.base_info?.state_of_delivery,
      date: dateValue,
    })
  }

  const fetchDalianDetail = async (
    order_no: string,
    material_no: string,
    heat_no: string,
    heat_treatment_batch_no: string,
    order_detail_id: number,
    dateText?: string,
    allocate = false,
    forceRegenerate = false
  ) => {
    const res = await fetch(
      workflowQcDalianDetailUrl(
        order_no,
        material_no,
        heat_no,
        heat_treatment_batch_no,
        order_detail_id,
        dateText || '',
        forceRegenerate,
        allocate
      )
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '加载详情失败')
    return data
  }

  const confirmBatchFactoryDate = async () => {
    const selectedRows = filterSelectedQcRows(listRows, selectedListKeys, listMode)
    if (!selectedRows.length) {
      message.warning('请先勾选要确认出厂日期的物料')
      return
    }
    const dateText = (batchDate || dayjs()).format('YYYY-M-D')
    const res = await fetch(apiUrl('/api/v1/workflow/qc/dalian/confirm_date'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: dateText,
        rows: selectedRows.map((row) => ({
          order_detail_id: Number(row.id),
          order_no: String(row.order_no || ''),
          material_no: String(row.material_no || ''),
          item_no: row.item_no != null && row.item_no !== '' ? Number(row.item_no) : null,
        })),
      }),
    })
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '确认出厂日期失败')
    const nextSaved: Record<number, string> = {}
    const nextPending: Record<number, string> = {}
    for (const item of data.rows || []) {
      const rowId = Number(item.order_detail_id)
      nextSaved[rowId] = String(item.certificate_no || '')
      nextPending[rowId] = String(item.certificate_no || '')
    }
    setSavedCertNo(nextSaved)
    setPendingCertNo(nextPending)
    setDateConfirmed(true)
    setConfirmedDateText(dateText)
    message.success(`已确认出厂日期 ${dateText}，并分配 ${(data.rows || []).length} 个证书编号`)
  }

  const confirmDetailFactoryDate = async (forceRegenerate = false) => {
    const dateValue = form.getFieldValue('date') as Dayjs | null
    if (!dateValue) return message.warning('请选择出厂日期')
    const dateText = dateValue.format('YYYY-M-D')
    const res = await fetch(apiUrl('/api/v1/workflow/qc/dalian/allocate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: selectedOrderNo,
        material_no: selectedMaterialNo,
        item_no: selectedItemNo,
        date: dateText,
        order_detail_id: selectedOrderDetailId,
        force_regenerate: forceRegenerate,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '确认出厂日期失败')
    const allocation = data.cert_allocation as CertAllocation
    setCertAllocation(allocation)
    setDetailDateConfirmed(true)
    form.setFieldValue('certificate_no', allocation.certificate_no)
    return allocation
  }

  const ensureDetailDateConfirmed = () => {
    if (detailDateConfirmed) return true
    Modal.warning({ title: '请先确认出厂日期', content: '请先选择出厂日期并点击「确认出厂日期」，系统才会分配证书编号。' })
    return false
  }

  const ensureBatchDateConfirmed = () => {
    if (dateConfirmed) return true
    Modal.warning({ title: '请先确认出厂日期', content: '请先选择出厂日期并点击「确认出厂日期」，再批量生成质保书。' })
    return false
  }

  const enter = async (
    order_detail_id: number,
    order_no: string,
    material_no: string,
    heat_no: string,
    heat_treatment_batch_no: string
  ) => {
    await fetch(apiUrl('/api/v1/workflow/qc/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_detail_id,
        order_no,
        material_no,
        heat_no: heat_no || '',
        heat_treatment_batch_no: heat_treatment_batch_no || '',
      }),
    })
    try {
      const data = await fetchDalianDetail(order_no, material_no, heat_no || '', heat_treatment_batch_no || '', order_detail_id)
      setSelectedOrderNo(order_no)
      setSelectedOrderDetailId(order_detail_id)
      setSelectedMaterialNo(material_no)
      setSelectedHeatNo(heat_no || '')
      setSelectedHeatTreatmentBatchNo(heat_treatment_batch_no || '')
      applyDetailData(data, order_no, material_no, false)
      setMode('detail')
      if (data.trial_data_notice?.level === 'missing') {
        Modal.info({
          title: '试验记录缺失',
          width: 480,
          content: (
            <div>
              <p>
                炉号【{data.trial_data_notice.heat_no || '/'}】、热处理批号【{data.trial_data_notice.batch_no || '/'}】未被录入试验记录，模块三将为空。
              </p>
              <p>请到「热处理与测试」-「试验记录」页面提交试验数据后再进行质检。</p>
            </div>
          ),
        })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载详情失败')
    }
  }

  const handleDetailDateChange = (value: Dayjs | null) => {
    if (!value) return
    const prevAllocation = certAllocation
    const wasConfirmed = detailDateConfirmed
    setDetailDateConfirmed(false)
    form.setFieldValue('certificate_no', '')
    setCertAllocation(null)
    if (!wasConfirmed || !prevAllocation?.certificate_no) return
    const newYymmdd = yymmddFromDayjs(value)
    const allocatedYymmdd = prevAllocation.allocated_cert_date_yymmdd || prevAllocation.cert_date_yymmdd
    if (!allocatedYymmdd || newYymmdd === allocatedYymmdd) return
    const allocatedNo = prevAllocation.allocated_certificate_no || prevAllocation.certificate_no
    Modal.confirm({
      title: '重新生成证书编号？',
      content: `该质保书在${formatAllocatedDateLabel(allocatedYymmdd)}时已生成，证书编号为 ${allocatedNo}，是否重新生成新证书编号的质保书？`,
      okText: '是，重新生成',
      cancelText: '否，保留原编号',
      onOk: async () => {
        try {
          await confirmDetailFactoryDate(true)
          message.success('已分配新证书编号')
        } catch (error) {
          message.error(error instanceof Error ? error.message : '重新分配失败')
        }
      },
    })
  }

  const buildSavePayload = ({
    orderNo,
    materialNo,
    detail,
    dateText,
    values,
    heatNo,
    heatTreatmentBatchNo,
    orderDetailId,
  }: {
    orderNo: string
    materialNo: string
    detail: Record<string, any>
    dateText: string
    values: Record<string, any>
    heatNo?: string
    heatTreatmentBatchNo?: string
    orderDetailId?: number | null
  }) => ({
    order_detail_id: orderDetailId ?? undefined,
    order_no: orderNo,
    material_no: materialNo,
    heat_no: heatNo || '',
    heat_treatment_batch_no: heatTreatmentBatchNo || '',
    base_info: {
      certificate_type: 'dalian',
      certificate_no: values.certificate_no || detail.base_info?.certificate_no || '',
      customer: values.customer || detail.base_info?.customer || '',
      contract_no: values.contract_no || detail.base_info?.contract_no || orderNo,
      date: dateText,
      works_no: values.works_no || detail.base_info?.works_no || orderNo,
      article: detail.base_info?.article || '锻造法兰 Forged Flange',
      state_of_delivery: values.state_of_delivery || detail.base_info?.state_of_delivery || '',
      material: values.material || detail.base_info?.material || '',
      marking:
        detail.base_info?.marking ||
        '工厂品牌、标准、尺寸、压力、材料等级、炉号 Factory brand, Standard, Dimension, Pressure, Material grade, Heat No.',
      place_date: `ZHANGQIU/${dateText}`,
    },
    delivery_content: [detail.delivery_result || {}],
    mechanical_tests: detail.mechanical_readonly || { min: {}, max: {} },
    chemical_analysis: [{ raw: detail.chemical_readonly?.raw || {}, self: detail.chemical_readonly?.self || {} }],
  })

  const buildCurrentDetail = (values: Record<string, any>) => ({
    base_info: {
      customer: values.customer,
      contract_no: values.contract_no,
      works_no: values.works_no,
      material: values.material,
      state_of_delivery: values.state_of_delivery,
      article: '锻造法兰 Forged Flange',
      marking:
        '工厂品牌、标准、尺寸、压力、材料等级、炉号 Factory brand, Standard, Dimension, Pressure, Material grade, Heat No.',
    },
    delivery_result: delivery,
    mechanical_readonly: mechGroups,
    chemical_readonly: { raw: chemRaw, self: chemSelf },
  })

  const saveQcRecord = async (values: Record<string, any>, detail: Record<string, any>) => {
    const res = await fetch(apiUrl('/api/v1/workflow/qc/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildSavePayload({
          orderNo: values.order_no,
          materialNo: values.material_no,
          detail,
          dateText: values.date.format('YYYY-M-D'),
          values,
          heatNo: selectedHeatNo,
          heatTreatmentBatchNo: selectedHeatTreatmentBatchNo,
          orderDetailId: selectedOrderDetailId,
        })
      ),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '保存失败')
    return data.record_id
  }

  const save = async () => {
    if (!ensureDetailDateConfirmed()) return
    const values = await form.validateFields([
      'order_no',
      'material_no',
      'certificate_no',
      'customer',
      'contract_no',
      'works_no',
      'material',
      'state_of_delivery',
      'date',
    ])
    try {
      const nextRecordId = await saveQcRecord(values, buildCurrentDetail(values))
      message.success(`保存成功，记录ID=${nextRecordId}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '保存失败')
    }
  }

  const exportCert = async () => {
    if (!ensureDetailDateConfirmed()) return
    const values = await form.validateFields([
      'order_no',
      'material_no',
      'certificate_no',
      'customer',
      'contract_no',
      'works_no',
      'material',
      'state_of_delivery',
      'date',
    ])
    const nextSaveDir = await askSavePath('生成大连质保书并导出', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setExporting(true)
    setExportProgress(outputFormat === 'pdf' ? '步骤 ①/③：正在生成 Word 版质保书...' : null)
    const hide = outputFormat === 'word' ? message.loading(certificateExportLoadingText(outputFormat), 0) : () => {}
    const defaultFileName = `${selectedOrderNo}_${selectedHeatNo || delivery.raw_material_no || ''}_${delivery.name || ''}.docx`
    try {
      const nextRecordId = await saveQcRecord(values, buildCurrentDetail(values))
      const fd = new FormData()
      fd.append('record_id', String(nextRecordId))
      fd.append('output_format', serverCertificateOutputFormat(outputFormat))
      fd.append('use_utmtpt', useUtmtpt ? '1' : '0')
      const res = await fetch(apiUrl('/api/v1/workflow/qc/dalian/generate_certificate'), { method: 'POST', body: fd })
      if (!res.ok) return message.error(await readFetchErrorMessage(res))
      const fileName = getDownloadFileName(res, defaultFileName)
      const blob = await res.blob()
      try {
        const savedPath = await saveCertificateOutput(blob, fileName, nextSaveDir, outputFormat, setExportProgress)
        notification.success({ message: '大连质保书导出成功', description: `文件已保存至：${savedPath}` })
      } catch (e) {
        message.error(e instanceof Error ? e.message : '保存到本机失败')
      }
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof DOMException ? '质保书生成超时，请稍后重试' : '大连质保书生成失败')
    } finally {
      hide()
      setExporting(false)
      if (outputFormat === 'pdf') {
        setExportProgress((prev) => (prev?.startsWith('全部完成') ? prev : null))
      }
    }
  }

  const batchLiveGenerate = async (selectedRows: Record<string, unknown>[]) => {
    if (!ensureBatchDateConfirmed()) return
    if (hasPendingCertNoChanges(pendingCertNo, savedCertNo, selectedRows)) {
      message.warning('存在未保存的证书编号修改，请先点击各行【保存】后再批量生成')
      return
    }
    if (hasMissingConfirmedCertNo(savedCertNo, selectedRows)) {
      message.warning('所选行中存在未分配证书编号，请重新确认出厂日期')
      return
    }
    const nextSaveDir = await askSavePath('批量生成大连质保书', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setExporting(true)
    setExportProgress(outputFormat === 'pdf' ? '步骤 ①/③：正在生成 Word 版质保书...' : null)
    const dateText = confirmedDateText || (batchDate || dayjs()).format('YYYY-M-D')
    try {
      const { createdFiles, failed } = await runBatchCertificateExport(selectedRows, {
        outputFormat,
        useUtmtpt,
        saveDirectory: nextSaveDir,
        dateText,
        generateUrl: apiUrl('/api/v1/workflow/qc/dalian/generate_certificate'),
        fetchDetail: (orderNo, materialNo, heatNo, batchNo, orderDetailId) =>
          fetch(workflowQcDalianDetailUrl(orderNo, materialNo, heatNo, batchNo, orderDetailId, dateText, false, false)),
        getCertificateNo: (row) => savedCertNo[Number(row.id)] || pendingCertNo[Number(row.id)] || '',
        buildSaveBody: ({ detail, dateText: batchDateText, orderDetailId, orderNo, materialNo, heatNo, batchNo, certificateNo }) => {
          const baseInfo = (detail.base_info as Record<string, unknown> | undefined) || {}
          const batchValues = {
            order_no: orderNo,
            material_no: materialNo,
            certificate_no: certificateNo,
            customer: baseInfo.customer,
            contract_no: baseInfo.contract_no,
            works_no: baseInfo.works_no,
            material: baseInfo.material,
            state_of_delivery: baseInfo.state_of_delivery,
            date: dayjs(batchDateText),
          }
          return buildSavePayload({
            orderNo,
            materialNo,
            detail,
            dateText: batchDateText,
            values: batchValues,
            heatNo,
            heatTreatmentBatchNo: batchNo,
            orderDetailId,
          })
        },
        resolveFallbackFileName: ({ orderNo, heatNo, detail }) =>
          `${orderNo}_${heatNo}_${String((detail.delivery_result as Record<string, unknown> | undefined)?.name || '')}.docx`,
      }, setExportProgress)
      if (listMode === 'pending') await loadList()
      else await querySnapshots()
      if (createdFiles.length) {
        notification.success({
          message: `批量生成成功 ${createdFiles.length} 份`,
          description: createdFiles.slice(0, 3).join('\n'),
        })
      }
      if (failed.length) message.warning(`以下物料生成失败：${failed.join(', ')}`)
    } finally {
      setExporting(false)
      if (outputFormat === 'pdf') {
        setExportProgress((prev) => (prev?.startsWith('全部完成') ? prev : null))
      }
    }
  }

  const batchSnapshotGenerate = async (selectedRows: Record<string, unknown>[]) => {
    const nextSaveDir = await askSavePath('批量重生成大连质保书', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setExporting(true)
    setExportProgress(outputFormat === 'pdf' ? '步骤 ①/③：正在生成 Word 版质保书...' : null)
    try {
      const { createdFiles, failed } = await runSnapshotBatchExport(
        selectedRows,
        {
          region: 'dalian',
          outputFormat,
          useUtmtpt,
          saveDirectory: nextSaveDir,
          generateUrl: apiUrl('/api/v1/workflow/qc/dalian/generate_certificate'),
          resolveFallbackFileName: ({ orderNo, heatNo, snapshot }) => {
            const delivery = (snapshot.delivery_content as Array<Record<string, unknown>> | undefined)?.[0]
            return `${orderNo}_${heatNo}_${String(delivery?.name || '')}.docx`
          },
        },
        setExportProgress,
      )
      if (listMode === 'pending') await loadList()
      else await querySnapshots()
      if (createdFiles.length) {
        notification.success({
          message: `批量重生成成功 ${createdFiles.length} 份`,
          description: createdFiles.slice(0, 3).join('\n'),
        })
      }
      if (failed.length) message.warning(`以下物料生成失败：${failed.join(', ')}`)
    } finally {
      setExporting(false)
      if (outputFormat === 'pdf') {
        setExportProgress((prev) => (prev?.startsWith('全部完成') ? prev : null))
      }
    }
  }

  const batchGenerateCertificates = async () => {
    const selectedRows = filterSelectedQcRows(listRows, selectedListKeys, listMode)
    if (!selectedRows.length) {
      message.warning('请先勾选要生成质检书的物料')
      return
    }

    if (listMode === 'generated') {
      await batchSnapshotGenerate(selectedRows)
      return
    }

    if (hasPendingQtyChanges(pendingQty, selectedRows)) {
      message.warning('存在未保存的数量修改，请先点击各行【保存】后再批量生成')
      return
    }

    const hasPink = selectedRows.some((row) => row.has_generated_certificate)
    if (hasPink) {
      openRegenerateChoiceModal({
        onSnapshot: () =>
          batchSnapshotGenerate(
            selectedRows.filter((row) => row.snapshot_id).map((row) => ({ ...row, id: row.snapshot_id }))
          ),
        onLive: () => batchLiveGenerate(selectedRows),
      })
      return
    }

    await batchLiveGenerate(selectedRows)
  }

  if (mode === 'list') {
    return (
      <>
        <Form form={form} layout="vertical">
          <Space wrap align="start" className={styles.qcListFilterRow}>
            <Form.Item name="query_order_no" label="订单号">
              <Input />
            </Form.Item>
            <Form.Item name="query_material_no" label="物料号">
              <Input />
            </Form.Item>
            <Form.Item name="query_status" label="状态">
              <Select
                allowClear
                placeholder="全部（默认排除开始/分割/加工）"
                style={{ minWidth: 160 }}
                options={ORDER_STATUS_OPTIONS.map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
            <Form.Item label=" " colon={false}>
              <Space wrap>
                <Button type="primary" onClick={loadList}>加载待质检列表</Button>
                <Button type="primary" className={styles.qcQueryButton} onClick={querySnapshots}>查询</Button>
              </Space>
            </Form.Item>
          </Space>
          <Space wrap align="center" className={styles.qcListActionRow}>
            <Button
              type="primary"
              className={styles.qcSelectAllButton}
              onClick={() =>
                setSelectedListKeys(listRows.map((row) => qcListRowKey(row, listMode) as string | number))
              }
            >
              全选
            </Button>
            <Button type="primary" className={styles.qcSelectAllButton} onClick={() => setSelectedListKeys([])}>
              清空
            </Button>
            {listMode === 'pending' ? (
              <>
                <DatePicker
                  value={batchDate}
                  format="YYYY-M-D"
                  onChange={(v) => {
                    setBatchDate(v)
                    resetListCertState(listCertResetters)
                  }}
                />
                <Button type="primary" onClick={confirmBatchFactoryDate}>确认出厂日期</Button>
                {dateConfirmed ? <Tag color="green">已确认 {confirmedDateText}</Tag> : <Tag>出厂日期未确认</Tag>}
              </>
            ) : (
              <Tag color="orange">已生成质保书查询结果</Tag>
            )}
            <Button type="primary" className={styles.qcQueryButton} loading={exporting} onClick={batchGenerateCertificates}>
              {listMode === 'generated' ? '批量重生成质保书' : '批量生成质保书'}
            </Button>
          </Space>
        </Form>
        <CertificateExportProgress progress={exportProgress} />
        <Table
          rowKey={(row) => String(qcListRowKey(row, listMode))}
          dataSource={listRows}
          scroll={{ x: true }}
          rowClassName={(row) => qcGeneratedRowClassName(row, listMode, styles.qcGeneratedRow)}
          rowSelection={{
            selectedRowKeys: selectedListKeys,
            onChange: (keys) => setSelectedListKeys(keys as (string | number)[]),
          }}
          columns={buildQcListColumns({
            pendingQty,
            setPendingQty,
            reload: loadList,
            listMode,
            pendingCertNo: listMode === 'pending' ? pendingCertNo : undefined,
            setPendingCertNo: listMode === 'pending' ? setPendingCertNo : undefined,
            savedCertNo: listMode === 'pending' ? savedCertNo : undefined,
            setSavedCertNo: listMode === 'pending' ? setSavedCertNo : undefined,
            confirmedDateText: listMode === 'pending' ? confirmedDateText : undefined,
            onEnter: (row) =>
              enter(Number(row.id), String(row.order_no), String(row.material_no), String(row.heat_no || ''), String(row.heat_treatment_batch_no || '')),
            extraColumns: [
              { title: '订单号', dataIndex: 'order_no' },
              { title: '料号', dataIndex: 'name', render: (v?: string, row?: Record<string, unknown>) => {
                if (listMode === 'generated' && row) {
                  const delivery = (row.delivery_content as Array<Record<string, unknown>> | undefined)?.[0]
                  return String(delivery?.name || '-')
                }
                return v || '-'
              } },
              { title: '物料号', dataIndex: 'material_no' },
              { title: '图纸号', dataIndex: 'drawing_no', render: (v?: string, row?: Record<string, unknown>) => {
                if (listMode === 'generated' && row) {
                  const delivery = (row.delivery_content as Array<Record<string, unknown>> | undefined)?.[0]
                  return String(delivery?.drawing_no || '-')
                }
                return v || '-'
              } },
              { title: '条目', dataIndex: 'item_no', render: (v?: number | null) => (v != null ? v : '-') },
              ...(listMode === 'pending' ? [{ title: '状态', dataIndex: 'status' } as const] : []),
              { title: '规格型号', dataIndex: listMode === 'generated' ? ['delivery_content', 0, 'specifications'] : 'spec_model', render: (v?: string, row?: Record<string, unknown>) => {
                if (listMode === 'generated' && row) {
                  const delivery = (row.delivery_content as Array<Record<string, unknown>> | undefined)?.[0]
                  return String(delivery?.specifications || '-')
                }
                return v || '-'
              } },
              { title: '炉号', dataIndex: 'heat_no' },
              { title: '热处理批号', dataIndex: 'heat_treatment_batch_no' },
              ...(listMode === 'generated' ? buildSnapshotDisplayColumns() : []),
            ],
          })}
        />
      </>
    )
  }

  return (
    <Card
      title={
        <Space>
          <span>大连质检中</span>
          <Tag color="blue">订单号 {selectedOrderNo}</Tag>
          <Tag color="gold">料号 {delivery.name || '/'}</Tag>
          <Tag color="purple">物料号 {selectedMaterialNo}</Tag>
          <Tag color="cyan">炉号 {selectedHeatNo || '/'}</Tag>
          <Tag color="geekblue">热处理批号 {selectedHeatTreatmentBatchNo || '/'}</Tag>
          {detailDateConfirmed && certAllocation?.is_reused ? <Tag color="green">已分配编号</Tag> : null}
          {!detailDateConfirmed ? <Tag color="orange">出厂日期未确认</Tag> : null}
        </Space>
      }
      extra={<QcBackToListButton onClick={() => setMode('list')} />}
      className={styles.pageCard}
    >
      <Form form={form} layout="vertical">
        <Card size="small" title="模块一：基础与合同信息" className={styles.sectionCard}>
          <Space wrap>
            <Form.Item name="order_no" label="订单号"><Input disabled /></Form.Item>
            <Form.Item name="material_no" label="物料号"><Input disabled /></Form.Item>
            <Form.Item name="certificate_no" label="证书编号" rules={[{ required: detailDateConfirmed, message: '请先确认出厂日期' }]}>
              <Input readOnly placeholder="请先确认出厂日期" />
            </Form.Item>
            <Form.Item name="customer" label="客户名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="contract_no" label="合同号" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="works_no" label="工厂编号" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="material" label="材料"><Input /></Form.Item>
            <Form.Item name="state_of_delivery" label="交货状态"><Input /></Form.Item>
            <Form.Item name="date" label="出厂日期" rules={[{ required: true }]}>
              <DatePicker format="YYYY-M-D" onChange={handleDetailDateChange} />
            </Form.Item>
            <Button
              type="primary"
              onClick={async () => {
                try {
                  await confirmDetailFactoryDate(false)
                  message.success('出厂日期已确认，证书编号已分配')
                } catch (error) {
                  message.error(error instanceof Error ? error.message : '确认失败')
                }
              }}
            >
              确认出厂日期
            </Button>
          </Space>
        </Card>

        <Card size="small" title="模块二：交付结果" className={styles.sectionCard}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="数量">
              <Space>
                {delivery.qty}
                <Button
                  size="small"
                  onClick={() =>
                    Modal.confirm({
                      title: '修改数量将影响最终交付单据，是否继续？',
                      content: <Input type="number" defaultValue={delivery.qty} id="dl-qc-qty-input" />,
                      onOk: async () => {
                        const el = document.getElementById('dl-qc-qty-input') as HTMLInputElement | null
                        const qty = Number(el?.value || 0)
                        const fd = new FormData()
                        fd.append('order_no', selectedOrderNo)
                        fd.append('material_no', selectedMaterialNo)
                        fd.append('heat_no', selectedHeatNo)
                        fd.append('heat_treatment_batch_no', selectedHeatTreatmentBatchNo)
                        fd.append('order_detail_id', String(selectedOrderDetailId ?? ''))
                        fd.append('qty', String(qty))
                        const res = await fetch(apiUrl('/api/v1/workflow/qc/update_delivery_qty'), { method: 'POST', body: fd })
                        const data = await res.json()
                        if (!res.ok) return message.error(data.detail || '更新失败')
                        setDelivery((prev) => ({ ...prev, qty }))
                        message.success('数量已修改并记录日志')
                      },
                    })
                  }
                >
                  修改
                </Button>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="料号">{delivery.name}</Descriptions.Item>
            <Descriptions.Item label="图纸编号">{delivery.drawing_no}</Descriptions.Item>
            <Descriptions.Item label="零件号">{delivery.part_no}</Descriptions.Item>
            <Descriptions.Item label="规格">{delivery.specifications}</Descriptions.Item>
            <Descriptions.Item label="炉号">{delivery.raw_material_no}</Descriptions.Item>
            <Descriptions.Item label="热处理批号">{delivery.batch_no}</Descriptions.Item>
          </Descriptions>
          <Button
            style={{ marginTop: 8 }}
            onClick={() =>
              navigate(
                `/qc/heat-treatment?order_no=${encodeURIComponent(selectedOrderNo)}&heat_no=${encodeURIComponent(delivery.raw_material_no || '')}&batch_no=${encodeURIComponent(delivery.batch_no || '')}`
              )
            }
          >
            查看热处理记录
          </Button>
        </Card>

        <Card size="small" title="模块三：机械测试（只读，min/max 双组）" className={styles.sectionCard}>
          <Table rowKey="key" pagination={false} dataSource={mechTableRows} columns={DALIAN_MECH_COLUMNS} scroll={{ x: true }} />
        </Card>

        <Card size="small" title="模块四：化学分析（只读，数据同源）" className={styles.sectionCard}>
          <Table
            rowKey="key"
            pagination={false}
            dataSource={CHEM_FIELDS.map((item) => ({
              key: item.key,
              label: item.label,
              raw: chemRaw[item.key] || '',
              self: chemSelf[item.key] || '',
            }))}
            columns={[
              { title: '元素', dataIndex: 'label' },
              { title: '原材化验值', dataIndex: 'raw' },
              { title: '自检化验值', dataIndex: 'self' },
            ]}
          />
        </Card>

        <Space>
          <Button type="primary" onClick={save}>保存质检记录</Button>
          <Button loading={exporting} onClick={exportCert}>生成质保书并导出</Button>
        </Space>
        <CertificateExportProgress progress={exportProgress} />
      </Form>
    </Card>
  )
}
