// Load environment variables first
require('dotenv').config();

// Add debug logging
console.log('Environment variables loaded:');
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_HOST:', process.env.DB_HOST);

// Use the models index to ensure proper associations
const { sequelize, PostSEO, Post } = require('./src/models');

async function createPostSEOTable() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    console.log('Creating PostSEO table...');
    await PostSEO.sync({ force: true });
    console.log('PostSEO table created successfully.');

    console.log('PostSEO table setup completed!');
    
    // Create some sample data if posts exist
    const posts = await Post.findAll({ limit: 5 });
    if (posts.length > 0) {
      console.log('Creating sample SEO data...');
      
      for (const post of posts) {
        await PostSEO.create({
          postId: post.id,
          title: post.title,
          metaDescription: `Mô tả cho bài viết: ${post.title}`,
          focusKeyword: 'sample keyword',
          seoScore: Math.floor(Math.random() * 100),
          readabilityScore: Math.floor(Math.random() * 100),
          lastAnalyzed: new Date()
        });
      }
      
      console.log('Sample SEO data created successfully.');
    }

    await sequelize.close();
    console.log('Database connection closed.');
    
  } catch (error) {
    console.error('Error creating PostSEO table:', error);
    process.exit(1);
  }
}

createPostSEOTable();
