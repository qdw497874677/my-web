import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rasterType } from '../src/publication/raster.js'

// JPEGs generated with cjpeg (128x128 gradient, restart 1B/progressive);
// animation generated with ImageMagick (two 2x2 frames).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/raster/${name}`, import.meta.url))
const gif = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
const webp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=', 'base64')

function chunk(type: string, data: Buffer) {
  const header = Buffer.alloc(8)
  header.write(type, 0, 4, 'ascii')
  header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data, Buffer.alloc(data.length & 1)])
}
function riff(...chunks: Buffer[]) {
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]), header = Buffer.alloc(8)
  header.write('RIFF'); header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

describe('raster structural validation', () => {
  it('matches raster signatures and chunk types byte for byte', () => {
    for (const [image, offsets] of [[gif, [0]], [webp, [0, 8, 12]]] as const) {
      expect(rasterType(image)).toBeDefined()
      for (const offset of offsets) {
        const corrupt = Buffer.from(image)
        corrupt[offset] = corrupt[offset]! | 0x80
        expect(rasterType(corrupt)).toBeUndefined()
      }
    }
    const frame = Buffer.from(webp.subarray(12))
    frame[0] = frame[0]! | 0x80
    expect(rasterType(riff(chunk('ANMF', Buffer.concat([Buffer.alloc(16), frame]))))).toBeUndefined()
  })

  it('accepts repeated JPEG fill bytes before a restart within entropy data', () => {
    const jpeg = fixture('restart.jpg')
    const marker = jpeg.findIndex((byte, index) => byte === 0xff && jpeg[index + 1] !== undefined && jpeg[index + 1]! >= 0xd0 && jpeg[index + 1]! <= 0xd7)
    expect(marker).toBeGreaterThan(0)
    const withFill = Buffer.concat([jpeg.subarray(0, marker), Buffer.from([0xff, 0xff]), jpeg.subarray(marker)])
    expect(rasterType(jpeg)).toBe('image/jpeg')
    expect(rasterType(withFill)).toBe('image/jpeg')
    expect(rasterType(withFill.subarray(0, marker + 3))).toBeUndefined()
  })

  it('accepts a real progressive multi-scan JPEG and rejects an incomplete one', () => {
    const jpeg = fixture('progressive.jpg')
    expect(rasterType(jpeg)).toBe('image/jpeg')
    expect(rasterType(jpeg.subarray(0, -2))).toBeUndefined()
  })

  it('requires a valid GIF LZW minimum code size and a nonempty image data block', () => {
    const descriptor = gif.indexOf(Buffer.from([0x2c,0,0,0,0,1,0,1,0,0]))
    expect(descriptor).toBeGreaterThan(0)
    const codeSize = descriptor + 10
    expect(rasterType(gif)).toBe('image/gif')
    for (const value of [0, 1, 9, 255]) {
      const bad = Buffer.from(gif); bad[codeSize] = value
      expect(rasterType(bad)).toBeUndefined()
    }
    const empty = Buffer.concat([gif.subarray(0, codeSize + 1), Buffer.from([0, 0x3b])])
    expect(rasterType(empty)).toBeUndefined()
    expect(rasterType(gif.subarray(0, -2))).toBeUndefined()
  })

  it('requires each WebP animation frame to contain a bounded valid image chunk', () => {
    const animated = fixture('animated.webp')
    expect(rasterType(animated)).toBe('image/webp')
    expect(rasterType(fixture('animated-lossless.webp'))).toBe('image/webp')
    expect(rasterType(animated.subarray(0, -1))).toBeUndefined()
    const frameHeader = Buffer.alloc(16)
    expect(rasterType(riff(chunk('ANMF', Buffer.concat([frameHeader, Buffer.alloc(32)]))))).toBeUndefined()
    expect(rasterType(riff(chunk('ANMF', frameHeader)))).toBeUndefined()
    const nested = webp.subarray(12)
    expect(rasterType(riff(chunk('ANMF', Buffer.concat([frameHeader, nested]))))).toBe('image/webp')
    const oversized = Buffer.from(nested); oversized.writeUInt32LE(oversized.readUInt32LE(4) + 100, 4)
    expect(rasterType(riff(chunk('ANMF', Buffer.concat([frameHeader, oversized]))))).toBeUndefined()
    const invalid = Buffer.from(nested); invalid[11] = 0
    expect(rasterType(riff(chunk('ANMF', Buffer.concat([frameHeader, invalid]))))).toBeUndefined()
    expect(rasterType(riff(chunk('ANMF', Buffer.concat([frameHeader, nested, nested]))))).toBeUndefined()
  })
})
