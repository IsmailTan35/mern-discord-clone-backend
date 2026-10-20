import userSchema from "../../../schema/user";
import serverSchema from "../../../schema/server";
import server from "../../../schema/server";
import { getServerOwnerId, getVoiceChannelUsers } from "../../../helper/helperSocket";

export default async (io:any, socket:any, data:any)=>{
	const token = socket.handshake.auth.token
	try {


	if(!token) return
	const res:any = await userSchema.aggregate([
		{
			$match:{  
				token:{
					$elemMatch:{
						$eq:token
					}
				},
			},
		},
		{
			$lookup:{
				from:"discordservers",
				let:{req:"$servers"},
				pipeline:[
					{
						$match:{
							$expr:{
								$in:["$_id","$$req"],
							},
						},
					},
					{
						$project:{
							_id:1,
							servername:1,
							userIDs:1,
							channels:1,
							inviteCode:1,
							serverpicture:1,
							ownerID:1
						}
					}
				],
				as:"myservers"
			}
		},
		{
			$unwind:"$myservers"
		},
		{
			$replaceRoot:{
				newRoot:"$myservers"
			}
		}
	])
	if(res.length<=0) return

	
	// Only the channels of the user's own servers
	const res1:any = await serverSchema.aggregate([
		{
			$match:{
				_id:{$in:res.map((server:any)=>server._id)}
			}
		},
		{
			$lookup:{
				from:"discordchannels",
				let:{req:"$channels"},
				pipeline:[
					{
						$match:{
							$expr:{
								$in:["$_id","$$req"],
							},
						},
					},
					{
						$project:{
							_id:1,
							channelname:1,
							serverID:1,
							group:1,
							locked:1,
							onlineUser:1,
							serverpicture:1,
							type:1
						}
					}
				],
				as:"mychannels"
			}
		},
		{
			$unwind:"$mychannels"
		},
		{
			$replaceRoot:{
				newRoot:"$mychannels"
			}
		}
	])

	// Read the voice rooms after the database queries, as late as possible
	const rawSockets:any = await io.fetchSockets()
	const findOnlineUser = (serverID:any, channelID:any) => getVoiceChannelUsers(rawSockets, serverID, channelID)

	const denem1 = res1.map((channel:any)=>(
		{
			...channel,
			onlineUser:findOnlineUser(channel.serverID,channel._id)
		}
	))
	// server.map()
	socket.emit("serverList",res.map((server:any)=>({ ...server, ownerID:getServerOwnerId(server) })))
	socket.emit("channelList",denem1)
} catch (error) {
	console.error(error)

}
}