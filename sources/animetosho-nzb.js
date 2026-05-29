const DEFAULT_API_BASE_URL = 'https://feed.animetosho.xyz/json/v1'

function apiBaseUrl(options = {}) {
  const configured = typeof options.apiBaseUrl === 'string' ? options.apiBaseUrl.trim() : ''
  return (configured || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function uniqueTitles(titles = []) {
  return [...new Set(
    titles
      .filter(title => typeof title === 'string')
      .map(title => title.trim())
      .filter(Boolean)
  )].slice(0, 5)
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

async function firstNzbUrl(requestFetch, params, options = {}) {
  const response = await requestFetch(requestUrl('releases', { ...params, limit: 1 }, options), {
    headers: { Accept: 'application/json' }
  })

  if (!response.ok) return undefined

  const payload = await response.json().catch(() => null)
  const data = Array.isArray(payload?.data) ? payload.data : []
  return data.find(item => typeof item?.nzb_url === 'string' && item.nzb_url)?.nzb_url
}

async function searchByTitleFallback(query = {}, options = {}) {
  if (!options.allowTitleFallback) return undefined

  const mediaTitle = query.media?.title?.romaji || query.media?.title?.english || query.media?.title?.native
  const titles = uniqueTitles([
    ...(Array.isArray(query.titles) ? query.titles : []),
    query.title,
    query.name,
    mediaTitle
  ])
  if (!titles.length && !query.name) return undefined

  const requestFetch = query.fetch || globalThis.fetch
  const params = {
    query: titles[0] || query.name,
    aid: isNumber(query.anidbAid) ? query.anidbAid : undefined,
    eid: isNumber(query.anidbEid) ? query.anidbEid : undefined,
    episode: isNumber(query.episode) ? query.episode : undefined
  }
  return firstNzbUrl(requestFetch, params, options)
}

async function findNzb(query = {}, options = {}) {
  const requestFetch = query.fetch || globalThis.fetch
  const hash = typeof query.hash === 'string' ? query.hash.trim() : ''

  if (hash) {
    const nzbUrl = await firstNzbUrl(requestFetch, { hash }, options)
    if (nzbUrl) return nzbUrl
  }

  return searchByTitleFallback(query, options)
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

  async query(query, options) {
    return findNzb(query, options)
  },

  async single(query, options) {
    return findNzb(query, options)
  },

  async batch(query, options) {
    return findNzb(query, options)
  },

  async movie() {
    return undefined
  }
}
