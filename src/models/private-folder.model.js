import mongoose from "mongoose"

const modelSchema = mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"User",
    },
},{timestamps:true})

const PrivateFolder = mongoose.model("PrivateFolder",modelSchema)

export default PrivateFolder
