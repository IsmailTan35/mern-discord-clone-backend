import configuration from "./configs/configuration";
import { acceptFriendRequest, cancelFriendRequest, getFriendRequests, rejectFriendRequest } from "./friend/request";
import { getFriendBlockeds } from "./friend/blocked";
import getFriendAll from "./friend/all";
import unfriend from "./friend/unfriend";
import sendMessage from "./message/sendMessage";
import getMessages from "./message/getMessages";
import toggleReaction from "./message/react";
import typing from "./message/typing";
import manageChannel from "./channel/manage";
import disconnect from "./configs/disconnect";

import joinVoiceChannel from "./channel/join"
import leaveVoiceChannel from "./channel/leave"

import listServer from "./server/list"
import usersServer from "./server/users"

import infoUser from "./user/info"
import { emitToServerMembers, getVoiceRoom, leaveRooms } from "../../helper/helperSocket";

// Socket.io does not catch errors thrown by async listeners; an unhandled
// rejection there would take the whole process down
const safe = (handler:(...args:any[])=>any) => async (...args:any[]) => {
    try {
        await handler(...args)
    } catch (error) {
        console.error(error)
    }
}

// How long an event waits for "configuration" before running anyway
const CONFIGURATION_WAIT_MS = 5000

export default (io:any,con:any)=>{
    io.db = con;
    io.on("connection", (socket:any) => {
        // "configuration" finds out who this socket belongs to with a database
        // lookup. Events sent right after connecting (the server list, joining a
        // voice channel, ...) wait for it instead of being dropped for having no
        // user yet. Promise reactions run in order, so the events stay in order.
        let markConfigured = () => {}
        const configured = new Promise<void>(resolve => { markConfigured = resolve })
        const afterConfiguration = (handler:(...args:any[])=>any) => safe(async (...args:any[]) => {
            await Promise.race([configured, new Promise(resolve => setTimeout(resolve, CONFIGURATION_WAIT_MS))])
            return handler(...args)
        })

        socket.on("configuration", safe(async (data:any) => {
            await configuration(io, socket, data)
            if(socket.handshake.auth.userId) markConfigured()
        }))

        socket.on("disconnecting", safe(() => disconnect(io, socket)))

        socket.on("getFriendRequests", afterConfiguration((data:any) => getFriendRequests(io, socket, data)))

        socket.on("getFriendBlockeds", afterConfiguration((data:any) => getFriendBlockeds(io, socket, data)))

        socket.on("getFriendAll", afterConfiguration((data:any) => getFriendAll(io, socket, data)))

        socket.on("acceptFriendRequest", afterConfiguration((data:any) => acceptFriendRequest(io, socket, data)))

        socket.on("rejectFriendRequest", afterConfiguration((data:any) => rejectFriendRequest(io, socket, data)))

        socket.on("cancelFriendRequest", afterConfiguration((data:any) => cancelFriendRequest(io, socket, data)))

        socket.on("unfriend", afterConfiguration((data:any) => unfriend(io, socket, data)))

        socket.on("sendMessage", afterConfiguration((data:any) => sendMessage(io, socket, data)))

        socket.on("getMessages", afterConfiguration((data:any) => getMessages(io, socket, data)))

        socket.on("toggleReaction", afterConfiguration((data:any) => toggleReaction(io, socket, data)))

        socket.on("typing", afterConfiguration((data:any) => typing(io, socket, data)))

        // Channel management by the server owner; answers through the acknowledgement
        socket.on("createChannel", afterConfiguration((data:any, ack:any) => manageChannel.create(io, socket, data, ack)))

        socket.on("updateChannel", afterConfiguration((data:any, ack:any) => manageChannel.update(io, socket, data, ack)))

        socket.on("deleteChannel", afterConfiguration((data:any, ack:any) => manageChannel.remove(io, socket, data, ack)))

        socket.on("call video chat", afterConfiguration(async (user:any) => {
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

        socket.on("answerCall", afterConfiguration(async (data:any)=> {
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

        socket.on("rejectCall", afterConfiguration(async (data:any) =>{
            if(!data || !data.callerId) return
            const rawSockets:any = await io.fetchSockets()

            const caller = rawSockets.find((items:any) => items.id === data.callerId)
            if(!caller) return
            leaveRooms(caller, "webRTC-")
            caller.emit("rejectedCall")
        }))
        socket.on("callCancel", afterConfiguration(async (data:any) =>{
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

        socket.on("hangupCall", afterConfiguration(async (payload:any) => {
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

        socket.on('getServerList', afterConfiguration((data:any) => listServer(io, socket, data)))

        socket.on('getServerUsers', afterConfiguration((data:any) => usersServer(io, socket, data)))

        socket.on('getUserInfo', afterConfiguration((data:any) => infoUser(io, socket, data)))

        socket.on("joinVoiceChannel", afterConfiguration((data:any) => joinVoiceChannel(io, socket, data)))

        socket.on("hata", (data:any)=>{
            console.error(data);
        })
        // Relays a WebRTC offer/answer to one socket of the same voice channel
        socket.on("voiceSignal", safe(async (data:any) =>{
            if(!data || !data.to || !data.signal) return

            const rawRoomName =`server-${data.serverID}-${data.channelID}`
            if(!socket.rooms.has(rawRoomName)) return

            const members:any = await io.in(rawRoomName).fetchSockets()
            if(!members.some((member:any) => member.id === data.to)) return

            io.to(data.to).emit("voiceSignal",{
                from:socket.id,
                fromUserId:socket.handshake.auth.userId,
                serverID:data.serverID,
                channelID:data.channelID,
                signal:data.signal,
            })
        }))

        // Shown to every member of the server, like Discord's green speaking ring
        socket.on("voiceSpeaking", afterConfiguration(async (data:any) =>{
            const voice = getVoiceRoom(socket)
            if(!voice || !socket.handshake.auth.userId) return
            await emitToServerMembers(io, voice.serverID, "voiceSpeaking", {
                userId:socket.handshake.auth.userId,
                serverID:voice.serverID,
                channelID:voice.channelID,
                speaking:!!(data && data.speaking),
            }, 10000)
        }))

        // The mute / deafen buttons of the user panel: icons next to the user
        socket.on("voiceState", afterConfiguration(async (data:any) =>{
            const voice = getVoiceRoom(socket)
            if(!voice || !socket.handshake.auth.userId) return
            socket.data.selfMute = !!(data && data.selfMute)
            socket.data.selfDeaf = !!(data && data.selfDeaf)
            await emitToServerMembers(io, voice.serverID, "voiceState", {
                userId:socket.handshake.auth.userId,
                serverID:voice.serverID,
                channelID:voice.channelID,
                selfMute:socket.data.selfMute,
                selfDeaf:socket.data.selfDeaf,
            })
        }))

        // Screen sharing in a voice channel: the "LIVE" badge next to the user
        socket.on("voiceScreenShare", afterConfiguration(async (data:any) =>{
            const voice = getVoiceRoom(socket)
            if(!voice || !socket.handshake.auth.userId) return
            socket.data.screenSharing = !!(data && data.sharing)
            await emitToServerMembers(io, voice.serverID, "voiceScreenShare", {
                userId:socket.handshake.auth.userId,
                serverID:voice.serverID,
                channelID:voice.channelID,
                sharing:socket.data.screenSharing,
            })
        }))

        socket.on("leaveAllChannels", afterConfiguration((data:any) => leaveVoiceChannel(io, socket, data)))

    })
}
