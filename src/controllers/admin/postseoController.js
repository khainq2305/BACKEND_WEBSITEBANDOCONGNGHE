const PostSEO = require('../../models/postSEO');
const Post = require('../../models/post');
const { Op, fn, col } = require('sequelize');
const { sequelize } = require('../../models');
const rankMathSEOEngine = require('../../services/rankMathSEOEngine');

class PostSEOController {
  // Helper function để đảm bảo update/create PostSEO an toàn
  async safeUpsertPostSEO(postId, dataToSave, transaction = null) {
    try {
      // Tìm PostSEO hiện tại
      let postSEO = await PostSEO.findOne({ 
        where: { postId },
        ...(transaction && { transaction, lock: true })
      });

      if (postSEO) {
        // Nếu đã có record, cập nhật
        await postSEO.update(dataToSave, { transaction });
        console.log(`✅ SEO updated for existing record ID: ${postSEO.id}, Post ID: ${postId}`);
        return { postSEO, created: false };
      } else {
        // Nếu chưa có record, tạo mới
        dataToSave.postId = postId;
        postSEO = await PostSEO.create(dataToSave, { transaction });
        console.log(`✅ SEO created new record ID: ${postSEO.id}, Post ID: ${postId}`);
        return { postSEO, created: true };
      }
    } catch (error) {
      // Nếu có lỗi duplicate key, thử lại bằng cách update
      if (error.name === 'SequelizeUniqueConstraintError' || error.code === 'ER_DUP_ENTRY') {
        console.log(`⚠️ Duplicate key detected for postId ${postId}, attempting update...`);
        const existingPostSEO = await PostSEO.findOne({ 
          where: { postId },
          ...(transaction && { transaction })
        });
        if (existingPostSEO) {
          await existingPostSEO.update(dataToSave, { transaction });
          return { postSEO: existingPostSEO, created: false };
        }
      }
      throw error;
    }
  }
  // Lấy danh sách posts với thông tin SEO
  async getPosts(req, res) {
    try {
      const { page = 1, limit = 10, search = '', status = '' } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { slug: { [Op.like]: `%${search}%` } }
        ];
      }
      if (status) {
        whereClause.status = status;
      }

      const posts = await Post.findAndCountAll({
        where: whereClause,
        include: [{
          model: PostSEO,
          as: 'seoData',
          required: false
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          posts: posts.rows,
          pagination: {
            current: parseInt(page),
            pageSize: parseInt(limit),
            total: posts.count,
            totalPages: Math.ceil(posts.count / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get posts error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách bài viết'
      });
    }
  }

  // Lấy thông tin SEO của một post
  async getPostSEO(req, res) {
    try {
      const { postId } = req.params;

      const post = await Post.findByPk(postId, {
        include: [{
          model: PostSEO,
          as: 'seoData',
          required: false
        }]
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy bài viết'
        });
      }

      res.json({
        success: true,
        data: {
          post,
          seoData: post.seoData || {}
        }
      });
    } catch (error) {
      console.error('Get post SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thông tin SEO'
      });
    }
  }

