import serverSchema from "../../../schema/server";
import userSchema from "../../../schema/user";
import channelSchema from "../../../schema/channel";
import { getOnlineUserIds } from "../../../helper/helperSocket";

// The text channel a server opens on: the first one in the server's own order
const firstTextChannelId = async (server:any) => {
	const textChannels:any = await channelSchema.find({ serverID: server._id.toString(), type: "text" }, { _id: 1 })
	const order = (server.channels || []).map((id:any) => id.toString())
	const ids = textChannels.map((channel:any) => channel._id.toString())
	return ids.sort((a:string, b:string) => order.indexOf(a) - order.indexOf(b))[0] || null
}

// What an invite link shows before joining: the server's name, icon and
// member counts. Anyone with the link may see this, logged in or not; members
// also get where to go.
const inviteInfo = async (req:any, res:any) => {
	const code = String(req.params.code || "").trim()
	if(!/^[\w-]{1,32}$/.test(code)) return res.status(404).json({ error: "invalid invite" })
	try {
		const server:any = await serverSchema.findOne({ inviteCode: code })
		if(!server) return res.status(404).json({ error: "invalid invite" })

		const memberIds = (server.userIDs || []).map((id:any) => id.toString())
		const io = req.app.get("io")
		const onlineIds = getOnlineUserIds(await io.fetchSockets())

		const token = req.headers.authorization
		const user:any = token ? await userSchema.findOne({ token }, { _id: 1 }) : null
		const isMember = !!user && memberIds.includes(user._id.toString())

		res.status(200).json({
			inviteCode: server.inviteCode,
			servername: server.servername,
			serverpicture: server.serverpicture || "",
			memberCount: memberIds.length,
			onlineCount: memberIds.filter((id:string) => onlineIds.has(id)).length,
			isMember,
			...(isMember ? { serverID: server._id.toString(), channelID: await firstTextChannelId(server) } : {}),
		})
	} catch (error) {
		console.error(error)
		res.status(400).json({ error: "invite failed" })
	}
}

export { firstTextChannelId }
export default inviteInfo
