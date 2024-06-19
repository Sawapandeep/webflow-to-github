const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// Read secrets from file
const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, 'secrets.json'), 'utf8'));

const WEBFLOW_CLIENT_ID = secrets.WEBFLOW_CLIENT_ID;
const WEBFLOW_CLIENT_SECRET = secrets.WEBFLOW_CLIENT_SECRET;
const GITHUB_CLIENT_ID = secrets.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = secrets.GITHUB_CLIENT_SECRET;

const REDIRECT_URI = 'https://your-service.onrender.com/callback';

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

    // Save the access_token to use for API calls
    req.session.webflowToken = access_token;

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

    // Save the access_token to use for API calls
    req.session.githubToken = access_token;

    res.send('Authentication successful! You can now automate commits.');
});

// Step 4: Fetch Webflow code and commit to GitHub
app.post('/commit', async (req, res) => {
    const { siteId, repository, path, branch } = req.body;

    const webflowToken = req.session.webflowToken;
    const githubToken = req.session.githubToken;

    // Fetch code from Webflow
    const siteResponse = await axios.get(`https://api.webflow.com/sites/${siteId}/export`, {
        headers: {
            Authorization: `Bearer ${webflowToken}`,
        },
    });

    const code = siteResponse.data;

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
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
