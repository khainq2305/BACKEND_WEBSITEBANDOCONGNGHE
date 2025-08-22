const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const readability = require('readability-score');

class SEOAnalyzer {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async analyzePage(url, focusKeyword = '') {
    await this.init();
    const page = await this.browser.newPage();
    
    try {
      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate to page
      const startTime = Date.now();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const loadTime = Date.now() - startTime;
      
      // Get page content
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Get performance metrics
      const performanceMetrics = await page.metrics();
      
      // Analyze all aspects
      const analysis = {
        title: this.analyzeTitle($, focusKeyword),
        metaDescription: this.analyzeMetaDescription($, focusKeyword),
        focusKeyword: this.analyzeFocusKeyword($, focusKeyword, content),
        headings: this.analyzeHeadings($, focusKeyword),
        images: this.analyzeImages($),
        content: this.analyzeContent($),
        internalLinks: this.analyzeInternalLinks($, url),
        externalLinks: this.analyzeExternalLinks($, url),
        socialTags: this.analyzeSocialTags($),
        performance: this.analyzePerformance(performanceMetrics, loadTime),
        technical: await this.analyzeTechnical($, page, url)
      };
      
      // Calculate overall score
      const overallScore = this.calculateOverallScore(analysis);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(analysis);
      
      return {
        url,
        ...analysis,
        overallScore,
        recommendations,
        lastAnalyzed: new Date()
      };
      
    } finally {
      await page.close();
    }
  }

  analyzeTitle($, focusKeyword) {
    const titleElement = $('title');
    const content = titleElement.text().trim();
    const length = content.length;
    
    let score = 0;
    const issues = [];
    
    // Check if title exists
    if (!content) {
      issues.push('Missing title tag');
      return { content, length, score: 0, issues };
    }
    
    // Length check
    if (length < 30) {
      issues.push('Title is too short (less than 30 characters)');
      score += 20;
    } else if (length > 60) {
      issues.push('Title is too long (more than 60 characters)');
      score += 70;
    } else {
      score += 100;
    }
    
    // Focus keyword check
    if (focusKeyword && content.toLowerCase().includes(focusKeyword.toLowerCase())) {
      score = Math.min(score + 20, 100);
    } else if (focusKeyword) {
      issues.push(`Focus keyword "${focusKeyword}" not found in title`);
    }
    
    // Uniqueness and readability
    if (content.split(' ').length < 3) {
      issues.push('Title should contain more descriptive words');
      score = Math.max(score - 20, 0);
    }
    
    return { content, length, score: Math.round(score), issues };
  }

  analyzeMetaDescription($, focusKeyword) {
    const metaDesc = $('meta[name="description"]');
    const content = metaDesc.attr('content') || '';
    const length = content.length;
    
    let score = 0;
    const issues = [];
    
    if (!content) {
      issues.push('Missing meta description');
      return { content, length, score: 0, issues };
    }
    
    // Length check
    if (length < 120) {
      issues.push('Meta description is too short (less than 120 characters)');
      score += 60;
    } else if (length > 160) {
      issues.push('Meta description is too long (more than 160 characters)');
      score += 70;
    } else {
      score += 100;
    }
    
    // Focus keyword check
    if (focusKeyword && content.toLowerCase().includes(focusKeyword.toLowerCase())) {
      score = Math.min(score + 20, 100);
    } else if (focusKeyword) {
      issues.push(`Focus keyword "${focusKeyword}" not found in meta description`);
    }
    
    return { content, length, score: Math.round(score), issues };
  }

  analyzeFocusKeyword($, keyword, content) {
    if (!keyword) {
      return { keyword: '', density: 0, inTitle: false, inDescription: false, inHeadings: false, inUrl: false, score: 0 };
    }
    
    const text = $.text().toLowerCase();
    const keywordLower = keyword.toLowerCase();
    const keywordCount = (text.match(new RegExp(keywordLower, 'g')) || []).length;
    const totalWords = text.split(/\s+/).length;
    const density = (keywordCount / totalWords) * 100;
    
    const title = $('title').text().toLowerCase();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const headingsText = $('h1, h2, h3, h4, h5, h6').text().toLowerCase();
    
    const inTitle = title.includes(keywordLower);
    const inDescription = metaDesc.toLowerCase().includes(keywordLower);
    const inHeadings = headingsText.includes(keywordLower);
    const inUrl = content.toLowerCase().includes(keywordLower);
    
    let score = 0;
    
    // Density scoring
    if (density >= 0.5 && density <= 2.5) {
      score += 30;
    } else if (density > 2.5) {
      score += 10; // Keyword stuffing penalty
    }
    
    // Placement scoring
    if (inTitle) score += 25;
    if (inDescription) score += 20;
    if (inHeadings) score += 15;
    if (inUrl) score += 10;
    
    return {
      keyword,
      density: Math.round(density * 100) / 100,
      inTitle,
      inDescription,
      inHeadings,
      inUrl,
      score: Math.round(score)
    };
  }

