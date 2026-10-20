import mongoose from 'mongoose'

var Schema = mongoose.Schema;

var userSchema = new Schema({
    sender: {
        type: String,
    },
    receiver:{
        type:String
    },
    message: {
        type: String,
        require:true

    },
    serverName: {
        type: String,
        default:null
    },
    channelName: {
        type: String,
        default:null
    },
    readers:{
        type:Array,
        default:[]
    },
    // The message this one replies to, in the same conversation
    replyTo:{
        type:String,
        default:null
    },
    // Users written as <@userId> in the text
    mentions:{
        type:Array,
        default:[]
    },
    mentionEveryone:{
        type:Boolean,
        default:false
    },
    // [{ emoji, users: [userId] }]
    reactions:{
        type:Array,
        default:[]
    },
    // Link previews: [{ type, url, siteName, title, description, image, ... }]
    embeds:{
        type:Array,
        default:[]
    },
    timestamps: {
        type: Date,
        default: Date.now,
    },
    
});

export default mongoose.model('discordmessages', userSchema);