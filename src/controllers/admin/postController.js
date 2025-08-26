const { Op } = require("sequelize");
const slugify = require("slugify");
const { Post, Category, User, Tags, PostTag, categoryPostModel, PostSEO } = require('../../models/index');
const postSEOController = require('./postseoController'); // Import SEO controller

class PostController {
  // [CREATE] Thêm bài viết
  static async create(req, res) {
    try {
      const {
        title,
        content,
        categoryId,
        authorId,
        orderIndex = 0,
        publishAt,
        slug,
        isFeature,
        focusKeyword,
        schema,
      } = req.body;
  
      const file = req.file;
      const tags = JSON.parse(req.body.tags || "[]");
  
      let finalPublishAt = null;
let finalStatus = 1; // mặc định đăng ngay

// Nếu publishAt là 'null' hoặc undefined thì bỏ qua
if (publishAt && publishAt !== 'null') {
  const pubDate = new Date(publishAt);
  if (!isNaN(pubDate)) { // kiểm tra date hợp lệ
    finalPublishAt = pubDate;
    finalStatus = pubDate > new Date() ? 2 : 1; // quá khứ → đăng ngay, tương lai → scheduled
  }
}
  
      const newPost = await Post.create({
        title,
        content,
        categoryId: categoryId, // 🔄 Sử dụng categoryId thay vì category
        authorId,
        orderIndex,
        slug,
        isFeature,
        thumbnail: file ? file.path : null,
        publishAt: finalPublishAt,
        status: finalStatus,
      });
  
      // Xử lý tags
      const tagInstances = [];
      for (const tagItem of tags) {
        const tagName = typeof tagItem === "string" ? tagItem : tagItem?.name;
        const tagSlug =
          typeof tagItem === "string"
            ? tagItem.toLowerCase().trim().replace(/\s+/g, "-")
            : tagItem?.slug || tagName?.toLowerCase().trim().replace(/\s+/g, "-");
  
        if (!tagName || !tagSlug) continue;
  
        let tag = await Tags.findOne({ where: { slug: tagSlug } });
        if (!tag) tag = await Tags.create({ name: tagName, slug: tagSlug });
  
        tagInstances.push(tag);
      }
  
      await newPost.addTags(tagInstances);

      // Tạo hoặc cập nhật PostSEO với focus keyword và schema
      if ((focusKeyword && focusKeyword.trim()) || (schema && typeof schema === 'object')) {
        const postSEOData = {
          postId: newPost.id,
          title: title, // SEO title mặc định là title của post
          updatedAt: new Date()
        };

        // Thêm focus keyword nếu có
        if (focusKeyword && focusKeyword.trim()) {
          postSEOData.focusKeyword = focusKeyword.trim();
        }

        // Thêm schema nếu có
        if (schema && typeof schema === 'object') {
          postSEOData.schema = schema;
        }

        await PostSEO.upsert(postSEOData);

        // Tự động phân tích SEO cho bài viết mới (chỉ khi có focus keyword)
        if (focusKeyword && focusKeyword.trim()) {
          try {
            console.log('🔍 Auto-analyzing SEO for new post...');
            
            const analysis = await postSEOController.performSEOAnalysis(newPost, focusKeyword.trim());
            
            // Cập nhật kết quả phân tích (giữ nguyên schema nếu có)
            const updateData = {
              postId: newPost.id,
              title: title,
              focusKeyword: focusKeyword.trim(),
              analysis: analysis.details,
              seoScore: analysis.seoScore,
              readabilityScore: analysis.readabilityScore,
              lastAnalyzed: new Date()
            };

            // Giữ nguyên schema nếu có
            if (schema && typeof schema === 'object') {
              updateData.schema = schema;
            }

            await PostSEO.upsert(updateData);
            
            console.log(`✅ Auto SEO analysis completed for new post ${newPost.id} (Score: ${analysis.seoScore})`);
          } catch (seoError) {
            console.error('⚠️ Auto SEO analysis failed:', seoError);
            // Không làm gián đoạn quá trình tạo bài viết
          }
        }
      }
  
      return res
        .status(201)
        .json({ message: "Tạo bài viết thành công", data: newPost });
    } catch (error) {
      console.error("CREATE POST ERROR:", error);
      return res.status(500).json({ message: "Lỗi server khi tạo bài viết" });
    }
  }
  
