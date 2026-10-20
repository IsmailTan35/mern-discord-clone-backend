import http from "http";
import https from "https";
import dns from "dns";
import net from "net";
import zlib from "zlib";
import { TextDecoder } from "util";

// Link previews ("embeds") for links in messages. The server fetches pages on
// behalf of users, so it must never be pointed at itself or the local network:
// every address a host name resolves to is checked, also after redirects.

const MAX_PREVIEWS = 3
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_SIZE = 500

// ---------------------------------------------------------------- finding links

const TRAILING_PUNCTUATION = /[.,!?:;'"\]}>]$/

// Links inside code, and links written as <https://...>, get no preview (as in Discord)
const extractUrls = (text:string) => {
	const visible = String(text || "")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/<https?:\/\/[^\s>]+>/gi, " ")
	const urls:string[] = []
	const pattern = /https?:\/\/[^\s<>"'`]+/gi
	let match
	while((match = pattern.exec(visible)) && urls.length < MAX_PREVIEWS){
		let candidate = match[0]
		// Drop sentence punctuation, but keep the ")" of links like .../Foo_(bar)
		for(;;){
			if(TRAILING_PUNCTUATION.test(candidate)){ candidate = candidate.slice(0, -1); continue }
			if(candidate.endsWith(")") && (candidate.split("(").length < candidate.split(")").length)){ candidate = candidate.slice(0, -1); continue }
			break
		}
		try {
			const url = new URL(candidate)
			if(!/^https?:$/.test(url.protocol)) continue
			if(!urls.includes(url.href)) urls.push(url.href)
		} catch (error) {}
	}
	return urls
}

// ---------------------------------------------------------------- safe fetching

const isPrivateIPv4 = (ip:string) => {
	const [a, b] = ip.split(".").map(Number)
	return a === 0 || a === 10 || a === 127 || a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && (b === 168 || b === 0)) ||
		(a === 198 && (b === 18 || b === 19))
}

const isPrivateAddress = (address:string) => {
	if(net.isIPv4(address)) return isPrivateIPv4(address)
	if(!net.isIPv6(address)) return true
	const ip = address.toLowerCase()
	const dotted = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
	if(dotted) return isPrivateIPv4(dotted[1])
	const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
	if(hex){
		const high = parseInt(hex[1], 16), low = parseInt(hex[2], 16)
		return isPrivateIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
	}
	return ip.startsWith("::") || /^f[c-d]/.test(ip) || /^fe[89ab]/.test(ip) ||
		ip.startsWith("ff") || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8:")
}

// Used by http(s).get instead of the normal DNS lookup, so the address that is
// checked is the one that gets connected to
const safeLookup = (hostname:string, options:any, callback:any) => {
	dns.lookup(hostname, { all: true }, (error, addresses:any) => {
		if(error) return callback(error)
		if(!addresses.length || addresses.some((item:any) => isPrivateAddress(item.address)))
			return callback(new Error(`blocked address for ${hostname}`))
		if(options && options.all) return callback(null, addresses)
		callback(null, addresses[0].address, addresses[0].family)
	})
}

const checkUrl = (url:URL) => {
	if(!/^https?:$/.test(url.protocol)) throw new Error("only http and https")
	if(url.username || url.password) throw new Error("no credentials")
	if(url.port && url.port !== "80" && url.port !== "443") throw new Error("only the default ports")
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
	if(host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw new Error("local host name")
	if(net.isIP(host) && isPrivateAddress(host)) throw new Error("private address")
}

type Fetched = { url: URL, contentType: string, body: Buffer }

const fetchUrl = (url:URL, accept:RegExp, redirectsLeft = MAX_REDIRECTS):Promise<Fetched> =>
	new Promise((resolve, reject) => {
		try { checkUrl(url) } catch (error) { return reject(error) }
		const client:any = url.protocol === "https:" ? https : http
		let done = false
		const fail = (error:any) => { if(!done){ done = true; clearTimeout(timer); reject(error) } }
		const succeed = (value:Fetched) => { if(!done){ done = true; clearTimeout(timer); resolve(value) } }

		const req = client.get(url, {
			lookup: safeLookup,
			headers: {
				"user-agent": "Mozilla/5.0 (compatible; DiscordCloneBot/1.0; link previews)",
				"accept": "text/html,application/xhtml+xml,application/json,image/*;q=0.8",
				"accept-encoding": "gzip, deflate, br",
				"accept-language": "tr,en;q=0.8",
			},
		}, (res:any) => {
			const status = res.statusCode || 0
			if(status >= 300 && status < 400 && res.headers.location){
				res.resume()
				if(redirectsLeft <= 0) return fail(new Error("too many redirects"))
				let next:URL
				try { next = new URL(res.headers.location, url) } catch (error) { return fail(error) }
				clearTimeout(timer)
				done = true
				return fetchUrl(next, accept, redirectsLeft - 1).then(resolve, reject)
			}
			const contentType = String(res.headers["content-type"] || "")
			if(status !== 200 || !accept.test(contentType)){
				res.destroy()
				return fail(new Error(`unusable response ${status} ${contentType}`))
			}
			// Images are shown by their address; nothing to read
			if(/^image\//i.test(contentType)){
				res.destroy()
				return succeed({ url, contentType, body: Buffer.alloc(0) })
			}
			const encoding = String(res.headers["content-encoding"] || "").toLowerCase()
			const stream = encoding === "gzip" ? res.pipe(zlib.createGunzip())
				: encoding === "deflate" ? res.pipe(zlib.createInflate())
				: encoding === "br" ? res.pipe(zlib.createBrotliDecompress())
				: res
			const chunks:Buffer[] = []
			let size = 0
			const finish = () => succeed({ url, contentType, body: Buffer.concat(chunks) })
			stream.on("data", (chunk:Buffer) => {
				chunks.push(chunk)
				size += chunk.length
				// The <head> with the preview tags is near the start of the page
				if(size >= MAX_BYTES){ finish(); res.destroy() }
			})
			stream.on("end", finish)
			stream.on("error", (error:any) => chunks.length ? finish() : fail(error))
		})
		const timer = setTimeout(() => { fail(new Error("timeout")); req.destroy() }, TIMEOUT_MS)
		req.on("error", fail)
	})

// ---------------------------------------------------------------- reading pages

const ENTITIES:Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " }

const decodeEntities = (text:string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
	if(name[0] === "#"){
		const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
	}
	return ENTITIES[name.toLowerCase()] ?? whole
})

