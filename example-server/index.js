// npm deps
const express = require('express');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const QueryString = require('querystring');
const dotenv = require('dotenv');
dotenv.config();

// Require the framework and instantiate it
const app = express();

// init spotify config
const spClientId = process.env.SPOTIFY_CLIENT_ID;
const spClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const iv = Buffer.from(process.env.IV, "hex");
const spClientCallback = process.env.SPOTIFY_CLIENT_CALLBACK;
const authString = Buffer.from(spClientId+':'+spClientSecret).toString('base64');
const authHeader = `Basic ${authString}`;
const spotifyEndpoint = 'https://accounts.spotify.com/api/token';

// encryption
const encSecret = process.env.ENCRYPTION_SECRET;
const encMethod = process.env.ENCRYPTION_METHOD || "aes-256-ctr";
const encrypt = (text) => {

	const cipher = crypto.createCipheriv(encMethod, Buffer.from(encSecret), iv);

    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
	return encrypted.toString('hex');
};
const decrypt = (text) => {
	console.log("text ", text)
	const decipher = crypto.createDecipheriv(encMethod, Buffer.from(encSecret), iv);

    const decrpyted = Buffer.concat([decipher.update(Buffer.from(text, 'hex')), decipher.final()]);

    return decrpyted.toString();
};

// handle sending POST request
function postRequest(url, data={})
{
	return new Promise((resolve, reject) => {
		// build request data
		url = new URL(url);
		const reqData = {
			protocol: url.protocol,
			hostname: url.hostname,
			port: url.port,
			path: url.pathname,
			method: 'POST',
			headers: {
				'Authorization': authHeader,
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		}

		// create request
		const req = https.request(reqData, (res) => {
			// build response
			let buffers = [];
			res.on('data', (chunk) => {
				buffers.push(chunk);
			});

			res.on('end', () => {
				// parse response
				let result = null;
				try
				{
					result = Buffer.concat(buffers);
					result = result.toString();
					var contentType = res.headers['content-type'];
					if(typeof contentType == 'string')
					{
						contentType = contentType.split(';')[0].trim();
					}
					if(contentType == 'application/x-www-form-urlencoded')
					{
						result = QueryString.parse(result);
					}
					else if(contentType == 'application/json')
					{
						result = JSON.parse(result);
					}
				}
				catch(error)
				{
					error.response = res;
					error.data = result;
					reject(error);
					return;
				}
				resolve({response: res, result: result});
			})
		});

		// handle error
		req.on('error', (error) => {
			reject(error);
		});

		// send
		data = QueryString.stringify(data);
		req.write(data);
		req.end();
	});
}

// support form body
app.use(express.urlencoded({extended: false}));
app.use(express.json())

/**
 * Swap endpoint
 * Uses an authentication code on body to request access and refresh tokens
 */
app.post('/api/swap', async (req, res) => {
	console.log('we are in swap!!')
	try {
		console.log("in try:");
		console.log('im in swap!! code is: ', req.body.code);

		// build request data
		const reqData = {
			grant_type: 'authorization_code',
			redirect_uri: spClientCallback,
			code: req.body.code
		};

		// get new token from Spotify API
		const { response, result } = await postRequest(spotifyEndpoint, reqData);
		console.log('result: ', result);
		// encrypt refresh_token
		if (result.refresh_token) {
			result.refresh_token = encrypt(Buffer.from(result.refresh_token, 'utf8'));
			console.log('encrypted refresh_token: ', result.refresh_token);
		}
		else{
			console.log("no refresh token in result!!")
		}

		// send response
		res.status(response.statusCode).json(result);
	}
	catch(error) {
		console.log("error ", error);
		if(error.response) {
			res.status(error.response.statusCode);
		}
		else {
			res.status(500);
		}
		if(error.data) {
			res.send(error.data);
		}
		else {
			res.send("");
		}
	}
});
const getRefreshToken = (thing) => (JSON.parse(Object.keys(JSON.parse(JSON.stringify(thing)))[0]).refreshToken);
/**
 * Refresh endpoint
 * Uses the refresh token on request body to get a new access token
 */
app.post('/api/refresh', async (req, res) => {
	// console.log(JSON.parse(Object.keys(JSON.parse(JSON.stringify(req.body)))[0]).refreshToken);
	console.log("in REFRESH with req: ", req.body);
	try {
		// ensure refresh token parameters
		if (!req.body.refreshToken) {
			console.log("no refresh token in req!!")
			res.status(400).json({error: 'Refresh token is missing from body'});
			return;
		}

		// decrypt token
		const refreshToken = decrypt(req.body.refreshToken);
		console.log('decrypted refreshToken: ', refreshToken);
		// build request data
		const reqData = {
			grant_type: 'refresh_token',
			refresh_token: refreshToken
		};
		// get new token from Spotify API
		const { response, result } = await postRequest(spotifyEndpoint, reqData);
		console.log('result: ', result);

		// encrypt refresh_token
		if (result.refresh_token) {
			result.refresh_token = encrypt(result.refresh_token);
		}

		// send response
		res.status(response.statusCode).json(result);
	}
	catch(error) {
		console.log("error in refresh ", error);
		if(error.response) {
			res.status(error.response.statusCode);
		}
		else {
			res.status(500);
		}
		if(error.data) {
			res.send(error.data);
		}
		else {
			res.send("");
		}
	}
});

// start server
const spServerPort = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(spServerPort, () => console.log('Example app listening on port '+spServerPort+'!'));
