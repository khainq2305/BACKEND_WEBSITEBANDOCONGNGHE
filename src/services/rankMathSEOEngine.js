/**
 * Rank Math SEO Scoring Engine for Backend
 * Đồng bộ hóa với frontend logic chấm điểm SEO giống hệt Rank Math Demo
 */

class RankMathSEOEngine {
  constructor() {
    // Rank Math Categories - điểm số theo demo thực tế
    // Đồng bộ hóa với frontend
    this.categories = {
      basicSEO: {
        name: 'Basic SEO',
        maxScore: 54,
        tests: [
          { name: 'focusKeywordInTitle', maxScore: 34 },
          { name: 'focusKeywordInMetaDescription', maxScore: 2 }, 
          { name: 'focusKeywordInURL', maxScore: 5 },
          { name: 'focusKeywordAtBeginning', maxScore: 3 },
          { name: 'focusKeywordInContent', maxScore: 3 },
          { name: 'contentLength', maxScore: 7 }
        ]
      },
      additional: {
        name: 'Additional',
        maxScore: 30,
        tests: [
          { name: 'focusKeywordInSubheadings', maxScore: 2 },
          { name: 'imageWithFocusKeyword', maxScore: 2 },
          { name: 'keywordDensity', maxScore: 6 },
          { name: 'urlLength', maxScore: 4 },
          { name: 'externalLinks', maxScore: 4 },
          { name: 'doFollowLinks', maxScore: 2 },
          { name: 'internalLinks', maxScore: 5 },
          { name: 'focusKeywordSet', maxScore: 0 },
          { name: 'contentAI', maxScore: 5 }
        ]
      },
      titleReadability: {
        name: 'Title Readability',
        maxScore: 5,
        tests: [
          { name: 'focusKeywordNearBeginning', maxScore: 2 },
          { name: 'titleSentiment', maxScore: 1 },
          { name: 'titlePowerWords', maxScore: 1 },
          { name: 'titleHasNumber', maxScore: 1 }
        ]
      },
      contentReadability: {
        name: 'Content Readability',
        maxScore: 11,
        tests: [
          { name: 'tableOfContents', maxScore: 2 },
          { name: 'shortParagraphs', maxScore: 3 },
          { name: 'contentAssets', maxScore: 6 }
        ]
      }
    };

    // Messages song ngữ Tiếng Việt và Tiếng Anh
    this.messages = {
      // Basic SEO
      focusKeywordInTitle: 'Thêm Từ khóa chính vào tiêu đề SEO. (Add Focus Keyword to the SEO title)',
      focusKeywordInMetaDescription: 'Thêm Từ khóa chính vào Mô tả Meta SEO của bạn. (Add Focus Keyword to your SEO Meta Description)',
      focusKeywordInURL: 'Sử dụng Từ khóa chính trong URL. (Use Focus Keyword in the URL)',
      focusKeywordAtBeginning: 'Sử dụng Từ khóa chính ở đầu nội dung của bạn. (Use Focus Keyword at the beginning of your content)',
      focusKeywordInContent: 'Sử dụng Từ khóa chính trong nội dung. (Use Focus Keyword in the content)',
      contentLength: 'Nội dung nên dài từ 600-2500 từ. (Content should be 600-2500 words long)',
      
      // Additional
      focusKeywordInSubheadings: 'Sử dụng Từ khóa chính trong (các) tiêu đề phụ như H2, H3, H4, v.v. (Use Focus Keyword in subheading(s) like H2, H3, H4, etc.)',
      imageWithFocusKeyword: 'Thêm một hình ảnh với Từ khóa chính của bạn làm văn bản thay thế (alt text). (Add an image with your Focus Keyword as alt text)',
      keywordDensity: 'Mật độ Từ khóa là 0. Hãy nhắm đến khoảng 1% Mật độ Từ khóa. (Keyword Density is 0. Aim for around 1% Keyword Density)',
      urlLength: 'URL nên ngắn hơn 75 ký tự. (URL should be under 75 characters long)',
      externalLinks: 'Liên kết đến các nguồn tài nguyên bên ngoài. (Link out to external resources)',
      doFollowLinks: 'Thêm liên kết DoFollow trỏ đến các nguồn tài nguyên bên ngoài. (Add DoFollow links pointing to external resources)',
      internalLinks: 'Thêm liên kết nội bộ trong nội dung của bạn. (Add internal links in your content)',
      focusKeywordSet: 'Đặt một Từ khóa chính cho nội dung này. (Set a Focus Keyword for this content)',
      contentAI: 'Bạn đang sử dụng Content AI để tối ưu hóa Bài đăng này. (You are using Content AI to optimise this Post)',
      
      // Title Readability
      focusKeywordNearBeginning: 'Sử dụng Từ khóa chính gần đầu tiêu đề SEO. (Use the Focus Keyword near the beginning of SEO title)',
      titleSentiment: 'Tiêu đề có cảm xúc tích cực hoặc tiêu cực hoạt động tốt nhất để tăng CTR. (Titles with positive or negative sentiment work best for higher CTR)',
      titlePowerWords: 'Thêm từ ngữ mạnh mẽ vào tiêu đề của bạn để tăng CTR. (Add power words to your title to increase CTR)',
      titleHasNumber: 'Thêm một số vào tiêu đề của bạn để cải thiện CTR. (Add a number to your title to improve CTR)',
      
      // Content Readability
      tableOfContents: 'Sử dụng Mục lục để phân chia văn bản của bạn. (Use Table of Content to break-down your text)',
      shortParagraphs: 'Thêm các đoạn văn ngắn gọn và súc tích để đọc dễ dàng hơn và trải nghiệm người dùng tốt hơn. (Add short and concise paragraphs for better readability and UX)',
      contentAssets: 'Thêm một vài hình ảnh và/hoặc video để làm cho nội dung của bạn hấp dẫn hơn. (Add a few images and/or videos to make your content appealing)'
    };

    // Tổng điểm tối đa = 94 (Trùng với frontend)
    this.maxScore = Object.values(this.categories)
      .reduce((total, category) => total + category.maxScore, 0);
  }