  static async getAll(req, res) {
    console.log('da goi getall')
    try {
      const { search = "", categoryId, status } = req.query;
      const { page, limit, offset } = req.pagination;

      const whereClause = {};

      if (search) {
        whereClause.title = { [Op.like]: `%${search}%` };
      }

      if (categoryId) {
        whereClause.categoryId = parseInt(categoryId, 10);
      }
      if (status === "trash") {
        whereClause.deletedAt = { [Op.not]: null };
      } else {
        whereClause.deletedAt = null;

        if (status === "published") {
          whereClause.status = 1;
        } else if (status === "draft") {
          whereClause.status = 0;
        }
      }
      const { count, rows } = await Post.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        include: [
          {
            model: categoryPostModel,
            as: "category",
            attributes: ["id", "name"],
          },
          {
            model: User,
            as: "author",
            attributes: ["id", "fullName"],
          },
          {
            model: Tags,
            as: "tags",
            attributes: ["id", "name", "slug"],
            through: { attributes: [] }, // ẩn dữ liệu bảng trung gian posttag
          },
          {
            model: PostSEO,
            as: "seoData",
            attributes: ["focusKeyword", "title", "metaDescription", "seoScore"],
            required: false
          }
        ],
        paranoid: false,
        order: [["createdAt", "DESC"]],
      });

      // 👇 Tính số lượng từng loại bài viết (toàn bộ, kể cả xóa mềm)
      const allPosts = await Post.findAll({ paranoid: false });

      const counts = {
        all: allPosts.filter((p) => !p.deletedAt).length,
        published: allPosts.filter((p) => p.status === 1 && !p.deletedAt)
          .length,
        draft: allPosts.filter((p) => p.status === 0 && !p.deletedAt).length,
        trash: allPosts.filter((p) => p.deletedAt).length,
      };