    // Cập nhật thông tin SEO của post
  async updatePostSEO(req, res) {
    try {
      const { id } = req.params;
      const seoData = req.body;

      console.log('=== UPDATE SEO DEBUG ===');
      console.log('PostSEO ID:', id);
      console.log('SEO Data:', seoData);

      // Tìm PostSEO record theo ID
      const postSEO = await PostSEO.findByPk(id);
      if (!postSEO) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thông tin SEO'
        });
      }

      // Cập nhật SEO data
      await postSEO.update(seoData);

      // Lấy lại data đã cập nhật với thông tin post
      const updatedPostSEO = await PostSEO.findByPk(id, {
        include: [{
          model: Post,
          as: 'post',
          required: false
        }]
      });

      res.json({
        success: true,
        message: 'Cập nhật SEO thành công',
        data: updatedPostSEO
      });
    } catch (error) {
      console.error('Update post SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật SEO',
        error: error.message
      });
    }
  }

  // Phân tích SEO cho post
  async analyzePostSEO(req, res) {
    const transaction = await sequelize.transaction();
    try {
      console.log('=== ANALYZE SEO DEBUG ===');
      console.log('req.params:', req.params);
      console.log('req.body:', req.body);
      
      const { postId } = req.params;
      const focusKeyword = req.body?.focusKeyword;
      
      console.log('postId:', postId);
      console.log('focusKeyword:', focusKeyword);

      const post = await Post.findByPk(postId, { transaction });
      if (!post) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy bài viết'
        });
      }

      // Lấy PostSEO hiện tại để giữ nguyên các giá trị đã có
      let postSEO = await PostSEO.findOne({ 
        where: { postId },
        transaction,
        lock: true // Lock để tránh race condition
      });
      
      // Sử dụng focusKeyword từ request body hoặc giữ nguyên focusKeyword hiện tại
      let analysisKeyword = focusKeyword;
      if (!analysisKeyword && postSEO) {
        analysisKeyword = postSEO.focusKeyword || '';
      }

      // Thực hiện phân tích SEO với từ khóa phù hợp
      const analysis = await postSEOController.performSEOAnalysis(post, analysisKeyword);

      // Chuẩn bị dữ liệu cập nhật/tạo mới
      const dataToSave = {
        title: post.title,
        metaDescription: postSEO?.metaDescription || '',
        focusKeyword: (focusKeyword && focusKeyword.trim() !== '') ? focusKeyword.trim() : (postSEO?.focusKeyword || ''),
        analysis: analysis.details,
        seoScore: analysis.seoScore,
        readabilityScore: analysis.readabilityScore,
        lastAnalyzed: new Date()
      };

      // Sử dụng helper function để update/create an toàn
      const { postSEO: updatedPostSEO, created } = await postSEOController.safeUpsertPostSEO(postId, dataToSave, transaction);

      await transaction.commit();

      console.log(`✅ SEO ${created ? 'created' : 'updated'} for post ${postId}`);

      res.json({
        success: true,
        message: 'Phân tích SEO hoàn thành',
        data: {
          analysis,
          postSEO: updatedPostSEO
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Analyze post SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi phân tích SEO',
        error: error.message
      });
    }
  }

  // Thực hiện phân tích SEO đồng bộ với frontend
  async performSEOAnalysis(post, focusKeyword = '') {
    const content = post.content || '';
    const title = post.title || '';
    const slug = post.slug || '';
    const metaDescription = post.metaDescription || '';
    
    // Sử dụng RankMathSEOEngine đã đồng bộ với frontend
    const seoAnalysis = rankMathSEOEngine.analyzeSEO({
      title,
      content,
      metaDescription,
      url: slug,
      focusKeyword,
      images: [], // Trong tương lai có thể parse ảnh từ content
      siteBaseUrl: process.env.FRONTEND_URL || 'https://yourdomain.com'
    });

    // Lấy ra các thông số quan trọng
    const seoScore = seoAnalysis.score;
    const readabilityScore = seoAnalysis.categories.contentReadability?.score || 0;
    
    // Tổng hợp issues và recommendations
    const issues = [];
    const recommendations = [];
    
    Object.keys(seoAnalysis.errors).forEach(category => {
      seoAnalysis.errors[category].forEach(error => {
        issues.push(error.message.split('(')[0].trim());
        recommendations.push(error.message.split('(')[1]?.replace(')', '').trim() || error.message);
      });
    });

    // Phân tích keywords density
    const keywordsDensity = {
      density: parseFloat(seoAnalysis.stats.keywordDensity) || 0,
      count: seoAnalysis.stats.keywordCount || 0
    };

    return {
      seoScore,
      readabilityScore,
      keywordsDensity,
      details: {
        seoAnalysis, // Trả về toàn bộ phân tích SEO để frontend có thể sử dụng
        issues,
        recommendations
      }
    };
  }

  // Lấy thống kê SEO
  async getSEOStats(req, res) {
    try {
      const totalPosts = await Post.count();
      const postsWithSEO = await PostSEO.count();
      const avgSEOScore = await PostSEO.findOne({
        attributes: [[fn('AVG', col('seoScore')), 'avgScore']]
      });
      const avgReadabilityScore = await PostSEO.findOne({
        attributes: [[fn('AVG', col('readabilityScore')), 'avgReadability']]
      });

      const topIssues = await PostSEO.findAll({
        attributes: ['analysis'],
        where: {
          analysis: { [Op.ne]: null }
        }
      });

      // Tổng hợp các vấn đề phổ biến
      const issueCount = {};
      topIssues.forEach(post => {
        if (post.analysis && post.analysis.issues) {
          post.analysis.issues.forEach(issue => {
            issueCount[issue] = (issueCount[issue] || 0) + 1;
          });
        }
      });

      const sortedIssues = Object.entries(issueCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([issue, count]) => ({ issue, count }));

      res.json({
        success: true,
        data: {
          totalPosts,
          postsWithSEO,
          seoOptimizationRate: totalPosts > 0 ? ((postsWithSEO / totalPosts) * 100).toFixed(1) : 0,
          avgSEOScore: Math.round(avgSEOScore?.dataValues?.avgScore || 0),
          avgReadabilityScore: Math.round(avgReadabilityScore?.dataValues?.avgReadability || 0),
          topIssues: sortedIssues
        }
      });
    } catch (error) {
      console.error('Get SEO stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê SEO'
      });
    }
  }

  // Xóa SEO data của post
  async deletePostSEO(req, res) {
    try {
      const { postId } = req.params;

      const deleted = await PostSEO.destroy({
        where: { postId }
      });

      if (deleted) {
        res.json({
          success: true,
          message: 'Xóa SEO data thành công'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy SEO data'
        });
      }
    } catch (error) {
      console.error('Delete post SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xóa SEO data'
      });
    }
  }

  // Lấy tất cả PostSEO
  async getAllPostSEO(req, res) {
    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { metaDescription: { [Op.like]: `%${search}%` } },
          { focusKeyword: { [Op.like]: `%${search}%` } }
        ];
      }

      const postSEOs = await PostSEO.findAndCountAll({
        where: whereClause,
        include: [{
          model: Post,
          as: 'post',
          required: true
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          postSEOs: postSEOs.rows,
          pagination: {
            total: postSEOs.count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(postSEOs.count / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get all post SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách SEO'
      });
    }
  }

  // Lấy danh sách posts không có SEO data
  async getPostsWithoutSEO(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const posts = await Post.findAndCountAll({
        include: [{
          model: PostSEO,
          as: 'seoData',
          required: false
        }],
        where: {
          '$seoData.id$': null
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          posts: posts.rows,
          pagination: {
            total: posts.count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(posts.count / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get posts without SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách bài viết chưa có SEO'
      });
    }
  }

  // Lấy PostSEO theo Post ID
  async getPostSEOByPostId(req, res) {
    try {
      const { postId } = req.params;

      const postSEO = await PostSEO.findOne({
        where: { postId },
        include: [{
          model: Post,
          as: 'post',
          required: true
        }]
      });

      if (!postSEO) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thông tin SEO cho bài viết này'
        });
      }

      res.json({
        success: true,
        data: postSEO
      });
    } catch (error) {
      console.error('Get post SEO by post ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thông tin SEO'
      });
    }
  }

  // Lấy PostSEO theo ID
  async getPostSEOById(req, res) {
    try {
      const { id } = req.params;

      const postSEO = await PostSEO.findByPk(id, {
        include: [{
          model: Post,
          as: 'post',
          required: true
        }]
      });

      if (!postSEO) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thông tin SEO'
        });
      }

      res.json({
        success: true,
        data: postSEO
      });
    } catch (error) {
      console.error('Get post SEO by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thông tin SEO'
      });
    }
  }

  // Tạo mới PostSEO
  async createPostSEO(req, res) {
    try {
      const { 
        postId, 
        title, 
        metaDescription, 
        focusKeyword, 
        seoScore, 
        readabilityScore 
      } = req.body;

      // Kiểm tra post có tồn tại
      const post = await Post.findByPk(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy bài viết'
        });
      }

      // Kiểm tra đã có SEO data cho post này chưa
      const existingPostSEO = await PostSEO.findOne({ where: { postId } });
      if (existingPostSEO) {
        return res.status(400).json({
          success: false,
          message: 'Bài viết này đã có thông tin SEO'
        });
      }

      const postSEO = await PostSEO.create({
        postId,
        title: title || post.title,
        metaDescription,
        focusKeyword,
        seoScore: seoScore || 0,
        readabilityScore: readabilityScore || 0,
        lastAnalyzed: new Date()
      });

      res.status(201).json({
        success: true,
        message: 'Tạo thông tin SEO thành công',
        data: postSEO
      });
    } catch (error) {
      console.error('Create post SEO error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo thông tin SEO'
      });
    }
  }

  // Phân tích SEO hàng loạt
  async bulkAnalyzePosts(req, res) {
    try {
      const { postIds, focusKeyword } = req.body;

      if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Danh sách ID bài viết không hợp lệ'
        });
      }

      console.log('=== BULK ANALYZE SEO DEBUG ===');
      console.log('postIds:', postIds);
      console.log('focusKeyword:', focusKeyword);

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const postId of postIds) {
        try {
          const post = await Post.findByPk(postId);
          if (!post) {
            results.push({
              postId,
              success: false,
              message: 'Không tìm thấy bài viết'
            });
            errorCount++;
            continue;
          }

          // Lấy PostSEO hiện tại để giữ nguyên các giá trị đã có
          let postSEO = await PostSEO.findOne({ where: { postId } });
          
          // Sử dụng focusKeyword từ request body hoặc giữ nguyên focusKeyword hiện tại
          let analysisKeyword = focusKeyword;
          if (!analysisKeyword && postSEO) {
            analysisKeyword = postSEO.focusKeyword || '';
          }

          // Thực hiện phân tích SEO với từ khóa phù hợp
          const analysis = await postSEOController.performSEOAnalysis(post, analysisKeyword);

          // Chuẩn bị dữ liệu cập nhật/tạo mới
          const dataToSave = {
            title: post.title,
            metaDescription: postSEO?.metaDescription || '',
            focusKeyword: (focusKeyword && focusKeyword.trim() !== '') ? focusKeyword.trim() : (postSEO?.focusKeyword || ''),
            analysis: analysis.details,
            seoScore: analysis.seoScore,
            readabilityScore: analysis.readabilityScore,
            lastAnalyzed: new Date()
          };

          // Sử dụng helper function để update/create an toàn
          const { postSEO: updatedPostSEO, created } = await postSEOController.safeUpsertPostSEO(postId, dataToSave);

          console.log(`✅ SEO ${created ? 'created' : 'updated'} for post ${postId}`);

          results.push({
            postId,
            success: true,
            data: {
              analysis,
              postSEO: updatedPostSEO
            }
          });
          successCount++;
        } catch (error) {
          console.error(`Error analyzing post ${postId}:`, error);
          results.push({
            postId,
            success: false,
            message: error.message
          });
          errorCount++;
        }
      }

      res.json({
        success: true,
        message: `Phân tích hoàn thành: ${successCount} thành công, ${errorCount} lỗi`,
        data: {
          results,
          summary: {
            total: postIds.length,
            success: successCount,
            error: errorCount
          }
        }
      });
    } catch (error) {
      console.error('Bulk analyze posts error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi phân tích SEO hàng loạt',
        error: error.message
      });
    }
  }

  // Tạo PostSEO cho tất cả bài viết chưa có SEO data
  async createSEOForAllPosts(req, res) {
    try {
      console.log('=== CREATING SEO FOR ALL POSTS ===');
      
      // Lấy tất cả posts chưa có PostSEO
      const postsWithoutSEO = await Post.findAll({
        include: [{
          model: PostSEO,
          as: 'seoData',
          required: false
        }],
        where: {
          '$seoData.id$': null
        }
      });

      console.log(`Found ${postsWithoutSEO.length} posts without SEO data`);

      const results = [];

      for (const post of postsWithoutSEO) {
        try {
          // Tạo meta description từ content
          const cleanContent = post.content ? post.content.replace(/<[^>]*>/g, '') : '';
          const metaDescription = cleanContent.substring(0, 160).trim();

          // Sử dụng upsert để tránh duplicate nếu có race condition
          const [postSEO, created] = await PostSEO.upsert({
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
          }, {
            returning: true
          });

          console.log(`✅ ${created ? 'Created' : 'Updated'} SEO for post: ${post.id} - "${post.title}"`);

          results.push({
            postId: post.id,
            postTitle: post.title,
            postSlug: post.slug,
            success: true,
            seoId: postSEO.id
          });
        } catch (error) {
          console.error(`❌ Error creating SEO for post ${post.id}:`, error);
          results.push({
            postId: post.id,
            postTitle: post.title,
            postSlug: post.slug,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      res.json({
        success: true,
        message: `Đã tạo SEO cho ${successCount}/${results.length} bài viết (${failCount} lỗi)`,
        data: {
          total: results.length,
          success: successCount,
          failed: failCount,
          results: results
        }
      });
    } catch (error) {
      console.error('Create SEO for all posts error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo SEO cho tất cả bài viết',
        error: error.message
      });
    }
  }

  // Cập nhật schema cho post
  async updatePostSchema(req, res) {
    try {
      const { postId } = req.params;
      const { schema } = req.body;

      console.log('=== UPDATE SCHEMA DEBUG ===');
      console.log('Post ID:', postId);
      console.log('Schema Data:', JSON.stringify(schema, null, 2));
      console.log('Request body:', req.body);
      console.log('Request headers:', req.headers);

      // Tìm hoặc tạo PostSEO record
      let postSEO = await PostSEO.findOne({ where: { postId } });
      console.log('Found existing PostSEO:', postSEO ? `ID: ${postSEO.id}` : 'null');
      
      if (!postSEO) {
        // Nếu chưa có PostSEO, tạo mới
        const post = await Post.findByPk(postId);
        console.log('Found post:', post ? `ID: ${post.id}, Title: ${post.title}` : 'null');
        
        if (!post) {
          console.log('❌ Post not found');
          return res.status(404).json({
            success: false,
            message: 'Không tìm thấy bài viết'
          });
        }

        console.log('Creating new PostSEO record...');
        postSEO = await PostSEO.create({
          postId,
          title: post.title || '',
          metaDescription: '',
          focusKeyword: '',
          schema: schema || null,
          seoScore: 0,
          readabilityScore: 0
        });
        console.log('✅ Created new PostSEO:', postSEO.id);
      } else {
        // Cập nhật schema cho record hiện tại
        console.log('Updating existing PostSEO schema...');
        console.log('Before update - schema:', postSEO.schema);
        
        const [affectedRows] = await PostSEO.update(
          { schema: schema || null },
          { where: { postId: postId } }
        );
        
        console.log('Update affected rows:', affectedRows);
        
        // Reload để lấy data mới
        await postSEO.reload();
        console.log('After update - schema:', postSEO.schema);
      }

      // Lấy lại data đã cập nhật
      const updatedPostSEO = await PostSEO.findOne({
        where: { postId },
        include: [{
          model: Post,
          as: 'post',
          required: false
        }]
      });

      console.log('Final PostSEO data:', {
        id: updatedPostSEO.id,
        postId: updatedPostSEO.postId,
        hasSchema: !!updatedPostSEO.schema,
        schemaType: updatedPostSEO.schema?.['@type'] || 'null'
      });

      res.json({
        success: true,
        message: 'Cập nhật schema thành công',
        data: {
          postSEO: updatedPostSEO,
          schema: updatedPostSEO.schema
        }
      });
    } catch (error) {
      console.error('❌ Update schema error:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật schema',
        error: error.message
      });
    }
  }

  // Lấy schema của post
  async getPostSchema(req, res) {
    try {
      const { postId } = req.params;

      const postSEO = await PostSEO.findOne({
        where: { postId },
        include: [{
          model: Post,
          as: 'post',
          required: false
        }]
      });

      if (!postSEO) {
        return res.json({
          success: true,
          data: {
            schema: null,
            message: 'Chưa có schema cho bài viết này'
          }
        });
      }

      res.json({
        success: true,
        data: {
          schema: postSEO.schema,
          postTitle: postSEO.post?.title,
          lastUpdated: postSEO.updatedAt
        }
      });
    } catch (error) {
      console.error('Get schema error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy schema',
        error: error.message
      });
    }
  }
}

const postSEOController = new PostSEOController();
module.exports = postSEOController;