  /**
   * Phân tích SEO theo chuẩn Rank Math
   * Đồng bộ với frontend
   */
  analyzeSEO(data) {
    const {
      title = '',
      content = '',
      metaDescription = '',
      url = '',
      focusKeyword = '',
      images = [],
      siteBaseUrl = ''
    } = data;

    const keyword = focusKeyword.toLowerCase().trim();
    const results = {};
    const errors = {};
    
    // Thực hiện tất cả tests với điểm chi tiết
    let totalScore = 0;
    const categoryScores = {};
    
    Object.keys(this.categories).forEach(categoryKey => {
      const category = this.categories[categoryKey];
      errors[categoryKey] = [];
      categoryScores[categoryKey] = 0;
      
      category.tests.forEach(testInfo => {
        const testName = testInfo.name;
        const maxScore = testInfo.maxScore;
        
        const testResult = this.runTest(testName, {
          title, content, metaDescription, url, keyword, images, siteBaseUrl
        }, maxScore);
        
        results[testName] = testResult;
        categoryScores[categoryKey] += testResult.score || 0;
        totalScore += testResult.score || 0;
        
        // Nếu test không đạt điểm tối đa -> thêm vào errors
        if ((testResult.score || 0) < maxScore) {
          errors[categoryKey].push({
            test: testName,
            message: this.messages[testName] || testResult.message,
            score: testResult.score || 0,
            maxScore: maxScore
          });
        }
      });
    });

    // Điểm tổng là tổng điểm thực tế
    const score = totalScore;
    const rating = this.getRating(score);

    return {
      score,
      rating,
      results,
      errors,
      categories: this.getCategorySummary(errors, categoryScores),
      maxScore: this.maxScore,
      categoryScores,
      stats: this.generateStats(title, content, keyword)
    };
  }

