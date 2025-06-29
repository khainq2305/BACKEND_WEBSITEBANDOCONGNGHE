require('dotenv').config();

const { PostSEO, Post } = require('./src/models');

async function updateSEOData() {
  try {
    console.log('🔄 Updating SEO data for better content...');

    // Tìm bài viết có slug 'chon-thiet-bi-an-toan'
    const post = await Post.findOne({ 
      where: { slug: 'chon-thiet-bi-an-toan' } 
    });

    if (!post) {
      console.log('❌ Post with slug "chon-thiet-bi-an-toan" not found');
      return;
    }

    // Cập nhật SEO data để phù hợp với nội dung bài viết
    const [updatedCount] = await PostSEO.update({
      title: `${post.title} - Hướng dẫn từ A đến Z 2025`,
      metaDescription: `Học cách ${post.title.toLowerCase()} an toàn và hiệu quả. Hướng dẫn chi tiết từ chuyên gia với những mẹo vặt thiết thực. Cập nhật mới nhất 2025.`,
      focusKeyword: 'thiết bị điện an toàn',
      canonicalUrl: `https://techshop.com/tin-tuc/${post.slug}`,
      socialMeta: {
        facebook: {
          title: `${post.title} - Bí quyết từ chuyên gia`,
          description: `Khám phá cách ${post.title.toLowerCase()} đúng cách. Những kinh nghiệm quý báu từ chuyên gia. Chia sẻ ngay!`,
          image: '/images/blog/thiet-bi-dien-an-toan-share.jpg'
        },
        twitter: {
          title: `${post.title} - Tips quan trọng`,
          description: `${post.title} - Những điều PHẢI biết để đảm bảo an toàn. #ThietBiDien #AnToan #TechTips`,
          image: '/images/blog/thiet-bi-dien-twitter.jpg',
          cardType: 'summary_large_image'
        }
      },
      schema: {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.title,
        "description": `Hướng dẫn chi tiết về cách ${post.title.toLowerCase()} để đảm bảo an toàn và hiệu quả`,
        "image": "https://techshop.com/images/blog/thiet-bi-dien-feature.jpg",
        "author": {
          "@type": "Person",
          "name": "Chuyên gia Tech",
          "url": "https://techshop.com/chuyen-gia"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Tech Shop",
          "logo": {
            "@type": "ImageObject",
            "url": "https://techshop.com/logo.png",
            "width": 112,
            "height": 112
          }
        },
        "datePublished": post.createdAt,
        "dateModified": new Date(),
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": `https://techshop.com/tin-tuc/${post.slug}`
        }
      },
      seoScore: 92,
      readabilityScore: 85,
      analysis: {
        issues: ["Thêm thêm liên kết nội bộ", "Cải thiện độ dài đoạn văn"],
        recommendations: ["Sử dụng từ khóa trong H2, H3", "Thêm call-to-action cuối bài", "Thêm FAQ section"]
      }
    }, {
      where: { postId: post.id }
    });

    if (updatedCount > 0) {
      console.log('✅ Successfully updated SEO data!');
      
      // Lấy lại data đã cập nhật để kiểm tra
      const updatedSEO = await PostSEO.findOne({ 
        where: { postId: post.id } 
      });
      
      console.log('📊 Updated SEO Score:', updatedSEO.seoScore);
      console.log('📖 Updated Readability Score:', updatedSEO.readabilityScore);
      console.log('🎯 Updated Focus Keyword:', updatedSEO.focusKeyword);
      console.log('📝 Updated Meta Description:', updatedSEO.metaDescription);
      
    } else {
      console.log('⚠️ No SEO data was updated');
    }

  } catch (error) {
    console.error('❌ Error updating SEO data:', error);
  }
}

updateSEOData();
