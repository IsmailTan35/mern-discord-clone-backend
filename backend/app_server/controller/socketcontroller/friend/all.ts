import userSchema from "../../../schema/user";

export default async (io:any, socket:any, data:any) => {
	try {
		
		const token = socket.handshake.auth.token
		if(!token) return
	const res:any = await userSchema.aggregate([
		{
			$match:{  
				token:{
					$elemMatch:{
						$eq:token
					}
				}
			}
		},
		{
			$lookup:{
				from:"discordusers",
				let:{friendId:"$friends"},
				pipeline:[
					{
						$match:{
							$expr:{
								$in:["$_id","$$friendId"]
							}
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
				as:"userRequest"
			}
		},
		{
			$unwind:"$userRequest"
		},
		{
			$replaceRoot:{
				newRoot:"$userRequest"
			}
		}
	])
	
	socket.emit("friendAll",res)
} catch (error) {
	console.error(error)

}
}