  /**
   * Chạy test cụ thể với điểm tối đa
   */
  runTest(testName, data, maxScore) {
    const { title, content, metaDescription, url, keyword, images, siteBaseUrl } = data;
    
    switch (testName) {
      case 'focusKeywordInTitle':
        return this.testFocusKeywordInTitle(title, keyword, maxScore);
      case 'focusKeywordInMetaDescription':
        return this.testFocusKeywordInMetaDescription(metaDescription, keyword, maxScore);
      case 'focusKeywordInURL':
        return this.testFocusKeywordInURL(url, keyword, maxScore);
      case 'focusKeywordAtBeginning':
        return this.testFocusKeywordAtBeginning(content, keyword, maxScore);
      case 'focusKeywordInContent':
        return this.testFocusKeywordInContent(content, keyword, maxScore);
      case 'contentLength':
        return this.testContentLength(content, maxScore);
      case 'focusKeywordInSubheadings':
        return this.testFocusKeywordInSubheadings(content, keyword, maxScore);
      case 'imageWithFocusKeyword':
        return this.testImageWithFocusKeyword(content, images, keyword, maxScore);
      case 'keywordDensity':
        return this.testKeywordDensity(content, keyword, maxScore);
      case 'urlLength':
        return this.testUrlLength(url, maxScore);
      case 'externalLinks':
        return this.testExternalLinks(content, siteBaseUrl, maxScore);
      case 'doFollowLinks':
        return this.testDoFollowLinks(content, siteBaseUrl, maxScore);
      case 'internalLinks':
        return this.testInternalLinks(content, siteBaseUrl, maxScore);
      case 'focusKeywordSet':
        return this.testFocusKeywordSet(keyword, maxScore);
      case 'contentAI':
        return this.testContentAI(maxScore);
      case 'focusKeywordNearBeginning':
        return this.testFocusKeywordNearBeginning(title, keyword, maxScore);
      case 'titleSentiment':
        return this.testTitleSentiment(title, maxScore);
      case 'titlePowerWords':
        return this.testTitlePowerWords(title, maxScore);
      case 'titleHasNumber':
        return this.testTitleHasNumber(title, maxScore);
      case 'tableOfContents':
        return this.testTableOfContents(content, maxScore);
      case 'shortParagraphs':
        return this.testShortParagraphs(content, maxScore);
      case 'contentAssets':
        return this.testContentAssets(content, maxScore);
      default:
        return { passed: false, message: 'Unknown test', score: 0 };
    }
  }

  // =================================
  // BASIC SEO TESTS
  // =================================

