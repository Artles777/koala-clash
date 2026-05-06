/* eslint-disable @typescript-eslint/explicit-function-return-type */
import fs from 'fs'
import AdmZip from 'adm-zip'
import path from 'path'
import zlib from 'zlib'
import { extract } from 'tar'
import { execSync } from 'child_process'

const cwd = process.cwd()
const TEMP_DIR = path.join(cwd, 'node_modules/.temp')
let arch = process.arch
const platform = process.platform
if (process.argv.slice(2).length !== 0) {
  arch = process.argv.slice(2)[0].replace('--', '')
}

if (process.env.SKIP_PREPARE === '1') {
  console.log('Skipping prepare script...')
  process.exit(0)
}

/* ======= mihomo alpha======= */
const MIHOMO_ALPHA_RELEASE_API_URL =
  'https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/Prerelease-Alpha'
let MIHOMO_ALPHA_ASSET

const MIHOMO_ALPHA_MAP = {
  'win32-x64': 'mihomo-windows-amd64-v1',
  'win32-ia32': 'mihomo-windows-386',
  'win32-arm64': 'mihomo-windows-arm64',
  'darwin-x64': 'mihomo-darwin-amd64-v1',
  'darwin-arm64': 'mihomo-darwin-arm64',
  'linux-x64': 'mihomo-linux-amd64-v1',
  'linux-arm64': 'mihomo-linux-arm64'
}

async function resolveLatestAlphaAsset() {
  const release = await fetchJson(MIHOMO_ALPHA_RELEASE_API_URL)
  const assetPrefix = MIHOMO_ALPHA_MAP[`${platform}-${arch}`]
  const assetExt = platform === 'win32' ? '.zip' : '.gz'
  const assets = Array.isArray(release.assets) ? release.assets : []
  const candidates = findReleaseAssets(assets, assetPrefix, assetExt)
  const asset = choosePreferredAsset(candidates)
  const releaseTag = requireString(release.tag_name, 'mihomo alpha release tag')

  if (!asset) {
    console.warn(
      `[WARN]: mihomo-alpha has no ${platform}-${arch} ${assetExt} asset in ${releaseTag}; skipping preview core`
    )
    removeSidecarTarget(`mihomo-alpha${platform === 'win32' ? '.exe' : ''}`)
    MIHOMO_ALPHA_ASSET = undefined
    return
  }

  MIHOMO_ALPHA_ASSET = asset
  console.log(`Latest alpha asset: ${asset.name}`)
}

/* ======= mihomo release ======= */
const MIHOMO_RELEASE_API_URL = 'https://api.github.com/repos/MetaCubeX/mihomo/releases/latest'
let MIHOMO_VERSION
let MIHOMO_ASSET

const MIHOMO_MAP = {
  'win32-x64': 'mihomo-windows-amd64-v1',
  'win32-ia32': 'mihomo-windows-386',
  'win32-arm64': 'mihomo-windows-arm64',
  'darwin-x64': 'mihomo-darwin-amd64-v1',
  'darwin-arm64': 'mihomo-darwin-arm64',
  'linux-x64': 'mihomo-linux-amd64-v1',
  'linux-arm64': 'mihomo-linux-arm64'
}

async function resolveLatestReleaseAsset() {
  const release = await fetchJson(MIHOMO_RELEASE_API_URL)
  const assetPrefix = MIHOMO_MAP[`${platform}-${arch}`]
  const assetExt = platform === 'win32' ? '.zip' : '.gz'
  const assets = Array.isArray(release.assets) ? release.assets : []
  const candidates = findReleaseAssets(assets, assetPrefix, assetExt)
  const asset = choosePreferredAsset(candidates)

  if (!asset) {
    throw new Error(
      `mihomo release ${release.tag_name ?? '<unknown>'} has no ${platform}-${arch} ${assetExt} asset matching ${assetPrefix}`
    )
  }

  MIHOMO_VERSION = requireString(release.tag_name, 'latest mihomo release tag')
  MIHOMO_ASSET = asset
  console.log(`Latest release asset: ${asset.name} (${MIHOMO_VERSION})`)
}

