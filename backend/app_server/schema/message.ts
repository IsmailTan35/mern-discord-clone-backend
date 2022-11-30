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
    timestamps: {
        type: Date,
        default: Date.now,
    },
    
});

export default mongoose.model('discordmessages', userSchema);