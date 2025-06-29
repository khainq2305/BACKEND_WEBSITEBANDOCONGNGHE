require('dotenv').config();

const { PostSEO, Post } = require('./src/models');

async function createSampleSEOData() {
  try {
    console.log('🚀 Creating sample SEO data...');

    // Tìm bài viết có slug 'chon-thiet-bi-an-toan'
    const post = await Post.findOne({ 
      where: { slug: 'chon-thiet-bi-an-toan' } 
    });

    if (!post) {
      console.log('❌ Post with slug "chon-thiet-bi-an-toan" not found');
      return;
    }

    console.log('✅ Found post:', post.title);

    // Kiểm tra xem đã có SEO data chưa
    const existingSEO = await PostSEO.findOne({ 
      where: { postId: post.id } 
    });

    if (existingSEO) {
      console.log('⚠️ SEO data already exists for this post');
      console.log('Current SEO data:', JSON.stringify(existingSEO, null, 2));
      return;
    }

    // Tạo SEO data mẫu
    const seoData = await PostSEO.create({
      postId: post.id,
      title: `${post.title} - Hướng dẫn chi tiết 2025`,
      metaDescription: `Tìm hiểu cách ${post.title.toLowerCase()}. Hướng dẫn đầy đủ, chi tiết với những lời khuyên thực tế từ chuyên gia. Cập nhật mới nhất 2025.`,
      focusKeyword: 'thiết bị an toàn',
      canonicalUrl: `https://yourdomain.com/tin-tuc/${post.slug}`,
      robots: {
        index: true,
        follow: true,
        archive: true,
        snippet: true,
        imageIndex: true
      },
      socialMeta: {
        facebook: {
          title: `${post.title} - Hướng dẫn chuyên sâu`,
          description: `Khám phá ${post.title.toLowerCase()} với hướng dẫn từ A-Z. Chia sẻ ngay để bạn bè cùng biết!`,
          image: '/images/seo/facebook-share-image.jpg'
        },
        twitter: {
          title: `${post.title} - Tips & Tricks`,
          description: `${post.title} - Những điều bạn cần biết. #TechTips #AnToan`,
          image: '/images/seo/twitter-share-image.jpg',
          cardType: 'summary_large_image'
        }
      },
      schema: {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.title,
        "description": `Hướng dẫn chi tiết về ${post.title.toLowerCase()}`,
        "author": {
          "@type": "Person",
          "name": "Tech Expert"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Tech Shop",
          "logo": {
            "@type": "ImageObject",
            "url": "https://yourdomain.com/logo.png"
          }
        },
        "datePublished": post.createdAt,
        "dateModified": post.updatedAt
      },
      seoScore: 85,
      readabilityScore: 78,
      analysis: {
        issues: ["Thêm alt text cho hình ảnh", "Cải thiện độ dài meta description"],
        recommendations: ["Sử dụng từ khóa trong tiêu đề phụ", "Thêm liên kết nội bộ"]
      },
      isNoIndex: false,
      isNoFollow: false
    });

    console.log('✅ Successfully created SEO data:');
    console.log('📊 SEO Score:', seoData.seoScore);
    console.log('📖 Readability Score:', seoData.readabilityScore);
    console.log('🎯 Focus Keyword:', seoData.focusKeyword);
    console.log('📝 Meta Description Length:', seoData.metaDescription.length);

  } catch (error) {
    console.error('❌ Error creating sample SEO data:', error);
  }
}

createSampleSEOData();
