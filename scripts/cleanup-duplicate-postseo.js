const { PostSEO, sequelize } = require('../src/models');

async function cleanupDuplicatePostSEO() {
  console.log('🧹 Starting cleanup of duplicate PostSEO records...');
  
  try {
    // Tìm tất cả postId có nhiều hơn 1 record
    const duplicates = await sequelize.query(`
      SELECT postId, COUNT(*) as count 
      FROM post_seo 
      GROUP BY postId 
      HAVING COUNT(*) > 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${duplicates.length} posts with duplicate SEO records`);

    let totalCleaned = 0;

    for (const duplicate of duplicates) {
      const { postId, count } = duplicate;
      console.log(`\n🔍 Processing postId: ${postId} (${count} records)`);

      // Lấy tất cả records cho postId này, sắp xếp theo createdAt
      const records = await PostSEO.findAll({
        where: { postId },
        order: [['createdAt', 'ASC']]
      });

      if (records.length > 1) {
        // Giữ lại record đầu tiên (cũ nhất)
        const keepRecord = records[0];
        const duplicateRecords = records.slice(1);
        
        console.log(`📝 Keeping record ID: ${keepRecord.id} (created: ${keepRecord.createdAt})`);
        console.log(`🗑️  Removing ${duplicateRecords.length} duplicate records: ${duplicateRecords.map(r => r.id).join(', ')}`);

        // Xóa các duplicate records
        await PostSEO.destroy({
          where: {
            id: duplicateRecords.map(r => r.id)
          }
        });

        totalCleaned += duplicateRecords.length;
        console.log(`✅ Cleaned ${duplicateRecords.length} records for postId: ${postId}`);
      }
    }

    console.log(`\n🎉 Cleanup completed! Removed ${totalCleaned} duplicate records total.`);

    // Verify cleanup
    const remainingDuplicates = await sequelize.query(`
      SELECT postId, COUNT(*) as count 
      FROM post_seo 
      GROUP BY postId 
      HAVING COUNT(*) > 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    if (remainingDuplicates.length === 0) {
      console.log('✅ Verification passed: No duplicate records found!');
    } else {
      console.log(`⚠️  Warning: ${remainingDuplicates.length} posts still have duplicates:`, remainingDuplicates);
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupDuplicatePostSEO()
    .then(() => {
      console.log('🏁 Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed with error:', error);
      process.exit(1);
    });
}

module.exports = { cleanupDuplicatePostSEO };