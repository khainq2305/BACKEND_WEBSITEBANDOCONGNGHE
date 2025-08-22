const PostSEO = require('../../models/postSEO');
const Post = require('../../models/post');
const { Op, fn, col } = require('sequelize');
const { sequelize } = require('../../models');

class PostSEOController {
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
        postId,
        title: post.title,
        metaDescription: '',
        focusKeyword: (focusKeyword && focusKeyword.trim() !== '') ? focusKeyword.trim() : (postSEO?.focusKeyword || ''),
        analysis: analysis.details,
        seoScore: analysis.seoScore,
        readabilityScore: analysis.readabilityScore,
        lastAnalyzed: new Date()
      };

      // Sử dụng upsert để tránh duplicate
      const [upsertedPostSEO, created] = await PostSEO.upsert(dataToSave, {
        transaction,
        returning: true
      });

      // Lấy record đã được upsert
      postSEO = upsertedPostSEO || await PostSEO.findOne({ 
        where: { postId }, 
        transaction 
      });

      await transaction.commit();

      console.log(`✅ SEO ${created ? 'created' : 'updated'} for post ${postId}`);

      res.json({
        success: true,
        message: 'Phân tích SEO hoàn thành',
        data: {
          analysis,
          postSEO
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

  // Thực hiện phân tích SEO
  async performSEOAnalysis(post, focusKeyword = '') {
    const content = post.content || '';
    const title = post.title || '';
    const slug = post.slug || '';
    
    let seoScore = 0;
    let readabilityScore = 0;
    const issues = [];
    const recommendations = [];

    // Phân tích title
    const titleAnalysis = postSEOController.analyzeTitleSEO(title, focusKeyword);
    seoScore += titleAnalysis.score;
    issues.push(...titleAnalysis.issues);
    recommendations.push(...titleAnalysis.recommendations);

    // Phân tích content
    const contentAnalysis = postSEOController.analyzeContentSEO(content, focusKeyword);
    seoScore += contentAnalysis.score;
    readabilityScore = contentAnalysis.readabilityScore;
    issues.push(...contentAnalysis.issues);
    recommendations.push(...contentAnalysis.recommendations);

    // Phân tích keywords density
    const keywordsDensity = postSEOController.analyzeKeywordsDensity(content, focusKeyword);

    // Phân tích URL/slug
    const urlAnalysis = postSEOController.analyzeUrlSEO(slug, focusKeyword);
    seoScore += urlAnalysis.score;
    issues.push(...urlAnalysis.issues);
    recommendations.push(...urlAnalysis.recommendations);

    // Tính điểm trung bình
    seoScore = Math.round(seoScore / 3);

    return {
      seoScore,
      readabilityScore,
      keywordsDensity, // Thêm keywords density vào kết quả
      details: {
        title: titleAnalysis,
        content: contentAnalysis,
        url: urlAnalysis,
        keywordsDensity,
        issues,
        recommendations
      }
    };
  }

  // Phân tích SEO title
  analyzeTitleSEO(title, focusKeyword) {
    let score = 0;
    const issues = [];
    const recommendations = [];

    if (!title) {
      issues.push('Thiếu tiêu đề');
      recommendations.push('Thêm tiêu đề cho bài viết');
      return { score: 0, issues, recommendations };
    }

    // Kiểm tra độ dài title
    if (title.length < 30) {
      issues.push('Tiêu đề quá ngắn');
      recommendations.push('Title nên có 30-60 ký tự');
    } else if (title.length > 60) {
      issues.push('Tiêu đề quá dài');
      recommendations.push('Title nên có 30-60 ký tự');
    } else {
      score += 30;
    }

    // Kiểm tra focus keyword trong title
    if (focusKeyword && title.toLowerCase().includes(focusKeyword.toLowerCase())) {
      score += 40;
    } else if (focusKeyword) {
      issues.push('Thiếu focus keyword trong title');
      recommendations.push(`Thêm từ khóa "${focusKeyword}" vào title`);
    }

    // Kiểm tra title có số hay không (thường tốt cho SEO)
    if (/\d/.test(title)) {
      score += 10;
    }

    // Kiểm tra title có từ khóa cảm xúc 
    const emotionalWords = ['best', 'tốt nhất', 'amazing', 'tuyệt vời', 'ultimate', 'hoàn hảo', 'top', 'hàng đầu'];
    if (emotionalWords.some(word => title.toLowerCase().includes(word.toLowerCase()))) {
      score += 20;
    }

    return { score: Math.min(score, 100), issues, recommendations };
  }

  // Phân tích SEO content
  analyzeContentSEO(content, focusKeyword) {
    let score = 0;
    let readabilityScore = 0;
    const issues = [];
    const recommendations = [];

    if (!content) {
      issues.push('Thiếu nội dung');
      recommendations.push('Thêm nội dung cho bài viết');
      return { score: 0, readabilityScore: 0, issues, recommendations };
    }

    // Đếm từ
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;

    // Kiểm tra độ dài content
    if (wordCount < 300) {
      issues.push('Nội dung quá ngắn');
      recommendations.push('Nội dung nên có ít nhất 300 từ');
    } else if (wordCount >= 300 && wordCount <= 2000) {
      score += 30;
    } else {
      score += 20;
    }

    // Kiểm tra keyword density
    if (focusKeyword) {
      const keywordCount = (content.toLowerCase().match(new RegExp(focusKeyword.toLowerCase(), 'g')) || []).length;
      const density = (keywordCount / wordCount) * 100;

      if (density < 0.5) {
        issues.push('Mật độ từ khóa thấp');
        recommendations.push(`Tăng mật độ từ khóa "${focusKeyword}" (0.5-2.5%)`);
      } else if (density > 2.5) {
        issues.push('Mật độ từ khóa cao');
        recommendations.push(`Giảm mật độ từ khóa "${focusKeyword}" (0.5-2.5%)`);
      } else {
        score += 25;
      }
    }

    // Kiểm tra headings
    const h1Count = (content.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (content.match(/<h2[^>]*>/gi) || []).length;

    if (h1Count === 0) {
      issues.push('Thiếu thẻ H1');
      recommendations.push('Thêm ít nhất một thẻ H1');
    } else if (h1Count > 1) {
      issues.push('Quá nhiều thẻ H1');
      recommendations.push('Chỉ nên có một thẻ H1');
    } else {
      score += 20;
    }

    if (h2Count >= 1) {
      score += 15;
    }

    // Kiểm tra hình ảnh với alt text
    const images = content.match(/<img[^>]*>/gi) || [];
    const imagesWithAlt = images.filter(img => img.includes('alt=')).length;
    
    if (images.length > 0) {
      if (imagesWithAlt === images.length) {
        score += 10;
      } else {
        issues.push('Một số hình ảnh thiếu alt text');
        recommendations.push('Thêm alt text cho tất cả hình ảnh');
      }
    }

    // Tính readability score đơn giản
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = wordCount / sentences.length;
    
    if (avgWordsPerSentence <= 20) {
      readabilityScore = 90;
    } else if (avgWordsPerSentence <= 25) {
      readabilityScore = 70;
    } else if (avgWordsPerSentence <= 30) {
      readabilityScore = 50;
    } else {
      readabilityScore = 30;
      issues.push('Câu quá dài, khó đọc');
      recommendations.push('Viết câu ngắn hơn (dưới 20 từ)');
    }

    return { 
      score: Math.min(score, 100), 
      readabilityScore, 
      issues, 
      recommendations,
      wordCount,
      sentenceCount: sentences.length
    };
  }

  // Phân tích SEO URL
  analyzeUrlSEO(slug, focusKeyword) {
  let score = 0;
  const issues = [];
  const recommendations = [];

  if (!slug) {
    issues.push('Thiếu URL slug');
    recommendations.push('Tạo URL slug cho bài viết');
    return { score: 0, issues, recommendations };
  }

  // Kiểm tra độ dài slug
  if (slug.length <= 75) {
    score += 40;
  } else {
    issues.push('URL quá dài');
    recommendations.push('URL nên ngắn hơn 75 ký tự');
  }

  // Kiểm tra focus keyword trong slug - Cải thiện cho tiếng Việt
  if (focusKeyword) {
    const keywordProcessed = this.processVietnameseKeyword(focusKeyword);
    const slugLower = slug.toLowerCase();
    
    // Kiểm tra từ khóa gốc (có thể đã được convert)
    if (slugLower.includes(focusKeyword.toLowerCase().replace(/\s+/g, '-'))) {
      score += 30;
    }
    // Kiểm tra từ khóa đã xử lý (không dấu)
    else if (slugLower.includes(keywordProcessed)) {
      score += 25;
    }
    // Kiểm tra các từ riêng lẻ trong keyword
    else {
      const keywordWords = keywordProcessed.split('-');
      const matchingWords = keywordWords.filter(word => 
        word.length > 2 && slugLower.includes(word)
      );
      
      if (matchingWords.length > 0) {
        const matchPercentage = matchingWords.length / keywordWords.length;
        if (matchPercentage >= 0.7) {
          score += 20;
          recommendations.push(`URL chứa ${matchingWords.length}/${keywordWords.length} từ của keyword "${focusKeyword}"`);
        } else if (matchPercentage >= 0.5) {
          score += 15;
          recommendations.push(`URL chứa một phần từ khóa "${focusKeyword}". Có thể cải thiện thêm.`);
        } else {
          score += 5;
          issues.push(`URL chỉ chứa ít từ của keyword "${focusKeyword}"`);
          recommendations.push(`Cố gắng thêm nhiều từ của keyword "${focusKeyword}" vào URL`);
        }
      } else {
        issues.push(`URL không chứa từ khóa "${focusKeyword}"`);
        recommendations.push(`Thêm từ khóa "${focusKeyword}" hoặc các từ liên quan vào URL`);
      }
    }
  }

  // Kiểm tra cấu trúc URL thân thiện
  if (!/[^a-z0-9\-]/.test(slug)) {
    score += 20;
  } else {
    issues.push('URL chứa ký tự không phù hợp');
    recommendations.push('URL chỉ nên chứa chữ thường, số và dấu gạch ngang');
  }

  // Kiểm tra cấu trúc có ý nghĩa
  const slugWords = slug.split('-').filter(word => word.length > 2);
  if (slugWords.length >= 3) {
    score += 10;
  } else if (slugWords.length >= 2) {
    score += 5;
  } else {
    recommendations.push('URL nên có ít nhất 2-3 từ có ý nghĩa');
  }

  return { score: Math.min(score, 100), issues, recommendations };
}

// Thêm phương thức xử lý từ khóa tiếng Việt
processVietnameseKeyword(keyword) {
  if (!keyword) return '';
  
  // Bảng chuyển đổi ký tự có dấu sang không dấu
  const vietnameseMap = {
    'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a', 'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
    'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
    'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
    'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o', 'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
    'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u', 'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
    'đ': 'd'
  };

  return keyword
    .toLowerCase()
    .split('')
    .map(char => vietnameseMap[char] || char)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

  // Phân tích mật độ từ khóa (Keywords Density)
  analyzeKeywordsDensity(content, focusKeyword) {
    if (!content || !focusKeyword) {
      return {
        focusKeyword: focusKeyword || '',
        density: 0,
        count: 0,
        totalWords: 0,
        recommendation: 'Không có nội dung hoặc từ khóa để phân tích',
        status: 'warning',
        relatedKeywords: []
      };
    }

    // Loại bỏ HTML tags và chuyển về chữ thường
    const cleanContent = content.replace(/<[^>]*>/g, ' ').toLowerCase();
    const cleanKeyword = focusKeyword.toLowerCase().trim();
    
    // Đếm tổng số từ
    const words = cleanContent.split(/\s+/).filter(word => word.length > 0);
    const totalWords = words.length;
    
    // Đếm số lần xuất hiện của từ khóa
    let keywordCount = 0;
    
    // Kiểm tra từ khóa đơn lẻ
    if (cleanKeyword.indexOf(' ') === -1) {
      // Từ khóa đơn
      keywordCount = (cleanContent.match(new RegExp(`\\b${cleanKeyword}\\b`, 'gi')) || []).length;
    } else {
      // Cụm từ khóa
      keywordCount = (cleanContent.match(new RegExp(cleanKeyword.replace(/\s+/g, '\\s+'), 'gi')) || []).length;
    }
    
    // Phân tích từ khóa liên quan (các từ trong cụm từ khóa)
    const relatedKeywords = [];
    if (cleanKeyword.indexOf(' ') > -1) {
      const keywordParts = cleanKeyword.split(/\s+/);
      keywordParts.forEach(part => {
        if (part.length > 2) { // Chỉ phân tích từ có ít nhất 3 ký tự
          const partCount = (cleanContent.match(new RegExp(`\\b${part}\\b`, 'gi')) || []).length;
          const partDensity = totalWords > 0 ? ((partCount / totalWords) * 100) : 0;
          relatedKeywords.push({
            keyword: part,
            count: partCount,
            density: parseFloat(partDensity.toFixed(2))
          });
        }
      });
    }
    
    // Tính mật độ (%)
    const density = totalWords > 0 ? ((keywordCount / totalWords) * 100) : 0;
    
    // Phân tích vị trí xuất hiện của từ khóa
    const keywordPositions = [];
    if (keywordCount > 0) {
      const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
      sentences.forEach((sentence, index) => {
        if (cleanKeyword.indexOf(' ') === -1) {
          // Từ khóa đơn
          if (sentence.includes(cleanKeyword)) {
            keywordPositions.push({
              position: index + 1,
              type: 'sentence',
              content: sentence.trim().substring(0, 100) + '...'
            });
          }
        } else {
          // Cụm từ khóa
          if (sentence.includes(cleanKeyword)) {
            keywordPositions.push({
              position: index + 1,
              type: 'sentence', 
              content: sentence.trim().substring(0, 100) + '...'
            });
          }
        }
      });
    }

    // Đánh giá mật độ từ khóa
    let status = 'good';
    let recommendation = '';
    
    if (density === 0) {
      status = 'error';
      recommendation = `Từ khóa "${focusKeyword}" không xuất hiện trong nội dung. Nên thêm từ khóa vào nội dung.`;
    } else if (density < 0.5) {
      status = 'warning';
      recommendation = `Mật độ từ khóa quá thấp (${density.toFixed(2)}%). Mật độ lý tưởng là 0.5-2.5%.`;
    } else if (density > 3) {
      status = 'error';
      recommendation = `Mật độ từ khóa quá cao (${density.toFixed(2)}%). Có thể bị coi là spam. Nên giảm xuống 0.5-2.5%.`;
    } else if (density > 2.5) {
      status = 'warning';
      recommendation = `Mật độ từ khóa hơi cao (${density.toFixed(2)}%). Nên giảm xuống dưới 2.5%.`;
    } else {
      status = 'good';
      recommendation = `Mật độ từ khóa tốt (${density.toFixed(2)}%). Trong khoảng lý tưởng 0.5-2.5%.`;
    }

    return {
      focusKeyword,
      density: parseFloat(density.toFixed(2)),
      count: keywordCount,
      totalWords,
      recommendation,
      status,
      relatedKeywords,
      positions: keywordPositions.slice(0, 5) // Chỉ lấy 5 vị trí đầu tiên
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

          // Chuẩn bị dữ liệu upsert
          const dataToSave = {
            postId,
            title: post.title,
            metaDescription: '',
            focusKeyword: (focusKeyword && focusKeyword.trim() !== '') ? focusKeyword.trim() : (postSEO?.focusKeyword || ''),
            analysis: analysis.details,
            seoScore: analysis.seoScore,
            readabilityScore: analysis.readabilityScore,
            lastAnalyzed: new Date()
          };

          // Sử dụng upsert để tránh duplicate
          const [upsertedPostSEO, created] = await PostSEO.upsert(dataToSave, {
            returning: true
          });

          // Lấy record đã được upsert
          postSEO = upsertedPostSEO || await PostSEO.findOne({ 
            where: { postId }
          });

          console.log(`✅ SEO ${created ? 'created' : 'updated'} for post ${postId}`);

          results.push({
            postId,
            success: true,
            data: {
              analysis,
              postSEO
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
