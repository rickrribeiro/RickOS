import type { AiImageInput } from '../../../shared/aiConversations'
import { IMAGE_MEDIA_TYPES } from '../../../shared/aiConversations'
import { t } from '../../i18n'

/**
 * Prepara imagens para o Claude no navegador: reduz o lado maior para 1568px (o que o
 * modelo aproveita; acima disso ele mesmo reduz) e gera uma miniatura leve para o
 * histórico. GIFs pequenos seguem intactos (animação).
 */

const MAX_EDGE = 1568
const THUMB_EDGE = 200
const PASSTHROUGH_BYTES = 900 * 1024

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('ai.imageReadFail')))
    img.src = src
  })
}

function draw(img: HTMLImageElement, maxEdge: number, type: string, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff' // transparência vira branco no JPEG
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL(type, quality)
}

const b64 = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1)

export async function prepareImage(file: File): Promise<AiImageInput> {
  if (!IMAGE_MEDIA_TYPES.includes(file.type as AiImageInput['mediaType'])) throw new Error(`Formato não suportado: ${file.type || file.name}`)
  const original = await readAsDataUrl(file)
  const img = await loadImage(original)
  const thumb = draw(img, THUMB_EDGE, 'image/jpeg', 0.7)
  const big = Math.max(img.naturalWidth, img.naturalHeight) > MAX_EDGE
  if (!big && file.size <= PASSTHROUGH_BYTES) {
    return { mediaType: file.type as AiImageInput['mediaType'], data: b64(original), thumb }
  }
  // PNG com muitos pixels fica enorme: reduz e regrava (JPEG para fotos/prints grandes)
  const type = file.type === 'image/png' && !big ? 'image/png' : 'image/jpeg'
  const data = draw(img, MAX_EDGE, type, 0.88)
  return { mediaType: type as AiImageInput['mediaType'], data: b64(data), thumb }
}

/** Arquivos de imagem de um colar/soltar. */
export function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return []
  const out: File[] = []
  for (let i = 0; i < list.length; i++) {
    const it = list[i] as File | DataTransferItem
    const f = it instanceof File ? it : it.kind === 'file' ? it.getAsFile() : null
    if (f && f.type.startsWith('image/')) out.push(f)
  }
  return out
}
