// Client-side image compression before upload.
//
// Why client-side: the user's bottleneck is the upload bandwidth from China to
// HK. Compressing 5 MB JPEG → ~500 KB WebP locally takes <1 s on phone CPU
// but saves ~9 s of cellular upload time. Net win is huge in weak networks
// (Xinjiang scenic areas), and there's no extra server cost or complexity.
//
// Returns a new File with type `image/webp` (or original if it doesn't make
// sense to compress — see `shouldCompress`). The library auto-handles HEIC
// from iPhone via canvas decode.

import imageCompression from 'browser-image-compression'

const DEFAULTS = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
  fileType: 'image/webp',
  initialQuality: 0.82,
}

// Skip compression for:
// - already small files (overhead would offset gains)
// - GIFs (we'd lose animation; users uploading GIFs usually want them as-is)
// - non-images (caller's responsibility but defensive check)
function shouldCompress(file) {
  if (!file.type.startsWith('image/')) return false
  if (file.type === 'image/gif') return false
  if (file.size < 500 * 1024) return false
  return true
}

// Returns a File. Falls back to original on any error so upload still proceeds.
export async function compressImage(file, overrides = {}) {
  if (!shouldCompress(file)) return file

  const options = { ...DEFAULTS, ...overrides }
  try {
    const compressed = await imageCompression(file, options)
    // Library returns a File but its name may keep the original extension.
    // Rename to .webp so the server-side content-type check (which trusts the
    // upload's `type` field, not the extension) still recognizes it cleanly,
    // and so downloads have the right extension.
    const newName = file.name.replace(/\.[^./\\]+$/, '') + '.webp'
    return new File([ compressed ], newName, { type: 'image/webp' })
  } catch (err) {
    // Surface the error in console for debugging but don't block the upload.
    // Worst case: original (uncompressed) file gets uploaded.
    console.warn('[compressImage] failed, uploading original:', err)
    return file
  }
}