      return res.json({
        data: rows,
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        counts, // 👈 Trả thêm counts cho FE
      });
    } catch (error) {
      console.error("GET POSTS ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy danh sách bài viết" });
    }
  }

  // [READ] Lấy 1 bài viết theo slug
  static async getBySlug(req, res) {
    try {
      const { slug } = req.params;
      const post = await Post.findOne({
        where: { slug },
        include: [
          {
            model: categoryPostModel,
            as: "category",
            attributes: ["id", "name"],
          },
          {
            model: User,
            as: "author",
            attributes: ["id", "fullName"],
          },
          {
            model: Tags,
            as: "tags",
            attributes: ["id", "name", "slug"],
            through: { attributes: [] }, // ẩn dữ liệu bảng trung gian posttag
          },
          {
            model: PostSEO,
            as: "seoData",
            attributes: ["focusKeyword", "title", "metaDescription", "seoScore"],
            required: false
          }
        ],
      });

      if (!post)
        return res.status(404).json({ message: "Không tìm thấy bài viết" });

      return res.json({ data: post });
    } catch (error) {
      console.error("GET POST BY SLUG ERROR:", error);
      return res.status(500).json({ message: "Lỗi server khi lấy bài viết" });
    }
  }

  // [UPDATE] Cập nhật bài viết
  static async update(req, res) {
    try {
      const { slug } = req.params;
      const file = req.file;
  
      const post = await Post.findOne({ where: { slug } });
      if (!post) {
        return res.status(404).json({ message: "Không tìm thấy bài viết" });
      }
  
      const tags = JSON.parse(req.body.tags || "[]");
      const {
        title,
        content,
        categoryId,
        authorId,
        orderIndex,
        publishAt,
        isFeature,
        thumbnail, // có thể truyền lại thumbnail cũ từ body
        focusKeyword,
        schema,
      } = req.body;
  
      // Xử lý publishAt và status
      let finalPublishAt = null;
let finalStatus = 1; // mặc định đăng ngay

// Nếu publishAt là 'null' hoặc undefined thì bỏ qua
if (publishAt && publishAt !== 'null') {
  const pubDate = new Date(publishAt);
  if (!isNaN(pubDate)) { // kiểm tra date hợp lệ
    finalPublishAt = pubDate;
    finalStatus = pubDate > new Date() ? 2 : 1; // quá khứ → đăng ngay, tương lai → scheduled
  }
}

  
      await post.update({
        title,
        content,
        categoryId,
        authorId,
        status: finalStatus,
        orderIndex,
        publishAt: finalPublishAt,
        isFeature,
        thumbnail: file ? file.path : thumbnail || post.thumbnail,
      });
  
      // Xử lý tags
      const tagInstances = [];
      for (const tagItem of tags) {
        const tagName = typeof tagItem === "string" ? tagItem : tagItem?.name;
        const tagSlug =
          typeof tagItem === "string"
            ? tagItem.toLowerCase().trim().replace(/\s+/g, "-")
            : tagItem?.slug || tagName?.toLowerCase().trim().replace(/\s+/g, "-");
  
        if (!tagName || !tagSlug) continue;
  
        let tag = await Tags.findOne({ where: { slug: tagSlug } });
        if (!tag) tag = await Tags.create({ name: tagName, slug: tagSlug });
  
        tagInstances.push(tag);
      }
  
      await post.setTags(tagInstances);

      // Cập nhật hoặc tạo PostSEO với focus keyword và schema
      let shouldAutoAnalyze = false;
      let updatedFocusKeyword = null;
      
      if (focusKeyword !== undefined || schema !== undefined) {
        const postSEOData = {
          postId: post.id,
          title: title, // SEO title mặc định là title của post
          updatedAt: new Date()
        };

        // Xử lý focus keyword
        if (focusKeyword !== undefined) {
          if (focusKeyword && focusKeyword.trim()) {
            postSEOData.focusKeyword = focusKeyword.trim();
            updatedFocusKeyword = focusKeyword.trim();
            shouldAutoAnalyze = true;
          } else {
            postSEOData.focusKeyword = null;
          }
        }

        // Xử lý schema
        if (schema !== undefined) {
          if (schema && typeof schema === 'object') {
            postSEOData.schema = schema;
          } else if (schema === null || schema === '') {
            postSEOData.schema = null;
          }
        }

        await PostSEO.upsert(postSEOData);
      }

      // Tự động phân tích SEO sau khi cập nhật nếu có thay đổi nội dung quan trọng
      const contentChanged = post.title !== title || post.content !== content;
      if (shouldAutoAnalyze || contentChanged) {
        try {
          console.log('🔍 Auto-analyzing SEO after post update...');
          
          // Lấy PostSEO hiện tại để lấy focus keyword
          const currentSEO = await PostSEO.findOne({ where: { postId: post.id } });
          const focusKeywordForAnalysis = updatedFocusKeyword || currentSEO?.focusKeyword || '';
          
          // Thực hiện phân tích SEO
          const analysis = await postSEOController.performSEOAnalysis(post, focusKeywordForAnalysis);
          
          // Cập nhật kết quả phân tích (giữ nguyên schema nếu có)
          const updateData = {
            postId: post.id,
            title: title,
            focusKeyword: focusKeywordForAnalysis,
            analysis: analysis.details,
            seoScore: analysis.seoScore,
            readabilityScore: analysis.readabilityScore,
            lastAnalyzed: new Date()
          };

          // Giữ nguyên schema hiện tại nếu không có schema mới
          if (schema === undefined && currentSEO?.schema) {
            updateData.schema = currentSEO.schema;
          } else if (schema !== undefined) {
            updateData.schema = schema;
          }

          await PostSEO.upsert(updateData);
          
          console.log(`✅ Auto SEO analysis completed for post ${post.id} (Score: ${analysis.seoScore})`);
        } catch (seoError) {
          console.error('⚠️ Auto SEO analysis failed:', seoError);
          // Không làm gián đoạn quá trình cập nhật bài viết
        }
      }

  
      return res.json({ message: "Cập nhật thành công", data: post });
    } catch (error) {
      console.error("UPDATE POST ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật bài viết" });
    }
  }
  
  
  
  

  // [SOFT DELETE] Xoá mềm bài viết theo slug
  static async softDelete(req, res) {
    try {
      console.log("=== Đã vào BE softDelete ===");
      console.log("Body:", req.body);

      const { slugs } = req.body;

      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "Danh sách slug không hợp lệ" });
      }

      const posts = await Post.findAll({ where: { slug: slugs } });
      const existingSlugs = posts.map((p) => p.slug);
      const notFound = slugs.filter((slug) => !existingSlugs.includes(slug));

      await Post.destroy({
        where: { slug: existingSlugs },
      });

      return res.json({
        message: `Đã đưa ${existingSlugs.length} bài viết vào thùng rác`,
        trashed: existingSlugs,
        notFound,
      });
    } catch (error) {
      console.error("SOFT DELETE ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi xóa mềm bài viết" });
    }
  }

  // [RESTORE] Khôi phục bài viết theo id
  static async restore(req, res) {
    try {
      const { slugs } = req.body;
      console.log(req.body);
      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res
          .status(400)
          .json({ message: "Vui lòng truyền danh sách slug hợp lệ" });
      }

      // Lấy tất cả bài viết, bao gồm cả đã bị xóa mềm
      const posts = await Post.findAll({
        where: { slug: slugs },
        paranoid: false,
      });

      const existingSlugs = posts.map((p) => p.slug);
      const notFound = slugs.filter((slug) => !existingSlugs.includes(slug));

      const toRestore = posts
        .filter((p) => p.deletedAt !== null)
        .map((p) => p.slug);
      const notTrashed = posts
        .filter((p) => p.deletedAt === null)
        .map((p) => p.slug);

      await Post.restore({
        where: { slug: toRestore },
      });

      return res.json({
        message: `Đã khôi phục ${toRestore.length} bài viết`,
        restored: toRestore,
        notTrashed,
        notFound,
      });
    } catch (err) {
      console.error("Lỗi khi khôi phục:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // [FORCE DELETE] Xoá vĩnh viễn bài viết theo slug
  static async forceDelete(req, res) {
    try {
      console.log("===> BODY:", req.body);
      const { slugs } = req.body;

      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "Danh sách slug không hợp lệ" });
      }

      const deletedCount = await Post.destroy({
        where: { slug: slugs },
        force: true,
      });

      return res.json({
        message: `Đã xóa vĩnh viễn ${deletedCount} bài viết`,
        deleted: slugs,
      });
    } catch (error) {
      console.error("FORCE DELETE ERROR:", error);
      return res.status(500).json({ message: "Lỗi server khi xóa vĩnh viễn" });
    }
  }

  // [UPDATE] Cập nhật slug của bài viết
  static async updateSlug(req, res) {
    try {
      const { id } = req.params;
      const { slug } = req.body;

      if (!slug || !slug.trim()) {
        return res.status(400).json({
          success: false,
          message: "Slug không được để trống"
        });
      }

      // Validate slug format
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(slug)) {
        return res.status(400).json({
          success: false,
          message: "Slug chỉ được chứa chữ thường, số và dấu gạch ngang"
        });
      }

      // Kiểm tra bài viết có tồn tại không
      const post = await Post.findByPk(id);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài viết"
        });
      }

      // Kiểm tra slug có bị trùng không
      const existingPost = await Post.findOne({
        where: {
          slug,
          id: { [Op.ne]: id } // Loại trừ bài viết hiện tại
        }
      });

      if (existingPost) {
        return res.status(400).json({
          success: false,
          message: "Slug này đã được sử dụng bởi bài viết khác"
        });
      }

      // Cập nhật slug
      await post.update({ slug });

      return res.json({
        success: true,
        message: "Cập nhật slug thành công",
        data: {
          id: post.id,
          slug: post.slug,
          title: post.title
        }
      });

    } catch (error) {
      console.error("UPDATE SLUG ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi cập nhật slug"
      });
    }
  }

  // [UTILITY] Tự động phân tích SEO cho bài viết
  static async autoAnalyzeSEO(postId, focusKeyword = null) {
    try {
      console.log(`🔍 Starting auto SEO analysis for post ${postId}...`);
      
      // Lấy thông tin bài viết
      const post = await Post.findByPk(postId);
      if (!post) {
        throw new Error(`Post ${postId} not found`);
      }

      // Lấy PostSEO hiện tại hoặc focus keyword từ parameter
      const currentSEO = await PostSEO.findOne({ where: { postId } });
      const analysisKeyword = focusKeyword || currentSEO?.focusKeyword || '';

      // Thực hiện phân tích SEO
      const analysis = await postSEOController.performSEOAnalysis(post, analysisKeyword);

      // Chuẩn bị dữ liệu để upsert
      const dataToSave = {
        postId,
        title: post.title,
        focusKeyword: analysisKeyword,
        analysis: analysis.details,
        seoScore: analysis.seoScore,
        readabilityScore: analysis.readabilityScore,
        lastAnalyzed: new Date()
      };

      // Nếu có focus keyword mới, cập nhật
      if (focusKeyword) {
        dataToSave.focusKeyword = focusKeyword;
      }

      // Upsert PostSEO
      const [postSEO, created] = await PostSEO.upsert(dataToSave, {
        returning: true
      });

      console.log(`✅ Auto SEO analysis ${created ? 'created' : 'updated'} for post ${postId} (Score: ${analysis.seoScore})`);

      return {
        success: true,
        analysis,
        postSEO,
        created
      };
    } catch (error) {
      console.error(`❌ Auto SEO analysis failed for post ${postId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // [UTILITY] Tự động phân tích SEO cho nhiều bài viết
  static async batchAutoAnalyzeSEO(postIds, focusKeyword = null) {
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    console.log(`🔍 Starting batch auto SEO analysis for ${postIds.length} posts...`);

    for (const postId of postIds) {
      try {
        const result = await PostController.autoAnalyzeSEO(postId, focusKeyword);
        results.push({
          postId,
          ...result
        });
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }

        // Thêm delay nhỏ để tránh quá tải
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        results.push({
          postId,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`✅ Batch auto SEO analysis completed: ${successCount} success, ${errorCount} errors`);

    return {
      total: postIds.length,
      successCount,
      errorCount,
      results
    };
  }

  // [API] Tự động phân tích SEO cho bài viết
  static async autoAnalyzeSEOEndpoint(req, res) {
    try {
      const { postId } = req.params;
      const { focusKeyword } = req.body;

      console.log('=== AUTO ANALYZE SEO ENDPOINT ===');
      console.log('postId:', postId);
      console.log('focusKeyword:', focusKeyword);

      const result = await PostController.autoAnalyzeSEO(postId, focusKeyword);

      if (result.success) {
        res.json({
          success: true,
          message: 'Tự động phân tích SEO thành công',
          data: {
            analysis: result.analysis,
            postSEO: result.postSEO,
            created: result.created
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi khi tự động phân tích SEO',
          error: result.error
        });
      }
    } catch (error) {
      console.error('Auto analyze SEO endpoint error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
        error: error.message
      });
    }
  }

  // [API] Tự động phân tích SEO cho nhiều bài viết
  static async batchAutoAnalyzeSEOEndpoint(req, res) {
    try {
      const { postIds, focusKeyword } = req.body;

      if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Danh sách ID bài viết không hợp lệ'
        });
      }

      console.log('=== BATCH AUTO ANALYZE SEO ENDPOINT ===');
      console.log('postIds:', postIds);
      console.log('focusKeyword:', focusKeyword);

      const result = await PostController.batchAutoAnalyzeSEO(postIds, focusKeyword);

      res.json({
        success: true,
        message: `Tự động phân tích SEO hoàn thành: ${result.successCount} thành công, ${result.errorCount} lỗi`,
        data: result
      });
    } catch (error) {
      console.error('Batch auto analyze SEO endpoint error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
        error: error.message
      });
    }
  }
}

module.exports = PostController;
