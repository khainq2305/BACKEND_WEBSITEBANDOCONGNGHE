const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

async function getAccessToken() {
  const client = await auth.getClient();
  console.log('Email:', (await client.getCredentials()).client_email);
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

module.exports = { getAccessToken };