const clean = (text:any, max:number) => {
	if(typeof text !== "string") return ""
	const value = decodeEntities(text).replace(/\s+/g, " ").trim()
	return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value
}

const readAttributes = (tag:string) => {
	const attributes:Record<string, string> = {}
	const pattern = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
	let match
	while((match = pattern.exec(tag))) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ""
	return attributes
}

const decodeBody = (body:Buffer, contentType:string) => {
	const head = body.subarray(0, 4096).toString("latin1")
	const charset = (contentType.match(/charset=["']?([\w-]+)/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]
	try {
		return new TextDecoder(charset || "utf-8").decode(body)
	} catch (error) {
		return new TextDecoder("utf-8").decode(body)
	}
}

const absoluteUrl = (value:string, base:URL) => {
	try {
		const url = new URL(decodeEntities(value), base)
		return /^https?:$/.test(url.protocol) ? url.href : ""
	} catch (error) {
		return ""
	}
}

// OpenGraph / Twitter card tags, falling back to <title> and the description
const parsePreview = (html:string, originalUrl:string, finalUrl:URL) => {
	const tags:Record<string, string> = {}
	const metaPattern = /<meta\s[^>]*>/gi
	let match
	while((match = metaPattern.exec(html))){
		const attributes = readAttributes(match[0])
		const key = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase()
		if(key && attributes.content !== undefined && tags[key] === undefined) tags[key] = attributes.content
	}
	const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]

	const title = clean(tags["og:title"] || tags["twitter:title"] || titleTag, 256)
	const description = clean(tags["og:description"] || tags["twitter:description"] || tags["description"], 350)
	const imageTag = tags["og:image:secure_url"] || tags["og:image"] || tags["og:image:url"] || tags["twitter:image"] || tags["twitter:image:src"]
	const image = imageTag ? absoluteUrl(imageTag, finalUrl) : ""
	if(!title && !description && !image) return null
	const color = /^#[0-9a-f]{3,8}$/i.test(tags["theme-color"] || "") ? tags["theme-color"] : ""
	return {
		type: "link",
		url: originalUrl,
		siteName: clean(tags["og:site_name"], 100) || finalUrl.hostname.replace(/^www\./, ""),
		title,
		description,
		image,
		color,
	}
}

// ---------------------------------------------------------------- YouTube

const youTubeId = (url:URL) => {
	const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "")
	if(host === "youtu.be") return url.pathname.slice(1).split("/")[0]
	if(host !== "youtube.com") return ""
	if(url.pathname === "/watch") return url.searchParams.get("v") || ""
	const [, kind, id] = url.pathname.split("/")
	return ["shorts", "embed", "live"].includes(kind) ? id || "" : ""
}

const youTubePreview = async (originalUrl:string, videoId:string) => {
	const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
	const oembed = new URL(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`)
	const { body } = await fetchUrl(oembed, /json/i)
	const data = JSON.parse(body.toString("utf8"))
	return {
		type: "video",
		provider: "youtube",
		videoId,
		url: originalUrl,
		siteName: "YouTube",
		author: clean(data.author_name, 100),
		title: clean(data.title, 256),
		description: "",
		image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
		color: "#ff0000",
	}
}

// ---------------------------------------------------------------- cache

const cache = new Map<string, { at: number, value: any }>()
const inFlight = new Map<string, Promise<any>>()

const loadPreview = async (originalUrl:string) => {
	const url = new URL(originalUrl)
	const videoId = youTubeId(url)
	if(/^[\w-]{6,20}$/.test(videoId)) return youTubePreview(originalUrl, videoId)
	const fetched = await fetchUrl(url, /^(text\/html|application\/xhtml\+xml|image\/(png|jpe?g|gif|webp))/i)
	if(/^image\//i.test(fetched.contentType)) return { type: "image", url: originalUrl, image: fetched.url.href }
	return parsePreview(decodeBody(fetched.body, fetched.contentType), originalUrl, fetched.url)
}

// A preview for one link, or null. Never throws.
const getLinkPreview = (originalUrl:string):Promise<any> => {
	const cached = cache.get(originalUrl)
	if(cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.value)
	if(inFlight.has(originalUrl)) return inFlight.get(originalUrl) as Promise<any>

	const promise = loadPreview(originalUrl)
		.catch(() => null)
		.then(value => {
			inFlight.delete(originalUrl)
			cache.delete(originalUrl)
			cache.set(originalUrl, { at: Date.now(), value })
			if(cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
			return value
		})
	inFlight.set(originalUrl, promise)
	return promise
}

export {
	extractUrls,
	isPrivateAddress,
	parsePreview,
	youTubeId,
	getLinkPreview,
}
