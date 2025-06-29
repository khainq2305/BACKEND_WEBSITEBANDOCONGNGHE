require('dotenv').config();
const sequelize = require('./src/config/database');
const PostSEO = require('./src/models/postSEO');

async function createPostSEOTable() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    console.log('Creating PostSEO table...');
    await PostSEO.sync({ force: false });
    console.log('PostSEO table created successfully!');

    console.log('Database operations completed.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

createPostSEOTable();
