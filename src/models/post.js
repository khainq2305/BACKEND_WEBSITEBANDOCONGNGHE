const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  authorId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  publishAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isFeature: {
    type: DataTypes.BOOLEAN, // ✅ Sửa lại ở đây
    allowNull: false,
    defaultValue: false
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  thumbnail: DataTypes.STRING
}, {
  tableName: 'posts',
  timestamps: true,
  paranoid: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  hooks: {
    afterCreate: async (post, options) => {
      try {
        // Import PostSEO model dynamically để tránh circular dependency
        const PostSEO = require('./postSEO');
        
        // Tạo meta description từ content hoặc excerpt
        const cleanContent = post.content ? post.content.replace(/<[^>]*>/g, '') : '';
        const metaDescription = cleanContent.substring(0, 160).trim();
        
        // Tự động tạo PostSEO record
        await PostSEO.create({
          postId: post.id,
          title: post.title || '',
          metaDescription: metaDescription || '',
          focusKeyword: '',
          canonicalUrl: `/tin-tuc/${post.slug}`,
          robots: {
            index: true,
            follow: true,
            noarchive: false,
            nosnippet: false,
            noimageindex: false
          },
          socialMeta: {
            facebook: {
              title: post.title || '',
              description: metaDescription || '',
              image: post.thumbnail || '',
              type: 'article'
            },
            twitter: {
              title: post.title || '',
              description: metaDescription || '',
              image: post.thumbnail || '',
              card: 'summary_large_image'
            }
          },
          structuredData: {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.title || '',
            description: metaDescription || '',
            image: post.thumbnail || '',
            datePublished: post.createdAt,
            dateModified: post.updatedAt,
            author: {
              '@type': 'Person',
              name: 'Admin'
            }
          },
          seoScore: 0,
          readabilityScore: 0,
          lastAnalyzed: new Date()
        });
        
        console.log(`✅ Auto-created PostSEO for post ID: ${post.id} - "${post.title}"`);
      } catch (error) {
        console.error('❌ Error auto-creating PostSEO:', error);
      }
    },
    
    afterUpdate: async (post, options) => {
      try {
        // Chỉ cập nhật nếu có thay đổi trong các field quan trọng
        if (post.changed('title') || post.changed('content') || post.changed('slug') || post.changed('thumbnail')) {
          const PostSEO = require('./postSEO');
          
          // Tìm PostSEO record tương ứng
          const postSEO = await PostSEO.findOne({ where: { postId: post.id } });
          
          if (postSEO) {
            const updateData = {};
            
            // Cập nhật title nếu thay đổi và chưa được custom
            if (post.changed('title') && (!postSEO.title || postSEO.title === post._previousDataValues?.title)) {
              updateData.title = post.title || '';
              
              // Cập nhật social meta title
              updateData.socialMeta = {
                ...postSEO.socialMeta,
                facebook: {
                  ...postSEO.socialMeta?.facebook,
                  title: post.title || ''
                },
                twitter: {
                  ...postSEO.socialMeta?.twitter,
                  title: post.title || ''
                }
              };
              
              // Cập nhật structured data
              updateData.structuredData = {
                ...postSEO.structuredData,
                headline: post.title || ''
              };
            }
            
            // Cập nhật meta description nếu content thay đổi và chưa được custom
            if (post.changed('content')) {
              const cleanContent = post.content ? post.content.replace(/<[^>]*>/g, '') : '';
              const newMetaDescription = cleanContent.substring(0, 160).trim();
              
              // Chỉ cập nhật nếu meta description chưa được custom hoặc rỗng
              if (!postSEO.metaDescription || postSEO.metaDescription.length < 50) {
                updateData.metaDescription = newMetaDescription;
                
                updateData.socialMeta = {
                  ...updateData.socialMeta || postSEO.socialMeta,
                  facebook: {
                    ...updateData.socialMeta?.facebook || postSEO.socialMeta?.facebook,
                    description: newMetaDescription
                  },
                  twitter: {
                    ...updateData.socialMeta?.twitter || postSEO.socialMeta?.twitter,
                    description: newMetaDescription
                  }
                };
                
                updateData.structuredData = {
                  ...updateData.structuredData || postSEO.structuredData,
                  description: newMetaDescription
                };
              }
            }
            
            // Cập nhật canonical URL nếu slug thay đổi
            if (post.changed('slug')) {
              updateData.canonicalUrl = `/tin-tuc/${post.slug}`;
            }
            
            // Cập nhật thumbnail trong social meta nếu thay đổi
            if (post.changed('thumbnail')) {
              updateData.socialMeta = {
                ...updateData.socialMeta || postSEO.socialMeta,
                facebook: {
                  ...updateData.socialMeta?.facebook || postSEO.socialMeta?.facebook,
                  image: post.thumbnail || ''
                },
                twitter: {
                  ...updateData.socialMeta?.twitter || postSEO.socialMeta?.twitter,
                  image: post.thumbnail || ''
                }
              };
              
              updateData.structuredData = {
                ...updateData.structuredData || postSEO.structuredData,
                image: post.thumbnail || ''
              };
            }
            
            // Cập nhật thời gian modified
            if (Object.keys(updateData).length > 0) {
              updateData.structuredData = {
                ...updateData.structuredData || postSEO.structuredData,
                dateModified: new Date()
              };
              
              await postSEO.update(updateData);
              console.log(`✅ Auto-updated PostSEO for post ID: ${post.id} - "${post.title}"`);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error auto-updating PostSEO:', error);
      }
    }
  }
});

module.exports = Post;
