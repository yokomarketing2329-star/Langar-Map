const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024
const MAX_SIDE = 1280

/**
 * Resize + re-encode as JPEG. Drawing to a canvas drops ALL metadata (EXIF GPS, camera info),
 * which protects the privacy of whoever took the photo.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not_image')
  if (file.size > MAX_INPUT_BYTES) throw new Error('too_big')

  let source: ImageBitmap | HTMLImageElement
  let w: number, h: number
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
    w = source.width; h = source.height
  } catch {
    source = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = () => rej(new Error('not_image'))
      img.src = URL.createObjectURL(file)
    })
    w = source.naturalWidth; h = source.naturalHeight
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('not_image')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  for (const q of [0.78, 0.65, 0.5, 0.38]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q))
    if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob
  }
  throw new Error('too_big')
}