/*
 * check available
 */
if (!MIHOMO_MAP[`${platform}-${arch}`]) {
  throw new Error(`unsupported platform "${platform}-${arch}"`)
}

if (!MIHOMO_ALPHA_MAP[`${platform}-${arch}`]) {
  throw new Error(`unsupported platform "${platform}-${arch}"`)
}

/**
 * core info
 */
function MihomoAlpha() {
  const isWin = platform === 'win32'
  if (!MIHOMO_ALPHA_ASSET) return undefined
  const zipFile = MIHOMO_ALPHA_ASSET.name
  const exeFile = zipFile.replace(/\.(zip|gz)$/i, isWin ? '.exe' : '')

  return {
    name: 'mihomo-alpha',
    targetFile: `mihomo-alpha${isWin ? '.exe' : ''}`,
    exeFile,
    zipFile,
    downloadURL: MIHOMO_ALPHA_ASSET.browser_download_url
  }
}

function mihomo() {
  const isWin = platform === 'win32'
  if (!MIHOMO_ASSET) throw new Error('mihomo release asset was not resolved')
  const zipFile = MIHOMO_ASSET.name
  const exeFile = zipFile.replace(/\.(zip|gz)$/i, isWin ? '.exe' : '')

  return {
    name: 'mihomo',
    targetFile: `mihomo${isWin ? '.exe' : ''}`,
    exeFile,
    zipFile,
    downloadURL: MIHOMO_ASSET.browser_download_url
  }
}
/**
 * download sidecar and rename
 */
