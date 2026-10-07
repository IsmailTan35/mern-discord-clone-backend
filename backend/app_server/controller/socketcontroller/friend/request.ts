import userSchema from "../../../schema/user";
import { emitToUser } from "../../../helper/helperSocket";

const getFriendRequests = async (io:any, socket:any, data:any) => {
	const token = socket.handshake.auth.token
	if(!token) return
	try {


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
				from:"discordusers",
				let:{req:"$request"},
				pipeline:[
					{
						$match:{
							$expr:{
								$in:["$_id","$$req._id"],
							},

						}
					},
					{
						$project:{
							_id:1,
							username:1,
							code:1
						}
					}
				],
				as:"requests"
			}
		},
		{
			$addFields:{
				data:{$concatArrays:["$request","$requests"]}
			}
		},
		{
			$unwind:"$data"
		},
		{
			$group:{
				_id:"$data._id",
				data:{
					$mergeObjects:"$data"
				}
			}
		},
		{
			$replaceRoot:{
				newRoot:"$data"
			}
		}

	])

	if(!res) return
	socket.emit("friendRequests", res)
	} catch (error) {
		console.error(error)

	}
}

// The socket's own user is resolved from its token, never from the client payload
const findMeAndOther = async (socket:any, otherId:any) => {
	const token = socket.handshake.auth.token
	if(!token || !otherId) return null
	const me:any = await userSchema.findOne({token:{$elemMatch:{$eq:token}}})
	if(!me) return null
	const other:any = await userSchema.findById(otherId)
	if(!other || me._id.equals(other._id)) return null
	return { me, other }
}

const acceptFriendRequest = async (io:any, socket:any, data:any) => {
	try {
	const pair = await findMeAndOther(socket, data && data._id)
	if(!pair) return
	const { me, other } = pair

	// Only an incoming request can be accepted
	const update:any = await userSchema.findOneAndUpdate({
		_id:me._id,
		request:{$elemMatch:{_id:other._id,type:"incoming"}}
	},{
		$addToSet:{
			friends:other._id},
		$pull:{
			request:{
				_id:other._id
			}
		}
	},
	{new:true})
	if(!update) return

	await userSchema.updateOne({
		_id:other._id,
	},{
		$addToSet:{
			friends:me._id},
		$pull:{
			request:{
				_id:me._id
			}
		}
	})

	const rawSockets:any = await io.fetchSockets()
	const isOnline = (userId:any) => rawSockets.some((s:any) => s.handshake.auth.userId === userId.toString())

	emitToUser(rawSockets, me._id, "newFriend", { _id:other._id.toString(), username:other.username, code:other.code })
	emitToUser(rawSockets, me._id, "friendRequestsRemove", { _id:other._id.toString() })
	emitToUser(rawSockets, other._id, "newFriend", { _id:me._id.toString(), username:me.username, code:me.code })
	emitToUser(rawSockets, other._id, "friendRequestsRemove", { _id:me._id.toString() })

	if(isOnline(other._id)) emitToUser(rawSockets, me._id, "friendJoin", { userId:other._id.toString(), name:other.username, code:other.code })
	if(isOnline(me._id)) emitToUser(rawSockets, other._id, "friendJoin", { userId:me._id.toString(), name:me.username, code:me.code })
} catch (error) {
	console.error(error)

}
}

// Removes a pending request between the two users. `type` is how the request
// looks from the caller's side: "incoming" to reject, "outgoing" to cancel.
const removeFriendRequest = async (io:any, socket:any, data:any, type:string) => {
	try {
	const pair = await findMeAndOther(socket, data && data._id)
	if(!pair) return
	const { me, other } = pair

	const update:any = await userSchema.findOneAndUpdate({
		_id:me._id,
		request:{$elemMatch:{_id:other._id,type}}
	},{
		$pull:{
			request:{
				_id:other._id
			}
		}
	},
	{new:true})
	if(!update) return

	await userSchema.updateOne({
		_id:other._id,
	},{
		$pull:{
			request:{
				_id:me._id
			}
		}
	})

	const rawSockets:any = await io.fetchSockets()
	emitToUser(rawSockets, me._id, "friendRequestsRemove", { _id:other._id.toString() })
	emitToUser(rawSockets, other._id, "friendRequestsRemove", { _id:me._id.toString() })
} catch (error) {
	console.error(error)

}
}

const rejectFriendRequest = (io:any, socket:any, data:any) => removeFriendRequest(io, socket, data, "incoming")

const cancelFriendRequest = (io:any, socket:any, data:any) => removeFriendRequest(io, socket, data, "outgoing")

export {
	getFriendRequests,
	acceptFriendRequest,
	rejectFriendRequest,
	cancelFriendRequest
}
