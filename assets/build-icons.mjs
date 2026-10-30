import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const svg = await readFile('assets/icon.svg')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()))
const ico = await pngToIco(pngs)
await writeFile('assets/icon.ico', ico)
await writeFile('public/app-icon.ico', ico)
await writeFile('public/icon.svg', svg)
console.log(`Generated multi-resolution ICO from assets/icon.svg (${sizes.join(', ')} px) and copied SVG to public/icon.svg`)
