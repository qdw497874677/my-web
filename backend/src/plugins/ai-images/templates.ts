import type { AspectRatio, ImageModel } from './contracts.js'

export interface ImageTemplate {
  id: string
  label: string
  description: string
  referenceImageCount: number
  aspectRatio: AspectRatio
  prompt: string
}

export const imageTemplates: readonly ImageTemplate[] = [
  { id: 'editorial-cover', label: '刊物封面', description: '为文章创作简洁的方形编辑插画。', referenceImageCount: 0, aspectRatio: '1:1', prompt: '创作一幅适合个人刊物文章封面的原创编辑插画，构图简洁、有质感，不要包含文字、水印或标志。' },
  { id: 'photo-illustration', label: '照片插画', description: '基于一张参考照片创作方形插画。', referenceImageCount: 1, aspectRatio: '1:1', prompt: '以提供的照片为视觉参考，保留主要主体和场景特征，创作有质感的原创编辑插画，不要包含文字、水印或标志。' },
  { id: 'landscape-banner', label: '横幅配图', description: '为文章创作横向场景配图。', referenceImageCount: 0, aspectRatio: '3:2', prompt: '创作一幅适合个人刊物文章的横向场景配图，画面自然、富有叙事感，不要包含文字、水印或标志。' },
]

export function supportsTemplate(model: ImageModel, template: ImageTemplate): boolean {
  return model.maxReferenceImages >= template.referenceImageCount && model.aspectRatios.includes(template.aspectRatio)
}
