export const aspectRatios = ['1:1', '2:3', '3:2'] as const
export type AspectRatio = typeof aspectRatios[number]

export const imageMediaTypes = ['image/png', 'image/jpeg', 'image/webp'] as const
export type ImageMediaType = typeof imageMediaTypes[number]
export const maxReferenceImageBytes = 5 * 1024 * 1024
export const maxImageOutputBytes = 12 * 1024 * 1024
export interface RasterImage {
  bytes: Buffer
  mimeType: ImageMediaType
}

export interface GenerationInput {
  prompt: string
  aspectRatio: AspectRatio
  references: readonly RasterImage[]
}

export interface ImageModel {
  id: string
  label: string
  maxReferenceImages: number
  aspectRatios: readonly AspectRatio[]
  generate(input: GenerationInput, signal: AbortSignal): Promise<RasterImage>
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const riffSignature = Buffer.from('RIFF')
const webpSignature = Buffer.from('WEBP')

export function detectRasterMime(bytes: Buffer): ImageMediaType | undefined {
  if (bytes.subarray(0, 8).equals(pngSignature)) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 4).equals(riffSignature) && bytes.subarray(8, 12).equals(webpSignature)) return 'image/webp'
  return undefined
}
