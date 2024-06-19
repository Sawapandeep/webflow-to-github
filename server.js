const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK using the environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://your-database-name.firebaseio.com" // Replace with your Firebase database URL
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

// Environment variables for OAuth secrets
const WEBFLOW_CLIENT_ID = process.env.WEBFLOW_CLIENT_ID;
const WEBFLOW_CLIENT_SECRET = process.env.WEBFLOW_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI = 'https://your-service.onrender.com/callback'; // Ensure this matches the registered redirect URI

// Step 1: Redirect user to Webflow for authorization
app.get('/auth/webflow', (req, res) => {
    res.redirect(`https://webflow.com/oauth/authorize?client_id=${WEBFLOW_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}`);
});

// Step 2: Handle OAuth callback from Webflow
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    const response = await axios.post('https://api.webflow.com/oauth/access_token', {
        client_id: WEBFLOW_CLIENT_ID,
        client_secret: WEBFLOW_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
    });
    const { access_token } = response.data;

    // Save the access_token to Firestore
    await db.collection('tokens').doc('webflow').set({ token: access_token });

    // Redirect to GitHub authorization
    res.redirect(`https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${REDIRECT_URI}/github`);
});

// Step 3: Handle OAuth callback from GitHub
app.get('/callback/github', async (req, res) => {
    const { code } = req.query;
    const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${REDIRECT_URI}/github`,
    }, {
        headers: {
            accept: 'application/json',
        }
    });
    const { access_token } = response.data;

    // Save the access_token to Firestore
    await db.collection('tokens').doc('github').set({ token: access_token });

    res.send('Authentication successful! You can now automate commits.');
});

// New Endpoint: Save GitHub Repository Information
app.post('/add-repository', async (req, res) => {
    const { userId, repository, path, branch } = req.body;

    if (!userId || !repository || !path || !branch) {
        return res.status(400).send('Missing required fields.');
    }

    // Save the repository information to Firestore
    await db.collection('repositories').doc(userId).set({ repository, path, branch });

    res.send('Repository information saved successfully.');
});

// Step 4: Fetch Webflow code and commit to GitHub
app.post('/commit', async (req, res) => {
    const { userId, siteId } = req.body;

    if (!userId || !siteId) {
        return res.status(400).send('Missing required fields.');
    }

    const webflowTokenDoc = await db.collection('tokens').doc('webflow').get();
    const githubTokenDoc = await db.collection('tokens').doc('github').get();
    const repositoryDoc = await db.collection('repositories').doc(userId).get();

    if (!webflowTokenDoc.exists || !githubTokenDoc.exists || !repositoryDoc.exists) {
        return res.status(400).send('Missing tokens or repository information.');
    }

    const webflowToken = webflowTokenDoc.data().token;
    const githubToken = githubTokenDoc.data().token;
    const { repository, path, branch } = repositoryDoc.data();

    try {
        // Fetch code from Webflow
        const siteResponse = await axios.get(`https://api.webflow.com/sites/${siteId}/export`, {
            headers: {
                Authorization: `Bearer ${webflowToken}`,
            },
        });

        // Assume siteResponse.data contains a zip file or raw HTML/CSS/JS code
        const code = siteResponse.data; // Adjust based on actual response format

        // Commit code to GitHub
        const githubResponse = await axios.put(`https://api.github.com/repos/${repository}/contents/${path}`, {
            message: 'Automated commit from Webflow',
            content: Buffer.from(code).toString('base64'),
            branch,
        }, {
            headers: {
                Authorization: `token ${githubToken}`,
            },
        });

        res.send(githubResponse.data);
    } catch (error) {
        console.error('Error committing to GitHub:', error);
        res.status(500).send('Failed to commit code to GitHub.');
    }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

//!v2
// const express = require('express');
// const axios = require('axios');
// const bodyParser = require('body-parser');
// const admin = require('firebase-admin');

// // Initialize the Firebase Admin SDK using the environment variable
// // const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY );  ////? for render
// const serviceAccount= require("./webflow-to-github_firebase-key.json");////? for local

// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     // databaseURL: "https://your-database-name.firebaseio.com" // Replace with your Firebase database URL
// });

// const db = admin.firestore();

// const app = express();
// app.use(bodyParser.json());

// // Environment variables for OAuth secrets
// const WEBFLOW_CLIENT_ID = process.env.WEBFLOW_CLIENT_ID;
// const WEBFLOW_CLIENT_SECRET = process.env.WEBFLOW_CLIENT_SECRET;
// const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
// const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
// const REDIRECT_URI = 'https://webflow-to-github.onrender.com/callback'; // Ensure this matches the registered redirect URI

// // Step 1: Redirect user to Webflow for authorization
// app.get('/auth/webflow', (req, res) => {
//     res.redirect(`https://webflow.com/oauth/authorize?client_id=${WEBFLOW_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}`);
// });

// // Step 2: Handle OAuth callback from Webflow
// app.get('/callback', async (req, res) => {
//     const { code } = req.query;
//     const response = await axios.post('https://api.webflow.com/oauth/access_token', {
//         client_id: WEBFLOW_CLIENT_ID,
//         client_secret: WEBFLOW_CLIENT_SECRET,
//         grant_type: 'authorization_code',
//         code,
//         redirect_uri: REDIRECT_URI,
//     });
//     const { access_token } = response.data;

//     // Save the access_token to Firestore
//     await db.collection('tokens').doc('webflow').set({ token: access_token });

//     // Redirect to GitHub authorization
//     res.redirect(`https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${REDIRECT_URI}/github`);
// });

// // Step 3: Handle OAuth callback from GitHub
// app.get('/callback/github', async (req, res) => {
//     const { code } = req.query;
//     const response = await axios.post('https://github.com/login/oauth/access_token', {
//         client_id: GITHUB_CLIENT_ID,
//         client_secret: GITHUB_CLIENT_SECRET,
//         code,
//         redirect_uri: `${REDIRECT_URI}/github`,
//     }, {
//         headers: {
//             accept: 'application/json',
//         }
//     });
//     const { access_token } = response.data;

//     // Save the access_token to Firestore
//     await db.collection('tokens').doc('github').set({ token: access_token });

//     res.send('Authentication successful! You can now automate commits.');
// });

// // Step 4: Fetch Webflow code and commit to GitHub
// app.post('/commit', async (req, res) => {
//     const { siteId, repository, path, branch } = req.body;

//     const webflowTokenDoc = await db.collection('tokens').doc('webflow').get();
//     const githubTokenDoc = await db.collection('tokens').doc('github').get();

//     if (!webflowTokenDoc.exists || !githubTokenDoc.exists) {
//         return res.status(400).send('Missing tokens.');
//     }

//     const webflowToken = webflowTokenDoc.data().token;
//     const githubToken = githubTokenDoc.data().token;

//     // Fetch code from Webflow
//     const siteResponse = await axios.get(`https://api.webflow.com/sites/${siteId}/export`, {
//         headers: {
//             Authorization: `Bearer ${webflowToken}`,
//         },
//     });

//     const code = siteResponse.data;

//     // Commit code to GitHub
//     const githubResponse = await axios.put(`https://api.github.com/repos/${repository}/contents/${path}`, {
//         message: 'Automated commit from Webflow',
//         content: Buffer.from(code).toString('base64'),
//         branch,
//     }, {
//         headers: {
//             Authorization: `token ${githubToken}`,
//         },
//     });

//     res.send(githubResponse.data);
// });

// app.listen(3000, () => {
//     console.log('Server running on http://localhost:3000');
// });

//! v1
// const express = require('express');
// const axios = require('axios');
// const bodyParser = require('body-parser');
// const fs = require('fs');
// const path = require('path');
// const admin = require('firebase-admin');

// // Initialize Firebase Admin SDK
// const serviceAccount = fs.readFileSync('/etc/secrets/firebase-key');

// admin.initializeApp({
//     credential: admin.credential.cert(JSON.parse(serviceAccount)),
// //   databaseURL: 'https://your-project-id.firebaseio.com'
// });

// const db = admin.firestore();

