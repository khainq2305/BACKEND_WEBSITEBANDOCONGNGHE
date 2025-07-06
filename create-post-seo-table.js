// Load environment variables first
require('dotenv').config();

// Add debug logging
console.log('Environment variables loaded:');
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_HOST:', process.env.DB_HOST);

// Use the models index to ensure proper associations
const { sequelize, PostSEO, Post } = require('./src/models');

async function fixPostSEODuplicates() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🔍 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');

    console.log('🔍 Kiểm tra duplicate records trong bảng post_seo...');
    
    // Tìm các postId có nhiều hơn 1 record
    const duplicates = await sequelize.query(`
      SELECT postId, COUNT(*) as count
      FROM post_seo 
      GROUP BY postId 
      HAVING COUNT(*) > 1
    `, {
      type: sequelize.QueryTypes.SELECT,
      transaction
    });

    console.log(`📊 Tìm thấy ${duplicates.length} post có duplicate records`);

    if (duplicates.length === 0) {
      console.log('✅ Không có duplicate records nào!');
      await transaction.commit();
      return;
    }

    let totalDeleted = 0;

    // Xử lý từng postId có duplicate
    for (const { postId, count } of duplicates) {
      console.log(`\n🔧 Xử lý postId ${postId} (có ${count} records):`);
      
      // Lấy tất cả records của postId này, sắp xếp theo id DESC (mới nhất trước)
      const records = await PostSEO.findAll({
        where: { postId },
        order: [['id', 'DESC']],
        transaction
      });

      // Giữ lại record đầu tiên (mới nhất), xóa các record còn lại
      const keepRecord = records[0];
      const deleteRecords = records.slice(1);

      console.log(`  ✅ Giữ lại record id: ${keepRecord.id} (mới nhất)`);
      
      for (const record of deleteRecords) {
        await record.destroy({ transaction });
        console.log(`  🗑️  Xóa record id: ${record.id}`);
        totalDeleted++;
      }
    }

    console.log(`\n📋 Tổng kết:`);
    console.log(`  - ${duplicates.length} post có duplicate`);
    console.log(`  - ${totalDeleted} records đã bị xóa`);
    console.log(`  - Mỗi post giờ chỉ còn 1 record SEO`);

    // Thêm unique constraint nếu chưa có
    try {
      console.log('\n🔒 Kiểm tra và thêm unique constraint cho postId...');
      await sequelize.query(`
        ALTER TABLE post_seo 
        ADD CONSTRAINT post_seo_postId_unique 
        UNIQUE (postId)
      `, { transaction });
      console.log('✅ Đã thêm unique constraint thành công!');
    } catch (error) {
      if (error.message.includes('already exists') || 
          error.message.includes('Duplicate key name') ||
          error.message.includes('Duplicate entry')) {
        console.log('ℹ️  Unique constraint đã tồn tại');
      } else {
        console.log('⚠️  Lỗi khi thêm unique constraint:', error.message);
        // Không rollback transaction vì việc xóa duplicate vẫn thành công
      }
    }

    await transaction.commit();
    console.log('\n🎉 Hoàn thành sửa lỗi duplicate PostSEO!');
    
    // Kiểm tra lại kết quả
    const remainingDuplicates = await sequelize.query(`
      SELECT postId, COUNT(*) as count
      FROM post_seo 
      GROUP BY postId 
      HAVING COUNT(*) > 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    if (remainingDuplicates.length === 0) {
      console.log('✅ Xác nhận: Không còn duplicate records nào!');
    } else {
      console.log(`⚠️  Vẫn còn ${remainingDuplicates.length} duplicate records`);
    }

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Lỗi khi sử lỗi duplicate PostSEO:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('🔌 Database connection closed.');
  }
}

// Chạy script nếu được gọi trực tiếp
if (require.main === module) {
  fixPostSEODuplicates()
    .then(() => {
      console.log('\n✨ Script hoàn thành thành công!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script thất bại:', error);
      process.exit(1);
    });
}

module.exports = { fixPostSEODuplicates };
