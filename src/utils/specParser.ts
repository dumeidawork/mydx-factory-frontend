/** 与后端 extract_spec_model_fields 一致：规格=DN/NB/A，型号=PN/CL/LB/K。 */

export type SpecModelFields = {
  material_no: string
  standard_no: string
  spec: string
  model: string
  drawing_type: string
}

const SPEC_RE = /^(DN\d+|\d+NB|\d+A)$/i
const MODEL_RE = /^(PN\d+|CL\d+|\d+LB|\d+K)$/i

export function extractSpecModel(specModel: string): SpecModelFields {
  const parts = specModel.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) {
    return { material_no: '', standard_no: '', spec: '', model: '', drawing_type: '' }
  }
  let spec = ''
  let model = ''
  let specIdx = -1
  let modelIdx = -1
  for (let index = 0; index < parts.length; index += 1) {
    const up = parts[index].toUpperCase()
    if (specIdx < 0 && SPEC_RE.test(up)) {
      specIdx = index
      spec = up
    }
    if (modelIdx < 0 && MODEL_RE.test(up)) {
      modelIdx = index
      model = up
    }
  }
  let standard_no = ''
  let drawing_type = ''
  if (specIdx >= 0 || modelIdx >= 0) {
    const start = Math.min(specIdx >= 0 ? specIdx : modelIdx, modelIdx >= 0 ? modelIdx : specIdx)
    const end = Math.max(specIdx, modelIdx)
    if (start > 1) standard_no = parts.slice(1, start).join(' ').trim()
    drawing_type = parts.slice(end + 1).join(' ').trim()
  }
  return {
    material_no: parts[0],
    standard_no,
    spec,
    model,
    drawing_type,
  }
}

export function parsedFormPatch(specModel: string): Record<string, string> {
  const parsed = extractSpecModel(specModel)
  const patch: Record<string, string> = {}
  if (parsed.spec) patch.spec = parsed.spec
  if (parsed.model) patch.model = parsed.model
  if (parsed.material_no) patch.material_no = parsed.material_no
  if (parsed.standard_no) patch.standard_no = parsed.standard_no
  if (parsed.drawing_type) patch.drawing_type = parsed.drawing_type
  return patch
}

export function normalizeDrawingRevForDb(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  const match = /\s+Rev/i.exec(text)
  if (match && match.index != null) {
    return `${text.slice(0, match.index)} Rev${text.slice(match.index + match[0].length)}`
  }
  const idx = text.lastIndexOf('-')
  if (idx > 0) return `${text.slice(0, idx)} Rev${text.slice(idx + 1)}`
  return text
}

export function looksLikeDrawingRev(raw: string): boolean {
  const text = raw.trim()
  if (!text) return false
  if (/\s+Rev/i.test(text)) return true
  return /-\d+[A-Za-z0-9]*$/.test(text)
}

export function shouldNormalizeDrawingInput(raw: string): boolean {
  const text = raw.trim()
  if (!text) return false
  if (/\s+Rev/i.test(text)) return true
  if (!/-\d+[A-Za-z0-9]*$/.test(text)) return false
  if ((text.match(/-/g) || []).length === 1) return true
  return /^A5E/i.test(text)
}

export function normalizeDrawingInput(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  if (shouldNormalizeDrawingInput(text)) return normalizeDrawingRevForDb(text)
  return text
}

export function drawingNoBase(raw: string): string {
  const text = normalizeDrawingInput(raw)
  if (!text) return ''
  const match = /\s+Rev/i.exec(text)
  if (match && match.index != null) return text.slice(0, match.index).trim()
  return text
}

export function drawingRevForFilename(dbForm: string): string {
  return dbForm.trim().replace(/\s+Rev/i, '-')
}

export function buildDrawingName(parts: {
  customerCode: string
  standardNo: string
  drawingRevNo: string
  material: string
  spec: string
  model: string
  materialNo: string
  drawingType: string
}): string {
  const customer = parts.customerCode.trim()
  const standard = parts.standardNo.trim()
  const revRaw = parts.drawingRevNo.trim()
  const material = parts.material.trim()
  const drawingType = parts.drawingType.trim()
  const materialNo = parts.materialNo.trim()
  const spec = parts.spec.trim()
  const model = parts.model.trim()
  const second = revRaw ? drawingRevForFilename(normalizeDrawingRevForDb(revRaw)) : standard
  const fourth = materialNo || `${spec} ${model}`.trim()
  if (!customer || !second || !material || !fourth || !drawingType) return ''
  return [customer, second, material, fourth, drawingType].join(';')
}
