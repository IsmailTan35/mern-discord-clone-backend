import user from "../../../schema/user"

const friendsGet = (req:any,res:any) => {
    const { token } = req.query
    user.findOne({token:{
        $elemMatch:{
            $eq:token
        }
    }},(err: any,result: any) => {
        if(err){
            res.status(500).json(err)
        }
        else{
            res.status(200).json(result)
        }
    })

}

const friendsPost = async (req:any,res:any) => {
    const { token,to } = req.body
    if(!token || typeof to !== "string" || !to.includes("#")) return res.status(400).json("Invalid user tag")
    const io = req.app.get("io")

    const [username, rawCode] = to.split("#")
    const code = Number(rawCode)
    if(!username || !Number.isInteger(code)) return res.status(400).json("Invalid user tag")

        try {
            const me:any = await user.findOne({token:{$elemMatch:{$eq:token}}})
            if(!me) return res.status(401).json("You are not authenticated!")

            const target:any = await user.findOne({username, code})
            if(!target) return res.status(404).json("User not found!")
            if(me._id.equals(target._id)) return res.status(400).json("You can't add yourself")

            // Neither side may already be friends, blocked or have a pending request with the other
            const fromUpdated:any = await user.findOneAndUpdate({
                _id:me._id,
                friends:{$ne:target._id},
                blocked:{$ne:target._id},
                "request._id":{$ne:target._id},
            },{
                $push:{
                    request:{
                        type:"outgoing",
                        _id:target._id
                    }
                }
            })

            if(!fromUpdated) return res.status(400).json("Request already exists")

            const toUpdated:any = await user.findOneAndUpdate({
                _id:target._id,
                friends:{$ne:me._id},
                blocked:{$ne:me._id},
                "request._id":{$ne:me._id},
            },{
                $push:{
                    request:{
                        type:"incoming",
                        _id:me._id
                    }
                }
            })

            if(!toUpdated){
                await user.updateOne({_id:me._id},{$pull:{request:{_id:target._id}}})
                return res.status(400).json("Request could not be sent")
            }

            const rawSockets:any = await io.fetchSockets()
            rawSockets.forEach((socket:any) => {
                const socketUserId = socket.handshake.auth.userId
                if(socketUserId === me._id.toString()){
                    socket.emit("newFriendRequest",{
                        _id:target._id.toString(),
                        username:target.username,
                        code:target.code,
                        type:"outgoing",
                    })
                }
                if(socketUserId === target._id.toString()){
                    socket.emit("newFriendRequest",{
                        _id:me._id.toString(),
                        username:me.username,
                        code:me.code,
                        type:"incoming",
                    })
                }
            })
            res.status(200).json("ok")
        } catch (error) {
            console.error(error)
            res.status(400).json("")
        }


}

const friendsPut = (req:any,res:any) => {

}

const friendsDelete = (req:any,res:any) => {

}

export {
    friendsGet,
    friendsPost,
    friendsPut,
    friendsDelete
}
