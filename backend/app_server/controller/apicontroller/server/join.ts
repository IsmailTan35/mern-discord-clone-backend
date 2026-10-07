import serverSchema from "../../../schema/server";
import userSchema from "../../../schema/user";
import channelSchema from "../../../schema/channel";

export default async (req:any,res:any) => {
	const token = req.headers.authorization
	// Accept both a bare code ("hTKzmak") and a full invite link ("https://discord.gg/hTKzmak")
	const inviteCode = String(req.body.inviteCode || "").trim().split("/").pop()
	if(!token || !inviteCode) return res.status(400).send("Invalid invite code")

	try {
		const user:any = await userSchema.aggregate([
			{$match:{
				token:{"$in":[token]
			}}
		}])

		const server= await serverSchema.aggregate([
			{$match:{inviteCode}},
		])

		if(user.length==0 || server.length==0) return res.status(400).send("Invalid invite code")

		const isMember = server[0].userIDs.some((id:any) => id.toString() === user[0]._id.toString())
		if(isMember) return res.status(400).send("Already a member")

		const data:any = await userSchema.findOneAndUpdate({
			_id:user[0]._id
		},{
			$addToSet:{
				servers:server[0]._id
			}
		})
		const data2:any = await serverSchema.findOneAndUpdate({
			_id:server[0]._id
		},{
			$addToSet:{
				userIDs:user[0]._id
			}
		},{
			new:true
		})

		if(!data || !data2) return res.status(400).send("Invalid invite code")

		const channels:any = await channelSchema.aggregate([
			{$match:{serverID:server[0]._id.toString()}},
		])

		res.status(200).send("Success")

		const io = req.app.get("io")
		const rawSockets:any = await io.fetchSockets()
		const sockets = rawSockets.filter((socket: { handshake: { auth: { token: any; }; }; }) => socket.handshake.auth.token === token)

		sockets.forEach((socket: any) => {
			socket.emit('newServer',{
				_id:data2._id,
				servername:data2.servername,
				channels:data2.channels,
				userIDs:data2.userIDs,
				inviteCode:data2.inviteCode,
				serverpicture:data2.serverpicture
			})
			channels.forEach((channel: any)=>{
				socket.emit("newChannel",{...channel,onlineUser:[]})
			})
		})

	} catch (error) {
		console.error(error)
		if(!res.headersSent) res.status(400).send("error")
	}

}
