const { sequelize } = require('./src/models');

async function dropAndCreatePostSEOTable() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    console.log('Dropping PostSEO table if exists...');
    await sequelize.query('DROP TABLE IF EXISTS post_seo');
    console.log('PostSEO table dropped.');

    console.log('Creating PostSEO table...');
    const PostSEO = require('./src/models/postSEO');
    await PostSEO.sync({ force: true });
    console.log('PostSEO table created successfully.');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

dropAndCreatePostSEOTable();
