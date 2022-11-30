import userSchema from "../../../schema/user";

export default async (io:any, socket:any, data:any)=>{
	const token = socket.handshake.auth.token
	if(!token) return
	const checkMe = {
		$or:[
			({
			token:{
				$elemMatch:{
					$eq:token
				}
			}}),
			({
				username:data.name,
				code:data.code,
			})
		]
	}

	try {
		

	const check:any = await userSchema.find(checkMe)
	if(check.length!=2) return
	if(check[0].username+"#"+check[0].code===check[1].username+"#"+check[1].code) return console.info("me")
	const update:any = await userSchema.findOneAndUpdate({
		username:check[0].username,
		code:check[0].code,
	},{
		$pull:{
			friends:check[1]._id}
	},
	{new:true})

	const update2:any = await userSchema.findOneAndUpdate({
		username:check[1].username,
		code:check[1].code,
	},{
		$pull:{
			friends:check[0]._id}
	},
	{new:true})
	const rawSockets:any = await io.fetchSockets()
	rawSockets.map((socket:any)=>{
		if(socket.handshake.auth.userId===check[0]._id.toString()){
			socket.emit("friendUnFriend",check[1]._id)


		}
		if(socket.handshake.auth.userId===check[1]._id.toString()){
			socket.emit("friendUnFriend",check[0]._id)

		}
	})
	} catch (error) {
		console.error(error)

	}
}