async function resolveSidecar(binInfo) {
  if (!binInfo) return
  const { name, targetFile, zipFile, exeFile, downloadURL } = binInfo

  const sidecarDir = path.join(cwd, 'extra', 'sidecar')
  const sidecarPath = path.join(sidecarDir, targetFile)
  const isWin = platform === 'win32'

  fs.mkdirSync(sidecarDir, { recursive: true })
  const tempDir = path.join(TEMP_DIR, name)
  const tempZip = path.join(tempDir, zipFile)
  const tempSidecar = path.join(tempDir, targetFile)

  fs.mkdirSync(tempDir, { recursive: true })
  try {
    if (!fs.existsSync(tempZip)) {
      await downloadFile(downloadURL, tempZip)
    }

    if (zipFile.endsWith('.zip')) {
      const zip = new AdmZip(tempZip)
      const entry = resolveZipExecutableEntry(zip, exeFile, isWin)
      console.log(`[DEBUG]: "${name}" executable entry`, entry.entryName)
      zip.extractEntryTo(entry, tempDir, false, true)
      fs.renameSync(path.join(tempDir, path.basename(entry.entryName)), tempSidecar)
      finalizeSidecar(tempSidecar, sidecarPath, name)
      console.log(`[INFO]: "${name}" unzip finished`)
    } else if (zipFile.endsWith('.tgz')) {
      // tgz
      fs.mkdirSync(tempDir, { recursive: true })
      await extract({
        cwd: tempDir,
        file: tempZip
      })
      const files = fs.readdirSync(tempDir)
      console.log(`[DEBUG]: "${name}" files in tempDir:`, files)
      const extractedFile = files.find((file) => file.startsWith('虚空终端-'))
      if (extractedFile) {
        const extractedFilePath = path.join(tempDir, extractedFile)
        fs.renameSync(extractedFilePath, tempSidecar)
        finalizeSidecar(tempSidecar, sidecarPath, name)
        console.log(`[INFO]: "${name}" file renamed to "${sidecarPath}"`)
      } else {
        throw new Error(`Expected file not found in ${tempDir}`)
      }
    } else {
      // gz
      const readStream = fs.createReadStream(tempZip)
      const writeStream = fs.createWriteStream(tempSidecar)
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          console.error(`[ERROR]: "${name}" gz failed:`, error.message)
          reject(error)
        }
        readStream
          .pipe(zlib.createGunzip().on('error', onError))
          .pipe(writeStream)
          .on('finish', () => {
            console.log(`[INFO]: "${name}" gunzip finished`)
            resolve()
          })
          .on('error', onError)
      })
      finalizeSidecar(tempSidecar, sidecarPath, name)
    }
  } catch (err) {
    if (fs.existsSync(tempSidecar)) fs.rmSync(tempSidecar)
    throw err
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * download the file to the extra dir
 */
async function resolveResource(binInfo) {
  const { file, downloadURL, needExecutable = false } = binInfo

  const resDir = path.join(cwd, 'extra', 'files')
  const targetPath = path.join(resDir, file)

  fs.mkdirSync(resDir, { recursive: true })
  await downloadFile(downloadURL, targetPath)

  if (needExecutable && platform !== 'win32') {
    execSync(`chmod 755 ${targetPath}`)
    console.log(`[INFO]: ${file} chmod finished`)
  }

  console.log(`[INFO]: ${file} finished`)
}

/**
 * download file and save to `path`
 */
async function downloadFile(url, targetPath) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/octet-stream' }
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `download failed ${response.status} ${response.statusText} for ${url}${
        body ? `: ${body.slice(0, 200)}` : ''
      }`
    )
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0) {
    throw new Error(`downloaded empty file from ${url}`)
  }
  const tempPath = `${targetPath}.download-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tempPath, new Uint8Array(buffer))
    replaceFile(tempPath, targetPath)
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath)
    throw error
  }

  console.log(`[INFO]: download finished "${url}"`)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'koala-clash-prepare'
    }
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `GET ${url} failed ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`
    )
  }
  return response.json()
}

function choosePreferredAsset(candidates) {
  return candidates.find((asset) => !asset.name.includes('-go')) ?? candidates[0]
}

function findReleaseAssets(assets, assetPrefix, assetExt) {
  return assets.filter(
    (asset) =>
      typeof asset.name === 'string' &&
      typeof asset.browser_download_url === 'string' &&
      asset.browser_download_url.startsWith('https://') &&
      asset.name.startsWith(`${assetPrefix}-`) &&
      asset.name.endsWith(assetExt)
  )
}

function resolveZipExecutableEntry(zip, expectedExeFile, isWin) {
  const expectedExt = isWin ? '.exe' : ''
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory)
  const entry =
    entries.find((entry) => path.basename(entry.entryName) === expectedExeFile) ??
    entries.find((entry) => {
      const basename = path.basename(entry.entryName)
      return basename.startsWith('mihomo-') && basename.endsWith(expectedExt)
    })

  if (!entry) {
    throw new Error(
      `Expected mihomo executable not found in ${entries.map((item) => item.entryName).join(', ')}`
    )
  }
  return entry
}

function finalizeSidecar(tempSidecar, sidecarPath, name) {
  validateLocalFile(tempSidecar, name)
  if (platform !== 'win32') {
    execSync(`chmod 755 "${tempSidecar}"`)
    console.log(`[INFO]: "${name}" chmod binary finished`)
  }
  replaceFile(tempSidecar, sidecarPath)
}

function replaceFile(sourcePath, targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath)
  }
  fs.renameSync(sourcePath, targetPath)
}

function validateLocalFile(filePath, name) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`"${name}" resolved to an empty or invalid file`)
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${label}`)
  }
  return value.trim()
}

function removeSidecarTarget(targetFile) {
  const sidecarPath = path.join(cwd, 'extra', 'sidecar', targetFile)
  if (fs.existsSync(sidecarPath)) {
    fs.rmSync(sidecarPath)
    console.log(`[INFO]: removed unavailable sidecar "${targetFile}"`)
  }
}

const resolveMmdb = () =>
  resolveResource({
    file: 'country.mmdb',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country-lite.mmdb`
  })
const resolveMetadb = () =>
  resolveResource({
    file: 'geoip.metadb',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb`
  })
const resolveGeosite = () =>
  resolveResource({
    file: 'geosite.dat',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat`
  })
const resolveGeoIP = () =>
  resolveResource({
    file: 'geoip.dat',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat`
  })
