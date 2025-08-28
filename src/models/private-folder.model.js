import mongoose from "mongoose"

const modelSchema = mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"User"
    },
    name:{
        type:String,
        required:true,
        minLength:3,
        maxLength:15
    },
    occassion:{
        type:String,
        required:true,
        minLength:3,
        maxLength:15
    }
})

const PrivateFolder = mongoose.model("PrivateFolder",modelSchema)

export default PrivateFolder
