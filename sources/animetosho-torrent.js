const DEFAULT_API_BASE_URL = 'https://feed.animetosho.xyz/json/v1'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_TITLES = 6

function apiBaseUrl(options = {}) {
  const configured = typeof options.apiBaseUrl === 'string' ? options.apiBaseUrl.trim() : ''
  return (configured || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

function limit(options = {}) {
  const raw = Number(options.maxResults || DEFAULT_LIMIT)
  if (!Number.isFinite(raw)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(raw)))
}

function uniqueTitles(titles = []) {
  return [...new Set(
    titles
      .filter(title => typeof title === 'string')
      .map(title => title.trim())
      .filter(Boolean)
  )].slice(0, MAX_TITLES)
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function requestUrl(endpoint, params = {}, options = {}) {
  const url = new URL(`${apiBaseUrl(options)}/${endpoint.replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') {
          url.searchParams.append(key, String(item))
        }
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function queryParams(query = {}, mode = 'single', options = {}) {
  const mediaTitle = query.media?.title?.romaji || query.media?.title?.english || query.media?.title?.native
  const titles = uniqueTitles([
    ...(Array.isArray(query.titles) ? query.titles : []),
    query.title,
    query.name,
    mediaTitle
  ])
  const params = {
    title: titles[0],
    titles: titles.slice(1),
    resolution: query.resolution || undefined,
    limit: limit(options)
  }

  if (isNumber(query.anidbAid)) params.aid = query.anidbAid
  if (mode === 'single' && isNumber(query.anidbEid)) params.eid = query.anidbEid
  if (mode === 'single' && isNumber(query.episode)) params.episode = query.episode

  return params
}

function isExcluded(title, exclusions = []) {
  const normalized = String(title || '').toLowerCase()
  return exclusions
    .filter(item => typeof item === 'string' && item.trim())
    .some(item => normalized.includes(item.trim().toLowerCase()))
}

function accuracy(item, query = {}, mode = 'single') {
  if (mode === 'single' && isNumber(query.anidbEid)) return 'high'
  if (isNumber(query.anidbAid)) return 'high'
  if (item?.resolution && query.resolution && item.resolution.startsWith(String(query.resolution))) {
    return 'medium'
  }
  return 'medium'
}

function resultType(mode) {
  return mode === 'batch' ? 'batch' : undefined
}

function toTorrentResult(item, query, mode) {
  return {
    id: item.id,
    title: item.title,
    link: item.link,
    seeders: Number(item.seeders || 0),
    leechers: Number(item.leechers || 0),
    downloads: Number(item.downloads || 0),
    accuracy: accuracy(item, query, mode),
    hash: item.hash,
    size: Number(item.size || 0),
    date: item.date ? new Date(item.date) : new Date(0),
    type: resultType(mode)
  }
}

function dedupe(results) {
  const seen = new Set()
  return results.filter(result => {
    const key = result.hash || result.link
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function search(query = {}, options = {}, mode = 'single') {
  const requestFetch = query.fetch || globalThis.fetch
  const response = await requestFetch(requestUrl('shiru', queryParams(query, mode, options)), {
    headers: { Accept: 'application/json' }
  })

  if (!response.ok) return []

  const payload = await response.json().catch(() => null)
  const data = Array.isArray(payload?.data) ? payload.data : []
  const filtered = data.filter(item => {
    return typeof item?.link === 'string' &&
      item.link.startsWith('magnet:') &&
      typeof item?.hash === 'string' &&
      item.hash.length >= 32 &&
      !isExcluded(item.title, query.exclusions)
  })

  return dedupe(filtered.map(item => toTorrentResult(item, query, mode)))
}

export default {
  async test(_query, options) {
    const response = await globalThis.fetch(requestUrl('caps', {}, options), {
      headers: { Accept: 'application/json' }
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload?.ok !== true) {
      throw new Error('Anime Tosho JSON API is not responding.')
    }
    return true
  },

  async single(query, options) {
    return search(query, options, 'single')
  },

  async batch(query, options) {
    return search(query, options, 'batch')
  },

  async movie(query, options) {
    return search(query, options, 'movie')
  }
}