  testFocusKeywordInTitle(title, keyword, maxScore = 34) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    const passed = title.toLowerCase().includes(keyword.toLowerCase());
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được tìm thấy trong tiêu đề (Focus keyword found in title)' : 'Thêm Từ khóa chính vào tiêu đề SEO. (Add Focus Keyword to the SEO title)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testFocusKeywordInMetaDescription(metaDescription, keyword, maxScore = 2) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    if (!metaDescription) return { passed: false, message: 'Chưa có mô tả Meta (No meta description)', score: 0 };
    const passed = metaDescription.toLowerCase().includes(keyword.toLowerCase());
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được tìm thấy trong mô tả Meta (Focus keyword found in meta description)' : 'Thêm Từ khóa chính vào Mô tả Meta SEO của bạn. (Add Focus Keyword to your SEO Meta Description)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testFocusKeywordInURL(url, keyword, maxScore = 5) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    if (!url) return { passed: false, message: 'Chưa có URL (No URL provided)', score: 0 };
    const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
    const passed = url.toLowerCase().includes(keyword.toLowerCase()) || 
                   url.toLowerCase().includes(keywordSlug);
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được tìm thấy trong URL (Focus keyword found in URL)' : 'Sử dụng Từ khóa chính trong URL. (Use Focus Keyword in the URL)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testFocusKeywordAtBeginning(content, keyword, maxScore = 3) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    const firstParagraph = content.split(/\n\s*\n/)[0] || content.substring(0, 300);
    const passed = firstParagraph.toLowerCase().includes(keyword.toLowerCase());
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được tìm thấy ở đầu nội dung (Focus keyword found at beginning)' : 'Sử dụng Từ khóa chính ở đầu nội dung của bạn. (Use Focus Keyword at the beginning of your content)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testFocusKeywordInContent(content, keyword, maxScore = 3) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    const passed = content.toLowerCase().includes(keyword.toLowerCase());
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được tìm thấy trong nội dung (Focus keyword found in content)' : 'Sử dụng Từ khóa chính trong nội dung. (Use Focus Keyword in the content)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testContentLength(content, maxScore = 7) {
    const wordCount = this.countWords(content);
    let score = 0;
    let message = '';
    
    if (wordCount < 600) {
      score = 0;
      message = `Nội dung dài ${wordCount} từ. Hãy thêm nội dung. (Content is ${wordCount} words long. Add more content)`;
    } else if (wordCount <= 1000) {
      score = 1;
      message = `Nội dung dài ${wordCount} từ.  (Content is ${wordCount} words long. Good job!)`;
    } else if (wordCount <= 1500) {
      score = 2;
      message = `Nội dung dài ${wordCount} từ.  (Content is ${wordCount} words long. Good job!)`;
    } else if (wordCount <= 2000) {
      score = 3;
      message = `Nội dung dài ${wordCount} từ.  (Content is ${wordCount} words long. Good job!)`;
    } else if (wordCount <= 2500) {
      score = 4;
      message = `Nội dung dài ${wordCount} từ.  (Content is ${wordCount} words long. Good job!)`;
    } else {
      score = 7; // >2500 words gets max score
      message = `Nội dung dài ${wordCount} từ. Tuyệt vời! (Content is ${wordCount} words long. Excellent!)`;
    }
    
    const passed = score > 0;
    return { 
      passed, 
      score,
      wordCount,
      message,
      scoreText: `${score}/${maxScore}`
    };
  }

  // =================================
  // ADDITIONAL TESTS
  // =================================