const resolveASN = () =>
  resolveResource({
    file: 'ASN.mmdb',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb`
  })
const resolveEnableLoopback = () =>
  resolveResource({
    file: 'enableLoopback.exe',
    downloadURL: `https://github.com/Kuingsmile/uwp-tool/releases/download/latest/enableLoopback.exe`
  })
const resolveSparkleService = () => {
  const map = {
    'win32-x64': 'sparkle-service-windows-amd64-v1',
    'win32-ia32': 'sparkle-service-windows-386',
    'win32-arm64': 'sparkle-service-windows-arm64',
    'darwin-x64': 'sparkle-service-darwin-amd64-v1',
    'darwin-arm64': 'sparkle-service-darwin-arm64',
    'linux-x64': 'sparkle-service-linux-amd64-v1',
    'linux-arm64': 'sparkle-service-linux-arm64'
  }
  if (!map[`${platform}-${arch}`]) {
    throw new Error(`unsupported platform "${platform}-${arch}"`)
  }
  const base = map[`${platform}-${arch}`]
  const ext = platform === 'win32' ? '.exe' : ''

  return resolveResource({
    file: `sparkle-service${ext}`,
    downloadURL: `https://github.com/xishang0128/sparkle-service/releases/download/pre-release/${base}${ext}`,
    needExecutable: true
  })
}
const resolveRunner = () =>
  resolveResource({
    file: 'koala-clash-run.exe',
    downloadURL: `https://github.com/coolcoala/koala-clash-run/releases/download/${arch}/koala-clash-run.exe`
  })

const resolve7zip = () =>
  resolveResource({
    file: '7za.exe',
    downloadURL: `https://github.com/develar/7zip-bin/raw/master/win/${arch}/7za.exe`
  })

const resolveFont = async () => {
  // const targetPath = path.join(cwd, 'src', 'renderer', 'src', 'assets', 'NotoColorEmoji.ttf')
  const targetPath = path.join(cwd, 'src', 'renderer', 'src', 'assets', 'twemoji.ttf')

  if (fs.existsSync(targetPath)) {
    return
  }
  await downloadFile(
    // 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf',
    'https://github.com/Sav22999/emoji/raw/refs/heads/master/font/twemoji.ttf',
    targetPath
  )

  console.log(`[INFO]: twemoji.ttf finished`)
}

const tasks = [
  {
    name: 'mihomo-alpha',
    func: () => resolveLatestAlphaAsset().then(() => resolveSidecar(MihomoAlpha())),
    retry: 5
  },
  {
    name: 'mihomo',
    func: () => resolveLatestReleaseAsset().then(() => resolveSidecar(mihomo())),
    retry: 5
  },
  { name: 'mmdb', func: resolveMmdb, retry: 5 },
  { name: 'metadb', func: resolveMetadb, retry: 5 },
  { name: 'geosite', func: resolveGeosite, retry: 5 },
  { name: 'geoip', func: resolveGeoIP, retry: 5 },
  { name: 'asn', func: resolveASN, retry: 5 },
  {
    name: 'font',
    func: resolveFont,
    retry: 5
  },
  {
    name: 'enableLoopback',
    func: resolveEnableLoopback,
    retry: 5,
    winOnly: true
  },
  {
    name: 'sparkle-service',
    func: resolveSparkleService,
    retry: 5
  },
  {
    name: 'runner',
    func: resolveRunner,
    retry: 5,
    winOnly: true
  },
  {
    name: '7zip',
    func: resolve7zip,
    retry: 5,
    winOnly: true
  }
]

async function runTask() {
  const task = tasks.shift()
  if (!task) return
  if (task.winOnly && platform !== 'win32') return runTask()
  if (task.linuxOnly && platform !== 'linux') return runTask()
  if (task.unixOnly && platform === 'win32') return runTask()

  for (let i = 0; i < task.retry; i++) {
    try {
      await task.func()
      break
    } catch (err) {
      console.error(`[ERROR]: task::${task.name} try ${i} ==`, err.message)
      if (i === task.retry - 1) throw err
    }
  }
  return runTask()
}

await Promise.all([runTask(), runTask()])
