import { Server } from "socket.io";
import {createServer as httpCreate} from "http";
import {createServer as httpsCreate} from "https";
import * as fs from'fs';

const httpServer = (app:any,port:any) =>{
	const httpServer = httpCreate(app)
	httpServer.listen(port, () =>{
		console.info((new Date()) + ' Http server is listening on port ' + port);
	});
	return httpServer
}

const httpsServer = (app:any,port:any,credentials:any) =>{
	const httpsServer = httpsCreate(credentials,app)
	httpsServer.listen(port, () =>{
		console.info((new Date()) + ' Https server is listening on port ' + port);
	});
	return httpsServer
}

const webSocket = (httpServer:any) =>{
    const io = new Server(httpServer, { 
		cors: {
			origin: "*",
		  }
    });
    return io;
}

const CreateServer= (app:any,port:any) => {
	const checkPrivateKey = fs.existsSync('/etc/ssl/private/private.key')
	const checkCertificate = fs.existsSync('/etc/ssl/certs/certificate.crt')
	const checkCa = fs.existsSync('/etc/ssl/ca/ca_bundle.crt')
	
	if(checkPrivateKey && checkCertificate && checkCa){
		const privateKey = fs.readFileSync('/etc/ssl/private/private.key', 'utf8')
		const certificate = fs.readFileSync('/etc/ssl/certs/certificate.crt', 'utf8')
		const ca = fs.readFileSync('/etc/ssl/ca/ca_bundle.crt', 'utf8')
		
		const credentials = {
			key: privateKey,
			cert: certificate,
			ca: ca
		}
	
		return httpsServer(app,port,credentials)
	}
	else{

		return httpServer(app,port)
	}
}

export {
    httpServer,
    httpsServer,
    webSocket,
	CreateServer
}