  testFocusKeywordInSubheadings(content, keyword, maxScore = 2) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    const headingRegex = /<h[2-6][^>]*>(.*?)<\/h[2-6]>/gi;
    const headings = [];
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push(match[1].replace(/<[^>]*>/g, ''));
    }
    
    const passed = headings.some(heading => 
      heading.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const score = passed ? maxScore : 0;
    
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được tìm thấy trong các tiêu đề phụ (Focus keyword found in subheadings)' : 'Sử dụng Từ khóa chính trong (các) tiêu đề phụ như H2, H3, H4, v.v. (Use Focus Keyword in subheading(s) like H2, H3, H4, etc.)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testImageWithFocusKeyword(content, images, keyword, maxScore = 2) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    
    let foundInImages = false;
    let foundInContent = false;
    
    // Check images array if provided
    if (images && images.length > 0) {
      foundInImages = images.some(img => 
        img.alt && img.alt.toLowerCase().includes(keyword.toLowerCase())
      );
    }
    
    // Check images in HTML content
    if (content) {
      const imgRegex = /<img[^>]+alt\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let match;
      const altTexts = [];
      
      while ((match = imgRegex.exec(content)) !== null) {
        altTexts.push(match[1]);
      }
      
      foundInContent = altTexts.some(alt => 
        alt.toLowerCase().includes(keyword.toLowerCase())
      );
    }
    
    const passed = foundInImages || foundInContent;
    const score = passed ? maxScore : 0;
    
    return { 
      passed, 
      score,
      message: passed ? 'Tìm thấy hình ảnh với văn bản thay thế chứa từ khóa chính (Image with focus keyword alt text found)' : 'Thêm một hình ảnh với Từ khóa chính của bạn làm văn bản thay thế (alt text). (Add an image with your Focus Keyword as alt text)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testKeywordDensity(content, keyword, maxScore = 6) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    const wordCount = this.countWords(content);
    const keywordCount = this.countKeywordOccurrences(content, keyword);
    const density = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
    
    let score = 0;
    let message = '';
    
    if (density === 0 || density < 0.5) {
      score = 0;
      message = `Mật độ Từ khóa là ${density.toFixed(2)}%. Hãy nhắm đến khoảng 1%. (Keyword Density: ${density.toFixed(2)}%. Aim for ~1%)`;
    } else if (density >= 0.5 && density < 0.75) {
      score = 2;
      message = `Mật độ từ khóa là ${density.toFixed(2)}%, xuất hiện ${keywordCount} lần. (Keyword density: ${density.toFixed(2)}%, appears ${keywordCount} times)`;
    } else if (density >= 0.75 && density < 1.0) {
      score = 3;
      message = `Mật độ từ khóa là ${density.toFixed(2)}%, xuất hiện ${keywordCount} lần. (Keyword density: ${density.toFixed(2)}%, appears ${keywordCount} times)`;
    } else if (density >= 1.0 && density <= 2.5) {
      score = 6;
      message = `Mật độ từ khóa là ${density.toFixed(2)}%, xuất hiện ${keywordCount} lần. (Keyword density: ${density.toFixed(2)}%, appears ${keywordCount} times)`;
    } else {
      score = 0;
      message = `Mật độ Từ khóa là ${density.toFixed(2)}%. Quá cao! Hãy nhắm đến khoảng 1%. (Keyword Density: ${density.toFixed(2)}%. Too high! Aim for ~1%)`;
    }
    
    const passed = score > 0;
    return { 
      passed, 
      score,
      density,
      keywordCount,
      message,
      scoreText: `${score}/${maxScore}`
    };
  }

  testUrlLength(url, maxScore = 4) {
    if (!url) return { passed: false, message: 'Chưa có URL (No URL provided)', score: 0 };
    const length = url.length;
    const passed = length <= 75;
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? `URL dài ${length} ký tự. Tuyệt vời! (URL is ${length} characters long. Kudos!)` : `URL dài ${length} ký tự. Hãy cân nhắc rút gọn nó. (URL is ${length} characters long. Consider shortening it)`,
      length: length,
      scoreText: `${score}/${maxScore}`
    };
  }

  isInternalLink(url, siteBaseUrl) {
    if (!url) return false;
    if (!siteBaseUrl) return false;
    
    // Kiểm tra relative URL
    if (url.startsWith('/')) return true;
    
    // Kiểm tra URL thuộc về domain
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(siteBaseUrl);
      return urlObj.hostname === baseUrlObj.hostname;
    } catch (e) {
      return false;
    }
  }

  testExternalLinks(content, siteBaseUrl, maxScore = 4) {
    // Tìm tất cả links trong content
    const linkRegex = /<a[^>]*href=["|']([^"']*)["|'][^>]*>/gi;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }
    
    // Lọc ra chỉ external links (không phải internal links)
    const externalLinks = links.filter(link => 
      !this.isInternalLink(link, siteBaseUrl) && (link.startsWith('http://') || link.startsWith('https://'))
    );
    
    const passed = externalLinks.length > 0;
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed 
        ? `Tuyệt vời! Bạn đang liên kết đến ${externalLinks.length} nguồn tài nguyên bên ngoài. (Great! You are linking to ${externalLinks.length} external resources)` 
        : 'Liên kết đến các nguồn tài nguyên bên ngoài. (Link out to external resources)',
      count: externalLinks.length,
      externalLinks: externalLinks,
      scoreText: `${score}/${maxScore}`
    };
  }

  testDoFollowLinks(content, siteBaseUrl, maxScore = 2) {
    // Tìm tất cả links với attributes
    const linkRegex = /<a[^>]*href=["|']([^"']*)["|'][^>]*>/gi;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1];
      const fullTag = match[0];
      
      // Chỉ kiểm tra external links
      if (!this.isInternalLink(href, siteBaseUrl) && (href.startsWith('http://') || href.startsWith('https://'))) {
        const hasNoFollow = /rel=["|'][^"']*nofollow[^"']*["|']/i.test(fullTag);
        if (!hasNoFollow) {
          links.push(href);
        }
      }
    }
    
    const passed = links.length > 0;
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed 
        ? `Tìm thấy ít nhất ${links.length} liên kết ngoài với DoFollow trong nội dung của bạn. (At least ${links.length} external link with DoFollow found in your content)` 
        : 'Thêm liên kết DoFollow trỏ đến các nguồn tài nguyên bên ngoài. (Add DoFollow links pointing to external resources)',
      count: links.length,
      doFollowLinks: links,
      scoreText: `${score}/${maxScore}`
    };
  }

  testInternalLinks(content, siteBaseUrl, maxScore = 5) {
    // Tìm tất cả links trong content
    const linkRegex = /<a[^>]*href=["|']([^"']*)["|'][^>]*>/gi;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }
    
    // Lọc ra internal links
    const internalLinks = links.filter(link => this.isInternalLink(link, siteBaseUrl));
    
    const passed = internalLinks.length > 0;
    const score = passed ? maxScore : 0;
    
    return { 
      passed, 
      score,
      message: passed 
        ? `Bạn đang liên kết đến ${internalLinks.length} tài nguyên khác trên trang web của bạn, điều này rất tốt. (You are linking to ${internalLinks.length} other resources on your website which is great)` 
        : `Thêm liên kết nội bộ trong nội dung của bạn trỏ đến trang web của bạn (${siteBaseUrl || 'trang web của bạn'}). (Add internal links in your content pointing to your website)`,
      count: internalLinks.length,
      internalLinks: internalLinks,
      scoreText: `${score}/${maxScore}`
    };
  }

  testFocusKeywordSet(keyword, maxScore = 0) {
    const passed = keyword && keyword.trim().length > 0;
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? "Bạn chưa sử dụng Từ khóa chính này trước đây. (You haven't used this Focus Keyword before)" : 'Đặt một Từ khóa chính cho nội dung này. (Set a Focus Keyword for this content)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testContentAI(maxScore = 5) {
    // Giả định content AI được sử dụng
    const passed = true;
    const score = maxScore;
    return { 
      passed, 
      score,
      message: 'Bạn đang sử dụng Content AI để tối ưu hóa Bài đăng này. (You are using Content AI to optimise this Post)',
      scoreText: `${score}/${maxScore}`
    };
  }

  // =================================
  // TITLE READABILITY TESTS
  // =================================

  testFocusKeywordNearBeginning(title, keyword, maxScore = 2) {
    if (!keyword) return { passed: false, message: 'Chưa có từ khóa chính (No focus keyword set)', score: 0 };
    const keywordIndex = title.toLowerCase().indexOf(keyword.toLowerCase());
    const passed = keywordIndex >= 0 && keywordIndex <= 10;
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Từ khóa chính được sử dụng ở đầu tiêu đề SEO. (Focus Keyword used at the beginning of SEO title)' : 'Sử dụng Từ khóa chính gần đầu tiêu đề SEO. (Use the Focus Keyword near the beginning of SEO title)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testTitleSentiment(title, maxScore = 1) {
    const positiveWords = [
      'best', 'amazing', 'incredible', 'outstanding', 'excellent', 'perfect',
      'ultimate', 'superior', 'fantastic', 'wonderful', 'great', 'awesome'
    ];
    
    const negativeWords = [
      'worst', 'terrible', 'horrible', 'awful', 'bad', 'failed', 'disaster',
      'avoid', 'never', 'don\'t', 'stop', 'quit', 'end', 'kill'
    ];
    
    const titleLower = title.toLowerCase();
    const hasPositive = positiveWords.some(word => titleLower.includes(word));
    const hasNegative = negativeWords.some(word => titleLower.includes(word));
    
    const passed = hasPositive || hasNegative;
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Tiêu đề của bạn có cảm xúc tích cực hoặc tiêu cực. (Your title has a positive or a negative sentiment)' : 'Tiêu đề có cảm xúc tích cực hoặc tiêu cực hoạt động tốt nhất để tăng CTR. (Titles with positive or negative sentiment work best for higher CTR)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testTitlePowerWords(title, maxScore = 1) {
    const powerWords = [
      'free', 'new', 'proven', 'results', 'easy', 'step', 'guide', 'how',
      'ultimate', 'complete', 'essential', 'exclusive', 'limited', 'secret',
      'powerful', 'effective', 'advanced', 'professional', 'expert'
    ];
    
    const titleLower = title.toLowerCase();
    const passed = powerWords.some(word => titleLower.includes(word));
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Tiêu đề của bạn chứa (các) từ ngữ mạnh mẽ. Tuyệt vời! (Your title contains power word(s). Booyah!)' : 'Thêm từ ngữ mạnh mẽ vào tiêu đề của bạn để tăng CTR. (Add power words to your title to increase CTR)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testTitleHasNumber(title, maxScore = 1) {
    const passed = /\d/.test(title);
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Bạn đang sử dụng số trong tiêu đề SEO của bạn. (You are using a number in your SEO title)' : 'Thêm một số vào tiêu đề của bạn để cải thiện CTR. (Add a number to your title to improve CTR)',
      scoreText: `${score}/${maxScore}`
    };
  }

  // =================================
  // CONTENT READABILITY TESTS
  // =================================

  testTableOfContents(content, maxScore = 2) {
    const tocPatterns = [
      /table\s+of\s+contents/i,
      /mục\s+lục/i,
      /toc/i,
      /<div[^>]*class=["|'][^"']*toc[^"']*["|']/i
    ];
    
    const passed = tocPatterns.some(pattern => pattern.test(content));
    const score = passed ? maxScore : 0;
    return { 
      passed, 
      score,
      message: passed ? 'Bạn đang sử dụng Mục lục để phân chia văn bản của bạn. (You are using Table of Contents to break-down your text)' : 'Sử dụng Mục lục để phân chia văn bản của bạn. (Use Table of Content to break-down your text)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testShortParagraphs(content, maxScore = 3) {
    // 1) Tách theo <p>... </p> giống Rank Math
    const pMatches = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    let paragraphs;
    if (pMatches.length) {
      paragraphs = pMatches.map(m => m[1]);
    } else {
      // 2) Fallback khi không có <p>: quy đổi <br> và các block tag thành xuống dòng rồi tách theo \n\n
      const normalized = content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(h[1-6]|div|section|article|li|blockquote|pre|table|figure|p)>/gi, '$&\n');
      paragraphs = normalized.split(/\n\s*\n/);
    }

    // Làm sạch, bỏ tag, loại bỏ đoạn rỗng
    paragraphs = paragraphs
      .map(p => p.replace(/<[^>]*>/g, ' ').trim())
      .filter(p => p.length > 0);

    // 3) Chuẩn Rank Math: TRƯỢT nếu có ÍT NHẤT 1 đoạn > 120 từ
    const hasLong = paragraphs.some(p => this.countWords(p) > 120);
    const passed = !hasLong;
    const score = passed ? maxScore : 0;

    return {
      passed,
      score,
      message: passed
        ? 'Bạn đang sử dụng các đoạn văn ngắn. (You are using short paragraphs)'
        : 'Ít nhất một đoạn văn dài. Hãy cân nhắc sử dụng các đoạn văn ngắn. (At least one paragraph is long. Consider using short paragraphs)',
      scoreText: `${score}/${maxScore}`
    };
  }

  testContentAssets(content, maxScore = 6) {
    // Đếm số ảnh
    const imgMatches = content.match(/<img[^>]*>/gi) || [];
    const imageCount = imgMatches.length;
    
    // Đếm video
    const hasVideos = /<video[^>]*>|<iframe[^>]*>/i.test(content);
    
    let score = 0;
    let message = '';
    
    if (imageCount === 0 && !hasVideos) {
      score = 0;
      message = 'Thêm một vài hình ảnh và/hoặc video để làm cho nội dung của bạn hấp dẫn hơn. (Add a few images and/or videos to make your content appealing)';
    } else if (imageCount === 1) {
      score = 1;
      message = 'Nội dung của bạn chứa hình ảnh và/hoặc video. (Your content contains images and/or video(s))';
    } else if (imageCount === 2) {
      score = 2;
      message = 'Nội dung của bạn chứa hình ảnh và/hoặc video. (Your content contains images and/or video(s))';
    } else if (imageCount === 3) {
      score = 4;
      message = 'Nội dung của bạn chứa hình ảnh và/hoặc video. (Your content contains images and/or video(s))';
    } else if (imageCount >= 4) {
      score = 6;
      message = 'Nội dung của bạn chứa hình ảnh và/hoặc video. (Your content contains images and/or video(s))';
    }
    
    // Bonus for videos
    if (hasVideos && score < maxScore) {
      score = Math.min(score + 1, maxScore);
    }
    
    const passed = score > 0;
    
    return { 
      passed, 
      score,
      imageCount,
      hasVideos,
      message,
      scoreText: `${score}/${maxScore}`
    };
  }

  // =================================
  // HELPER METHODS
  // =================================

  getCategorySummary(errors, categoryScores) {
    const summary = {};
    Object.keys(this.categories).forEach(categoryKey => {
      const category = this.categories[categoryKey];
      summary[categoryKey] = {
        name: category.name,
        maxScore: category.maxScore,
        score: categoryScores[categoryKey] || 0,
        errors: errors[categoryKey].length,
        tests: category.tests
      };
    });
    return summary;
  }

  getRating(score) {
    // Rating dựa trên điểm tuyệt đối (max 100)
    if (score >= 90) return 'excellent';  // 90%
    if (score >= 70) return 'good';       // 70%
    if (score >= 50) return 'ok';         // 50%
    if (score >= 30) return 'poor';       // 30%
    return 'bad';
  }

  generateStats(title, content, keyword) {
    return {
      titleLength: title.length,
      contentLength: content.length,
      wordCount: this.countWords(content),
      keywordCount: this.countKeywordOccurrences(content, keyword),
      keywordDensity: this.countWords(content) > 0 
        ? ((this.countKeywordOccurrences(content, keyword) / this.countWords(content)) * 100).toFixed(2)
        : 0
    };
  }

  countWords(content) {
    if (!content) return 0;
    const textOnly = content.replace(/<[^>]*>/g, '');
    // 2. Convert to lowercase
    const lowerText = textOnly.toLowerCase();
    
    // 3. Split by whitespace and filter out empty strings
    const words = lowerText.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  countKeywordOccurrences(content, keywordOrKeywords) {
    if (!content || !keywordOrKeywords) return 0;

    // 1) Lấy text thuần (giữ nguyên chữ, loại bỏ thẻ)
    const text = content.replace(/<[^>]*>/g, ' ');

    // 2) Hỗ trợ nhiều keyword: "a, b|c" → ["a","b","c"]
    const keywords = Array.isArray(keywordOrKeywords)
      ? keywordOrKeywords
      : String(keywordOrKeywords)
          .split(/[,|]/)               // cho phép phân tách bằng , hoặc |
          .map(s => s.trim())
          .filter(Boolean);

    if (!keywords.length) return 0;

    // 3) Tạo regex giống Rank Math: KHÔNG dùng \b, chỉ escape ký tự đặc biệt
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(escaped.join('|'), 'gi');

    // 4) Đếm match
    const matches = text.match(re);
    return matches ? matches.length : 0;
  }
}

module.exports = new RankMathSEOEngine();