// const app = express();
// app.use(bodyParser.json());

// // app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// // Read secrets from file
// //!for non-render application
// // const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, 'secrets.json'), 'utf8'));
// // const WEBFLOW_CLIENT_ID = secrets.WEBFLOW_CLIENT_ID;
// // const WEBFLOW_CLIENT_SECRET = secrets.WEBFLOW_CLIENT_SECRET;
// // const GITHUB_CLIENT_ID = secrets.GITHUB_CLIENT_ID;
// // const GITHUB_CLIENT_SECRET = secrets.GITHUB_CLIENT_SECRET;

// //!for render application
// // app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// const REDIRECT_URI = 'https://webflow-to-github.onrender.com/callback';
// const WEBFLOW_CLIENT_ID = fs.readFileSync('/etc/secrets/WEBFLOW_CLIENT_ID', 'utf8').trim();
// const WEBFLOW_CLIENT_SECRET = fs.readFileSync('/etc/secrets/WEBFLOW_CLIENT_SECRET', 'utf8').trim();
// const GITHUB_CLIENT_ID = fs.readFileSync('/etc/secrets/GITHUB_CLIENT_ID', 'utf8').trim();
// const GITHUB_CLIENT_SECRET = fs.readFileSync('/etc/secrets/GITHUB_CLIENT_SECRET', 'utf8').trim();

// // Step 1: Redirect user to Webflow for authorization
// app.get('/auth/webflow', (req, res) => {
//     res.redirect(`https://webflow.com/oauth/authorize?client_id=${WEBFLOW_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}`);
// });

// // Step 2: Handle OAuth callback from Webflow
// app.get('/callback', async (req, res) => {
//     const { code } = req.query;
//     const response = await axios.post('https://api.webflow.com/oauth/access_token', {
//         client_id: WEBFLOW_CLIENT_ID,
//         client_secret: WEBFLOW_CLIENT_SECRET,
//         grant_type: 'authorization_code',
//         code,
//         redirect_uri: REDIRECT_URI,
//     });
//     const { access_token } = response.data;

//     // Save the access_token to Firestore
//     await db.collection('tokens').doc('webflowToken').set({
//       token: access_token
//     });

//     // Redirect to GitHub authorization
//     res.redirect(`https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${REDIRECT_URI}/github`);
// });

// // Step 3: Handle OAuth callback from GitHub
// app.get('/callback/github', async (req, res) => {
//     const { code } = req.query;
//     const response = await axios.post('https://github.com/login/oauth/access_token', {
//         client_id: GITHUB_CLIENT_ID,
//         client_secret: GITHUB_CLIENT_SECRET,
//         code,
//         redirect_uri: `${REDIRECT_URI}/github`,
//     }, {
//         headers: {
//             accept: 'application/json',
//         }
//     });
//     const { access_token } = response.data;

//     // Save the access_token to Firestore
//     await db.collection('tokens').doc('githubToken').set({
//       token: access_token
//     });

//     res.send('Authentication successful! You can now automate commits.');
// });

// // Step 4: Fetch Webflow code and commit to GitHub
// app.post('/commit', async (req, res) => {
//     const { siteId, repository, path, branch } = req.body;

//     // Fetch tokens from Firestore
//     const webflowTokenDoc = await db.collection('tokens').doc('webflowToken').get();
//     const githubTokenDoc = await db.collection('tokens').doc('githubToken').get();

//     const webflowToken = webflowTokenDoc.data().token;
//     const githubToken = githubTokenDoc.data().token;

//     // Fetch code from Webflow
//     const siteResponse = await axios.get(`https://api.webflow.com/sites/${siteId}/export`, {
//         headers: {
//             Authorization: `Bearer ${webflowToken}`,
//         },
//     });

//     const code = siteResponse.data;

//     // Commit code to GitHub
//     const githubResponse = await axios.put(`https://api.github.com/repos/${repository}/contents/${path}`, {
//         message: 'Automated commit from Webflow',
//         content: Buffer.from(code).toString('base64'),
//         branch,
//     }, {
//         headers: {
//             Authorization: `token ${githubToken}`,
//         },
//     });

