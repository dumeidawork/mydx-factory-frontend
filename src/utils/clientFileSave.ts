import { apiUrl } from './api'

export type CertificateOutputFormat = 'word' | 'pdf'

export type CertificateProgressCallback = (message: string) => void

export function isElectronClient(): boolean {
  return typeof window !== 'undefined' && !!window.erp?.saveGeneratedFile
}

/** 服务器始终生成 Word；PDF 由桌面客户端本地转换。 */
export function serverCertificateOutputFormat(_format: CertificateOutputFormat): 'word' {
  return 'word'
}

export function certificateExportLoadingText(format: CertificateOutputFormat): string {
  return format === 'pdf' ? '正在生成 Word 并转换 PDF，请稍候...' : '质保书文件生成中，请稍候...'
}

export const PDF_EXPORT_STEP1 = '步骤 ①/③：正在生成 Word 版质保书...'
export const PDF_EXPORT_STEP2 = '步骤 ②/③：正在批量 Word 转 PDF，请稍候...'
export const PDF_EXPORT_STEP3 = '步骤 ③/③：正在清理转换脚本...'

/** 从响应头解析下载文件名（支持 filename*） */
export function getDownloadFileName(response: Response, fallback: string): string {
  const cd = response.headers.get('Content-Disposition')
  if (!cd) return fallback

  const star = /filename\*=UTF-8''([^;\n]+)/i.exec(cd)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, ''))
    } catch {
      return star[1].trim()
    }
  }

  const quoted = /filename="([^"]+)"/i.exec(cd)
  if (quoted?.[1]) return quoted[1].trim()

  const plain = /filename=([^;\n]+)/i.exec(cd)
  if (plain?.[1]) return plain[1].trim().replace(/^["']|["']$/g, '')

  return fallback
}

export async function readFetchErrorMessage(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const data = (await res.json().catch(() => null)) as { detail?: unknown } | null
    const d = data?.detail
    if (typeof d === 'string') return d
    if (d != null) return JSON.stringify(d)
    return '请求失败'
  }
  const t = await res.text().catch(() => '')
  return t || res.statusText || '请求失败'
}

function normalizeDocxFileName(fileName: string): string {
  const trimmed = fileName.trim() || 'certificate.docx'
  if (/\.docx$/i.test(trimmed)) return trimmed
  if (/\.pdf$/i.test(trimmed)) return trimmed.replace(/\.pdf$/i, '.docx')
  if (/\.doc$/i.test(trimmed)) return trimmed.replace(/\.doc$/i, '.docx')
  return `${trimmed}.docx`
}

function docxPathToPdfPath(docxPath: string): string {
  return docxPath.replace(/\.docx$/i, '.pdf')
}

/**
 * 将生成的文件保存到客户本机：Electron 下写入指定目录；浏览器则触发下载。
 */
export async function saveGeneratedBlob(blob: Blob, fileName: string, directoryPath: string): Promise<string> {
  const erp = typeof window !== 'undefined' ? window.erp : undefined
  const normalizedDirectory = directoryPath.trim()

  if (erp?.saveGeneratedFile) {
    const arrayBuffer = await blob.arrayBuffer()
    const result = await erp.saveGeneratedFile({
      fileName,
      directoryPath: normalizedDirectory,
      arrayBuffer,
    })
    if (!result?.ok) throw new Error(result?.error || '保存到本机失败')
    return result.path || previewJoinedPath(normalizedDirectory, fileName)
  }

  const fd = new FormData()
  fd.append('file', blob, fileName)
  fd.append('file_name', fileName)
  fd.append('directory_path', normalizedDirectory)
  const res = await fetch(apiUrl('/api/v1/workflow/generated-files/save'), {
    method: 'POST',
    body: fd,
  })
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { path?: string }
    return data.path || previewJoinedPath(normalizedDirectory, fileName)
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
  return fileName
}

/** 仅保存 Word 版质保书（步骤①） */
export async function saveCertificateWordBlob(
  blob: Blob,
  fileName: string,
  directoryPath: string,
): Promise<string> {
  return saveGeneratedBlob(blob, normalizeDocxFileName(fileName), directoryPath)
}

function assertPdfElectronClient(): void {
  if (!isElectronClient() || !window.erp?.runWordPdfBat) {
    throw new Error('PDF 导出请使用 Windows 桌面客户端，并确保本机已安装 Microsoft Word 或 WPS')
  }
}

/** 步骤②：在指定目录运行 word_pdf.bat 批量转换 */
export async function runDirectoryWordToPdf(
  directoryPath: string,
  onProgress?: CertificateProgressCallback,
): Promise<string[]> {
  assertPdfElectronClient()
  onProgress?.(PDF_EXPORT_STEP2)

  const result = await window.erp!.runWordPdfBat({
    directoryPath: directoryPath.trim(),
  })
  if (!result?.ok) {
    throw new Error(result?.error || '本机 Word/WPS 批量转 PDF 失败')
  }
  return result.converted || []
}

/** 步骤③：汇总 PDF 结果（bat 清理由 IPC 完成） */
export function finalizePdfBatch(
  pdfPaths: string[],
  onProgress?: CertificateProgressCallback,
): string[] {
  onProgress?.(PDF_EXPORT_STEP3)
  if (!pdfPaths.length) {
    throw new Error('未找到已生成的 PDF 文件')
  }
  onProgress?.(`全部完成：成功 ${pdfPaths.length} 份 PDF`)
  return pdfPaths
}

/**
 * PDF 三步导出：① 保存 Word → ② bat 批量转 PDF → ③ 清理脚本并汇总。
 */
export async function exportCertificatePdfThreeStep(
  blob: Blob,
  fileName: string,
  directoryPath: string,
  onProgress?: CertificateProgressCallback,
): Promise<string[]> {
  onProgress?.(PDF_EXPORT_STEP1)
  await saveCertificateWordBlob(blob, fileName, directoryPath)
  const pdfPaths = await runDirectoryWordToPdf(directoryPath, onProgress)
  return finalizePdfBatch(pdfPaths, onProgress)
}

/**
 * 质保书导出：Word 直接保存；PDF 走三步流程（生成 Word → bat 批量转 PDF → 清理 bat）。
 */
export async function saveCertificateOutput(
  blob: Blob,
  fileName: string,
  directoryPath: string,
  format: CertificateOutputFormat,
  onProgress?: CertificateProgressCallback,
): Promise<string> {
  if (format === 'word') {
    return saveGeneratedBlob(blob, normalizeDocxFileName(fileName), directoryPath)
  }

  const pdfPaths = await exportCertificatePdfThreeStep(blob, fileName, directoryPath, onProgress)
  const expectedPdf = docxPathToPdfPath(normalizeDocxFileName(fileName))
  const matched = pdfPaths.find((p) => p.replace(/\\/g, '/').toLowerCase().endsWith(`/${expectedPdf.toLowerCase()}`))
  return matched || pdfPaths[pdfPaths.length - 1]
}

function previewJoinedPath(dir: string, file: string): string {
  if (!dir.trim()) return file
  const sep = dir.includes('/') ? '/' : '\\'
  return `${dir.replace(/[/\\]+$/, '')}${sep}${file}`
}
