import { apiUrl } from './api'
import {
  CertificateOutputFormat,
  CertificateProgressCallback,
  finalizePdfBatch,
  getDownloadFileName,
  readFetchErrorMessage,
  runDirectoryWordToPdf,
  saveCertificateOutput,
  saveCertificateWordBlob,
  serverCertificateOutputFormat,
} from './clientFileSave'

export type BatchCertificateRow = Record<string, unknown>

export type BatchCertificateConfig = {
  outputFormat: CertificateOutputFormat
  useUtmtpt: boolean
  saveDirectory: string
  dateText: string
  generateUrl: string
  fetchDetail: (
    orderNo: string,
    materialNo: string,
    heatNo: string,
    batchNo: string,
    orderDetailId: number,
  ) => Promise<Response>
  buildSaveBody: (args: {
    row: BatchCertificateRow
    detail: Record<string, unknown>
    dateText: string
    orderDetailId: number
    orderNo: string
    materialNo: string
    heatNo: string
    batchNo: string
    certificateNo: string
  }) => Record<string, unknown>
  resolveFallbackFileName: (args: {
    row: BatchCertificateRow
    detail: Record<string, unknown>
    materialNo: string
    orderNo: string
    heatNo: string
    recordId: number
  }) => string
  getCertificateNo?: (row: BatchCertificateRow) => string
}

export type BatchCertificateResult = {
  createdFiles: string[]
  failed: string[]
}

async function generateWordForRow(
  config: BatchCertificateConfig,
  row: BatchCertificateRow,
  index: number,
  total: number,
  onProgress?: CertificateProgressCallback,
): Promise<{ fileName: string; blob: Blob } | null> {
  const orderDetailId = Number(row.id)
  const orderNo = String(row.order_no || '')
  const materialNo = String(row.material_no || '')
  const heatNo = String(row.heat_no || '')
  const batchNo = String(row.heat_treatment_batch_no || '')
  const rowLabel = `${materialNo}(ID:${orderDetailId})`

  onProgress?.(`步骤 ①/③：正在生成 Word 版（${index + 1}/${total}）物料号 ${materialNo}...`)

  await fetch(apiUrl('/api/v1/workflow/qc/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_detail_id: orderDetailId,
      order_no: orderNo,
      material_no: materialNo,
      heat_no: heatNo,
      heat_treatment_batch_no: batchNo,
    }),
  })

  const detailRes = await config.fetchDetail(orderNo, materialNo, heatNo, batchNo, orderDetailId)
  const detail = (await detailRes.json()) as Record<string, unknown>
  if (!detailRes.ok) {
    throw new Error(`${rowLabel}: ${await readFetchErrorMessage(detailRes)}`)
  }

  const saveRes = await fetch(apiUrl('/api/v1/workflow/qc/save'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      config.buildSaveBody({
        row,
        detail,
        dateText: config.dateText,
        orderDetailId,
        orderNo,
        materialNo,
        heatNo,
        batchNo,
        certificateNo: config.getCertificateNo?.(row) || '',
      }),
    ),
  })
  const saveData = (await saveRes.json()) as { record_id?: number }
  if (!saveRes.ok) {
    throw new Error(`${rowLabel}: ${await readFetchErrorMessage(saveRes)}`)
  }

  const fd = new FormData()
  fd.append('record_id', String(saveData.record_id))
  fd.append('output_format', serverCertificateOutputFormat(config.outputFormat))
  fd.append('use_utmtpt', config.useUtmtpt ? '1' : '0')

  const genRes = await fetch(config.generateUrl, { method: 'POST', body: fd })
  if (!genRes.ok) {
    throw new Error(`${rowLabel}: ${await readFetchErrorMessage(genRes)}`)
  }

  const fileName = getDownloadFileName(
    genRes,
    config.resolveFallbackFileName({
      row,
      detail,
      materialNo,
      orderNo,
      heatNo,
      recordId: Number(saveData.record_id),
    }),
  )
  const blob = await genRes.blob()
  return { fileName, blob }
}

export async function runBatchCertificateExport(
  rows: BatchCertificateRow[],
  config: BatchCertificateConfig,
  onProgress?: CertificateProgressCallback,
): Promise<BatchCertificateResult> {
  const createdFiles: string[] = []
  const failed: string[] = []
  const total = rows.length

  if (config.outputFormat === 'pdf') {
    const wordSaved: string[] = []

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      try {
        const generated = await generateWordForRow(config, row, index, total, onProgress)
        if (!generated) continue
        const savedPath = await saveCertificateWordBlob(
          generated.blob,
          generated.fileName,
          config.saveDirectory,
        )
        wordSaved.push(savedPath)
      } catch (e) {
        failed.push(e instanceof Error ? e.message : '未知错误')
      }
    }

    if (!wordSaved.length) {
      return { createdFiles, failed }
    }

    onProgress?.(`步骤 ①/③ 完成：已生成 ${wordSaved.length} 份 Word`)

    try {
      const pdfPaths = await runDirectoryWordToPdf(config.saveDirectory, onProgress)
      const finalized = finalizePdfBatch(pdfPaths, onProgress)
      createdFiles.push(...finalized)
    } catch (e) {
      failed.push(e instanceof Error ? e.message : '批量 Word 转 PDF 失败')
    }

    return { createdFiles, failed }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    try {
      const generated = await generateWordForRow(config, row, index, total, onProgress)
      if (!generated) continue
      const saved = await saveCertificateOutput(
        generated.blob,
        generated.fileName,
        config.saveDirectory,
        'word',
        onProgress,
      )
      createdFiles.push(saved)
    } catch (e) {
      failed.push(e instanceof Error ? e.message : '未知错误')
    }
  }

  return { createdFiles, failed }
}