//     res.send(githubResponse.data);
// });

// app.listen(3000, () => {
//     console.log('Server running on http://localhost:3000');
// });
// // const REDIRECT_URI = 'https://webflow-to-github.onrender.com/callback';
// // const WEBFLOW_CLIENT_ID = fs.readFileSync('/etc/secrets/WEBFLOW_CLIENT_ID', 'utf8').trim();
// // const WEBFLOW_CLIENT_SECRET = fs.readFileSync('/etc/secrets/WEBFLOW_CLIENT_SECRET', 'utf8').trim();
// // const GITHUB_CLIENT_ID = fs.readFileSync('/etc/secrets/GITHUB_CLIENT_ID', 'utf8').trim();
// // const GITHUB_CLIENT_SECRET = fs.readFileSync('/etc/secrets/GITHUB_CLIENT_SECRET', 'utf8').trim();


// // // Step 1: Redirect user to Webflow for authorization
// // app.get('/auth/webflow', (req, res) => {
// //     res.redirect(`https://webflow.com/oauth/authorize?client_id=${WEBFLOW_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}`);
// // });

// // // Step 2: Handle OAuth callback from Webflow
// // app.get('/callback', async (req, res) => {
// //     const { code } = req.query;
// //     const response = await axios.post('https://api.webflow.com/oauth/access_token', {
// //         client_id: WEBFLOW_CLIENT_ID,
// //         client_secret: WEBFLOW_CLIENT_SECRET,
// //         grant_type: 'authorization_code',
// //         code,
// //         redirect_uri: REDIRECT_URI,
// //     });
// //     const { access_token } = response.data;
  
// //     // Save the access_token to Firestore
// //     await db.collection('tokens').doc('webflowToken').set({
// //       token: access_token
// //     });
  
// //     // Redirect to GitHub authorization
// //     res.redirect(`https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${REDIRECT_URI}/github`);
// //   });
  

// // // Step 3: Handle OAuth callback from GitHub
// // app.get('/callback/github', async (req, res) => {
// //     const { code } = req.query;
// //     const response = await axios.post('https://github.com/login/oauth/access_token', {
// //         client_id: GITHUB_CLIENT_ID,
// //         client_secret: GITHUB_CLIENT_SECRET,
// //         code,
// //         redirect_uri: `${REDIRECT_URI}/github`,
// //     }, {
// //         headers: {
// //             accept: 'application/json',
// //         }
// //     });
// //     const { access_token } = response.data;
  
// //     // Save the access_token to Firestore
// //     await db.collection('tokens').doc('githubToken').set({
// //       token: access_token
// //     });
  
// //     res.send('Authentication successful! You can now automate commits.');
// //   });
  
// // // Step 4: Fetch Webflow code and commit to GitHub
// // app.post('/commit', async (req, res) => {
// //     const { siteId, repository, path, branch } = req.body;
  
// //     // Fetch tokens from Firestore
// //     const webflowTokenDoc = await db.collection('tokens').doc('webflowToken').get();
// //     const githubTokenDoc = await db.collection('tokens').doc('githubToken').get();
  
// //     const webflowToken = webflowTokenDoc.data().token;
// //     const githubToken = githubTokenDoc.data().token;
  
// //     // Fetch code from Webflow
// //     const siteResponse = await axios.get(`https://api.webflow.com/sites/${siteId}/export`, {
// //         headers: {
// //             Authorization: `Bearer ${webflowToken}`,
// //         },
// //     });
  
// //     const code = siteResponse.data;
  
// //     // Commit code to GitHub
// //     const githubResponse = await axios.put(`https://api.github.com/repos/${repository}/contents/${path}`, {
// //         message: 'Automated commit from Webflow',
// //         content: Buffer.from(code).toString('base64'),
// //         branch,
// //     }, {
// //         headers: {
// //             Authorization: `token ${githubToken}`,
// //         },
// //     });
  
// //     res.send(githubResponse.data);
// //   });
  

// // app.listen(3000, () => {
// //     console.log('Server running on http://localhost:3000');
// // });
