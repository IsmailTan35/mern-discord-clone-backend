const cors = require("cors")

const corsOptions ={
    origin:'*', 
    credentials:true,
    optionSuccessStatus:200,
    }

cors(corsOptions)

export default cors