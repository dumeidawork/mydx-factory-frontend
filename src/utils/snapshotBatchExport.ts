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

export type SnapshotRow = Record<string, unknown>

export type SnapshotBatchConfig = {
  region: 'france' | 'dalian'
  outputFormat: CertificateOutputFormat
  useUtmtpt: boolean
  saveDirectory: string
  generateUrl: string
  resolveFallbackFileName: (args: {
    snapshot: SnapshotRow
    recordId: number
    materialNo: string
    orderNo: string
    heatNo: string
  }) => string
}

export type BatchCertificateResult = {
  createdFiles: string[]
  failed: string[]
}

async function generateFromPreparedRecord(
  config: SnapshotBatchConfig,
  snapshot: SnapshotRow,
  recordId: number,
  index: number,
  total: number,
  onProgress?: CertificateProgressCallback,
): Promise<{ fileName: string; blob: Blob } | null> {
  const materialNo = String(snapshot.material_no || '')
  const orderNo = String(snapshot.order_no || '')
  const heatNo = String(snapshot.heat_no || '')
  const rowLabel = `${materialNo}(快照:${String(snapshot.id || snapshot.snapshot_id || '')})`

  onProgress?.(`步骤 ①/③：正在生成 Word 版（${index + 1}/${total}）${rowLabel}...`)

  const fd = new FormData()
  fd.append('record_id', String(recordId))
  fd.append('output_format', serverCertificateOutputFormat(config.outputFormat))
  fd.append('use_utmtpt', config.useUtmtpt ? '1' : '0')

  const genRes = await fetch(config.generateUrl, { method: 'POST', body: fd })
  if (!genRes.ok) {
    throw new Error(`${rowLabel}: ${await readFetchErrorMessage(genRes)}`)
  }

  const fileName = getDownloadFileName(
    genRes,
    config.resolveFallbackFileName({
      snapshot,
      recordId,
      materialNo,
      orderNo,
      heatNo,
    }),
  )
  const blob = await genRes.blob()
  return { fileName, blob }
}

export async function runSnapshotBatchExport(
  snapshots: SnapshotRow[],
  config: SnapshotBatchConfig,
  onProgress?: CertificateProgressCallback,
): Promise<BatchCertificateResult> {
  const createdFiles: string[] = []
  const failed: string[] = []
  const total = snapshots.length

  if (!snapshots.length) {
    return { createdFiles, failed }
  }

  const snapshotIds = snapshots.map((row) => Number(row.id ?? row.snapshot_id))
  const prepareRes = await fetch(apiUrl('/api/v1/workflow/qc/snapshots/batch_generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot_ids: snapshotIds,
      region: config.region,
      output_format: config.outputFormat,
      use_utmtpt: config.useUtmtpt,
    }),
  })
  const prepareData = (await prepareRes.json()) as {
    results?: Array<{ snapshot_id: number; ok: boolean; record_id?: number; error?: string }>
  }
  if (!prepareRes.ok) {
    failed.push(await readFetchErrorMessage(prepareRes))
    return { createdFiles, failed }
  }

  const resultMap = new Map<number, { recordId?: number; error?: string }>()
  for (const item of prepareData.results || []) {
    if (item.ok && item.record_id) {
      resultMap.set(item.snapshot_id, { recordId: item.record_id })
    } else {
      resultMap.set(item.snapshot_id, { error: item.error || '保存快照失败' })
    }
  }

  if (config.outputFormat === 'pdf') {
    const wordSaved: string[] = []

    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index]
      const sid = Number(snapshot.id ?? snapshot.snapshot_id)
      const prepared = resultMap.get(sid)
      if (!prepared?.recordId) {
        failed.push(prepared?.error || `快照 ${sid}: 准备失败`)
        continue
      }
      try {
        const generated = await generateFromPreparedRecord(
          config,
          snapshot,
          prepared.recordId,
          index,
          total,
          onProgress,
        )
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

  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index]
    const sid = Number(snapshot.id ?? snapshot.snapshot_id)
    const prepared = resultMap.get(sid)
    if (!prepared?.recordId) {
      failed.push(prepared?.error || `快照 ${sid}: 准备失败`)
      continue
    }
    try {
      const generated = await generateFromPreparedRecord(
        config,
        snapshot,
        prepared.recordId,
        index,
        total,
        onProgress,
      )
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

export async function runSnapshotBatchExportByIds(
  snapshotIds: number[],
  snapshotsById: Map<number, SnapshotRow>,
  config: SnapshotBatchConfig,
  onProgress?: CertificateProgressCallback,
): Promise<BatchCertificateResult> {
  const snapshots = snapshotIds
    .map((id) => snapshotsById.get(id))
    .filter((row): row is SnapshotRow => Boolean(row))
  return runSnapshotBatchExport(snapshots, config, onProgress)
}
