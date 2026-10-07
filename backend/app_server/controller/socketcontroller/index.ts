import configuration from "./configs/configuration";
import { acceptFriendRequest, cancelFriendRequest, getFriendRequests, rejectFriendRequest } from "./friend/request";
import { getFriendBlockeds } from "./friend/blocked";
import getFriendAll from "./friend/all";
import unfriend from "./friend/unfriend";
import sendMessage from "./message/sendMessage";
import getMessages from "./message/getMessages";
import disconnect from "./configs/disconnect";

import userSchema from "../../schema/user";

import joinVoiceChannel from "./channel/join"
import leaveVoiceChannel from "./channel/leave"

import listServer from "./server/list"
import usersServer from "./server/users"

import infoUser from "./user/info"
import { leaveRooms } from "../../helper/helperSocket";

// Socket.io does not catch errors thrown by async listeners; an unhandled
// rejection there would take the whole process down
const safe = (handler:(...args:any[])=>any) => async (...args:any[]) => {
    try {
        await handler(...args)
    } catch (error) {
        console.error(error)
    }
}

const findUserByToken = async (token:any) => {
    if(!token) return null
    const user:any = await userSchema.aggregate([
        {$match:{
            token:{"$in":[token]
        }}
    }])
    return user && user.length > 0 ? user[0] : null
}

export default (io:any,con:any)=>{
    io.db = con;
    io.on("connection", (socket:any) => {
        socket.on("configuration", safe((data:any) => configuration(io, socket, data)))

        socket.on("disconnecting", safe(() => disconnect(io, socket)))

        socket.on("getFriendRequests", safe((data:any) => getFriendRequests(io, socket, data)))

        socket.on("getFriendBlockeds", safe((data:any) => getFriendBlockeds(io, socket, data)))

        socket.on("getFriendAll", safe((data:any) => getFriendAll(io, socket, data)))

        socket.on("acceptFriendRequest", safe((data:any) => acceptFriendRequest(io, socket, data)))

        socket.on("rejectFriendRequest", safe((data:any) => rejectFriendRequest(io, socket, data)))

        socket.on("cancelFriendRequest", safe((data:any) => cancelFriendRequest(io, socket, data)))

        socket.on("unfriend", safe((data:any) => unfriend(io, socket, data)))

        socket.on("sendMessage", safe((data:any) => sendMessage(io, socket, data)))

        socket.on("getMessages", safe((data:any) => getMessages(io, socket, data)))

        socket.on("call video chat", safe(async (user:any) => {
            if(!user || !user.receiver) return
            const rawSockets:any = await io.fetchSockets()
            const rcvSockets = rawSockets.filter((items:any) => items.handshake.auth.userId === user.receiver)

            if(rcvSockets.length===0) return

            // Unique per call so two simultaneous calls never share a room
            const roomID = `webRTC-${socket.id}-${Date.now()}`
            socket.join(roomID)

            rcvSockets.map((rcvSocket:any)=>{
                rcvSocket.emit('calling', {
                    from: socket.id,
                    name:socket.handshake.auth.name,
                    id:socket.handshake.auth.userId,
                    chatType:user.chatType
                });

            })
            socket.emit("callStarted",{
                userID:rcvSockets[0].handshake.auth.userId,
                name:rcvSockets[0].handshake.auth.name,
                code:rcvSockets[0].handshake.auth.code
            })
        }))

        socket.on("answerCall", safe(async (data:any)=> {
            if(!data) return
            const rawSockets:any = await io.fetchSockets()

            const rcvID = rawSockets.find((items:any) => items.id === data.receiver)
            if(!rcvID) return

            for(const value of rcvID.rooms){
                if(value.includes("webRTC-")){
                    let roomID = value

                    io.to(rcvID.id).emit('acceptedCall', {from:socket.id});
                    const usersInThisRoom:any = await io.in(roomID).fetchSockets()
                    const rawData = usersInThisRoom.map((items:any)=>{
                        return (items.id)

                    })
                    socket.emit("all users", {users:rawData,chatType:data.chatType});
                    socket.join(roomID)
                    break;
                }
            }
        }))

        socket.on("rejectCall", safe(async (data:any) =>{
            if(!data || !data.callerId) return
            const rawSockets:any = await io.fetchSockets()

            const caller = rawSockets.find((items:any) => items.id === data.callerId)
            if(!caller) return
            leaveRooms(caller, "webRTC-")
            caller.emit("rejectedCall")
        }))
        socket.on("callCancel", safe(async (data:any) =>{
            if(!data) return
            leaveRooms(socket, "webRTC-")
            const rawSockets:any = await io.fetchSockets()
            const rcvID = rawSockets.filter((items:any) => items.handshake.auth.userId === data.userID)
            rcvID.forEach((sck:any) => {
                sck.emit("callCanceled")
            });
        }))
        socket.on("sending signal", (payload:any) => {
            if(!payload) return
            io.to(payload.receiver).emit('user joined', { signal: payload.signal, from: socket.id ,chatType:payload.chatType});
        });

        socket.on("returning signal", (payload:any) => {
            if(!payload) return
            io.to(payload.receiver).emit('receiving returned signal', { signal: payload.signal, from: socket.id });
        });

        socket.on("hangupCall", safe(async (payload:any) => {
            for(const value of [...socket.rooms]){
                if(value.includes("webRTC-")){
                    let roomID = value
                    socket.leave(roomID)

                    const usersInThisRoom:any = await io.in(roomID).fetchSockets()
                    if(usersInThisRoom.length<=0) {
                        io.in(roomID).socketsLeave(roomID)
                        continue
                    }
                    usersInThisRoom.map((item:any) => {
                        if(item.id !== socket.id){
                            if(usersInThisRoom.length<=1){
                                io.in(roomID).socketsLeave(roomID)
                            }
                            io.to(item.id).emit('hangup', { from: socket.id });
                        }
                    })
                }
            }
        }))

        socket.on('getServerList', safe((data:any) => listServer(io, socket, data)))

        socket.on('getServerUsers', safe((data:any) => usersServer(io, socket, data)))

        socket.on('getUserInfo', safe((data:any) => infoUser(io, socket, data)))

        socket.on("joinVoiceChannel", safe((data:any) => joinVoiceChannel(io, socket, data)))

        socket.on("hata", (data:any)=>{
            console.error(data);
        })
        socket.on("channelSendingSignal", safe(async (data:any) =>{
            if(!data) return
            const user:any = await findUserByToken(socket.handshake.auth.token)
            if(!user) return

            const rawRoomName =`server-${data.serverID}-${data.channelID}`
            io.to(rawRoomName).emit("userJoinedChannel",{
                _id:user._id.toString(),
                username:user.username,
                code:user.code,
                serverID:data.serverID,
                channelID:data.channelID,
                signal:data.signal,
                first:data.first
            })
        }))

        socket.on("channelReturningSignal", safe(async (data:any)=>{
            if(!data) return
            const user:any = await findUserByToken(socket.handshake.auth.token)
            if(!user) return

	        let rawSockets =await io.fetchSockets()
	        rawSockets.forEach((sockett:any)=>{
                if(sockett.handshake.auth.userId==data.userID){
                    sockett.emit("channelReturningSignalListener",{
                        _id:user._id.toString(),
                        username:user.username,
                        code:user.code,
                        serverID:data.serverID,
                        channelID:data.channelID,
                        signal:data.signal,
                        first:data.first
                    })
                }
            })
        }))

        socket.on("leaveAllChannels", safe((data:any) => leaveVoiceChannel(io, socket, data)))

    })
}