  analyzeHeadings($, focusKeyword) {
    const headings = { h1: { count: 0, content: [] }, h2: { count: 0, content: [] }, h3: { count: 0, content: [] }, h4: { count: 0, content: [] }, h5: { count: 0, content: [] }, h6: { count: 0, content: [] } };
    const issues = [];
    
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
      const elements = $(tag);
      headings[tag].count = elements.length;
      elements.each((i, el) => {
        headings[tag].content.push($(el).text().trim());
      });
    });
    
    let score = 0;
    
    // H1 analysis
    if (headings.h1.count === 0) {
      issues.push('Missing H1 tag');
    } else if (headings.h1.count > 1) {
      issues.push('Multiple H1 tags found (should be only one)');
      score += 70;
    } else {
      score += 100;
      
      // Check if focus keyword in H1
      if (focusKeyword && headings.h1.content[0].toLowerCase().includes(focusKeyword.toLowerCase())) {
        score = Math.min(score + 20, 100);
      }
    }
    
    // Heading structure
    if (headings.h2.count > 0) {
      score = Math.min(score + 10, 100);
    }
    
    return { ...headings, score: Math.round(score), issues };
  }

  analyzeImages($) {
    const images = $('img');
    const total = images.length;
    let withAlt = 0;
    let withoutAlt = 0;
    const altTexts = [];
    const issues = [];
    
    images.each((i, img) => {
      const alt = $(img).attr('alt');
      if (alt && alt.trim()) {
        withAlt++;
        altTexts.push(alt.trim());
      } else {
        withoutAlt++;
      }
    });
    
    let score = 0;
    
    if (total === 0) {
      score = 100; // No images is fine
    } else {
      const altPercentage = (withAlt / total) * 100;
      score = Math.round(altPercentage);
      
      if (withoutAlt > 0) {
        issues.push(`${withoutAlt} images missing alt text`);
      }
    }
    
    return { total, withAlt, withoutAlt, altTexts, issues, score };
  }

  analyzeContent($) {
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = $('p').length;
    
    const wordCount = words.length;
    const averageSentenceLength = wordCount / sentences.length || 0;
    
    let score = 0;
    
    // Word count scoring
    if (wordCount < 300) {
      score += 40;
    } else if (wordCount >= 300 && wordCount <= 2000) {
      score += 100;
    } else {
      score += 80;
    }
    
    // Readability scoring (simplified)
    let readabilityScore = 0;
    if (averageSentenceLength <= 20) {
      readabilityScore = 100;
    } else if (averageSentenceLength <= 30) {
      readabilityScore = 80;
    } else {
      readabilityScore = 60;
    }
    
    return {
      wordCount,
      readabilityScore,
      sentences: sentences.length,
      paragraphs,
      averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
      score: Math.round((score + readabilityScore) / 2)
    };
  }

  analyzeInternalLinks($, baseUrl) {
    const links = [];
    let count = 0;
    
    $('a[href]').each((i, link) => {
      const href = $(link).attr('href');
      const anchor = $(link).text().trim();
      
      if (href && (href.startsWith('/') || href.includes(baseUrl))) {
        links.push({ url: href, anchor });
        count++;
      }
    });
    
    let score = 0;
    
    if (count >= 3 && count <= 10) {
      score = 100;
    } else if (count > 10) {
      score = 80;
    } else if (count > 0) {
      score = 60;
    } else {
      score = 20;
    }
    
    return { count, links, score };
  }

  analyzeExternalLinks($, baseUrl) {
    const links = [];
    let count = 0;
    
    $('a[href]').each((i, link) => {
      const href = $(link).attr('href');
      const anchor = $(link).text().trim();
      
      if (href && href.startsWith('http') && !href.includes(baseUrl)) {
        links.push({ url: href, anchor });
        count++;
      }
    });
    
    let score = count > 0 ? 80 : 60; // External links are optional but good
    
    return { count, links, score };
  }

  analyzeSocialTags($) {
    const openGraph = {
      title: $('meta[property="og:title"]').attr('content') || '',
      description: $('meta[property="og:description"]').attr('content') || '',
      image: $('meta[property="og:image"]').attr('content') || '',
      type: $('meta[property="og:type"]').attr('content') || '',
      score: 0
    };
    
    const twitter = {
      title: $('meta[name="twitter:title"]').attr('content') || '',
      description: $('meta[name="twitter:description"]').attr('content') || '',
      image: $('meta[name="twitter:image"]').attr('content') || '',
      card: $('meta[name="twitter:card"]').attr('content') || '',
      score: 0
    };
    
    // OpenGraph scoring
    let ogScore = 0;
    if (openGraph.title) ogScore += 25;
    if (openGraph.description) ogScore += 25;
    if (openGraph.image) ogScore += 25;
    if (openGraph.type) ogScore += 25;
    openGraph.score = ogScore;
    
    // Twitter scoring
    let twitterScore = 0;
    if (twitter.title) twitterScore += 25;
    if (twitter.description) twitterScore += 25;
    if (twitter.image) twitterScore += 25;
    if (twitter.card) twitterScore += 25;
    twitter.score = twitterScore;
    
    return { openGraph, twitter };
  }

  analyzePerformance(metrics, loadTime) {
    const score = loadTime < 3000 ? 100 : loadTime < 5000 ? 80 : 60;
    
    return {
      loadTime,
      pageSize: Math.round(metrics.JSHeapUsedSize / 1024), // KB
      requests: 0, // Would need more complex analysis
      score
    };
  }

  async analyzeTechnical($, page, url) {
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    const robots = $('meta[name="robots"]').attr('content') || '';
    const sitemap = false; // Would need to check /sitemap.xml
    const ssl = url.startsWith('https://');
    const mobileFriendly = $('meta[name="viewport"]').length > 0;
    
    // Schema markup detection
    const schema = [];
    $('script[type="application/ld+json"]').each((i, script) => {
      try {
        const data = JSON.parse($(script).html());
        if (data['@type']) {
          schema.push(data['@type']);
        }
      } catch (e) {
        // Invalid JSON
      }
    });
    
    let score = 0;
    if (ssl) score += 20;
    if (mobileFriendly) score += 20;
    if (canonical) score += 20;
    if (robots) score += 20;
    if (schema.length > 0) score += 20;
    
    return {
      canonical,
      robots,
      sitemap,
      ssl,
      mobileFriendly,
      schema,
      score
    };
  }

  calculateOverallScore(analysis) {
    const weights = {
      title: 0.20,
      metaDescription: 0.15,
      focusKeyword: 0.15,
      headings: 0.10,
      images: 0.08,
      content: 0.12,
      internalLinks: 0.05,
      externalLinks: 0.03,
      socialTags: 0.07,
      performance: 0.03,
      technical: 0.12
    };
    
    let totalScore = 0;
    
    Object.keys(weights).forEach(key => {
      if (analysis[key]) {
        let score = 0;
        if (key === 'socialTags') {
          score = (analysis[key].openGraph.score + analysis[key].twitter.score) / 2;
        } else {
          score = analysis[key].score || 0;
        }
        totalScore += score * weights[key];
      }
    });
    
    return Math.round(totalScore);
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    // Title recommendations
    if (analysis.title.score < 80) {
      analysis.title.issues.forEach(issue => {
        recommendations.push({
          type: 'title',
          priority: 'high',
          message: issue,
          fix: 'Optimize your title tag to be between 30-60 characters and include your focus keyword.'
        });
      });
    }
    
    // Meta description recommendations
    if (analysis.metaDescription.score < 80) {
      analysis.metaDescription.issues.forEach(issue => {
        recommendations.push({
          type: 'meta-description',
          priority: 'high',
          message: issue,
          fix: 'Write a compelling meta description between 120-160 characters that includes your focus keyword.'
        });
      });
    }
    
    // Headings recommendations
    if (analysis.headings.score < 80) {
      analysis.headings.issues.forEach(issue => {
        recommendations.push({
          type: 'headings',
          priority: 'medium',
          message: issue,
          fix: 'Use proper heading structure with one H1 tag and organize content with H2, H3 tags.'
        });
      });
    }
    
    // Images recommendations
    if (analysis.images.score < 80) {
      analysis.images.issues.forEach(issue => {
        recommendations.push({
          type: 'images',
          priority: 'medium',
          message: issue,
          fix: 'Add descriptive alt text to all images for better accessibility and SEO.'
        });
      });
    }
    
    // Content recommendations
    if (analysis.content.wordCount < 300) {
      recommendations.push({
        type: 'content',
        priority: 'medium',
        message: 'Content is too short',
        fix: 'Add more valuable content to reach at least 300 words.'
      });
    }
    
    // Social tags recommendations
    if (analysis.socialTags.openGraph.score < 80) {
      recommendations.push({
        type: 'social',
        priority: 'low',
        message: 'Missing Open Graph tags',
        fix: 'Add Open Graph meta tags for better social media sharing.'
      });
    }
    
    // Technical recommendations
    if (!analysis.technical.ssl) {
      recommendations.push({
        type: 'technical',
        priority: 'high',
        message: 'Website is not using HTTPS',
        fix: 'Enable SSL certificate to secure your website.'
      });
    }
    
    if (!analysis.technical.mobileFriendly) {
      recommendations.push({
        type: 'technical',
        priority: 'high',
        message: 'Missing viewport meta tag',
        fix: 'Add viewport meta tag for mobile responsiveness.'
      });
    }
    
    return recommendations;
  }
}

module.exports = SEOAnalyzer;
