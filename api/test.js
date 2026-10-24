const HiruNewsScraper = require('../lib/scraper');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const lang = req.query.lang || 'sin';
    const scraper = new HiruNewsScraper(lang);
    const limit = parseInt(req.query.limit || '5');
    const breaking = await scraper.getBreakingNews(limit);

    let audit = {
      endpoint: '/api/test',
      language: lang,
      scraper_baseUrl: scraper.baseUrl,
      breaking_news_count: breaking.length,
      first_item_headline: breaking[0]?.headline || null,
      first_item_url: breaking[0]?.url || null,
      first_item_has_body: false,
      first_item_body_length: 0,
      first_item_tags: [],
      article_scrape_attempt: null
    };

    if (breaking && breaking.length > 0 && breaking[0].id) {
      try {
        const article = await scraper.getArticleById(breaking[0].id);
        audit.first_item_has_body = !!(article && article.body);
        audit.first_item_body_length = article ? (article.body ? article.body.length : 0) : 0;
        audit.first_item_tags = article ? (article.tags || []) : [];
        audit.article_scrape_attempt = 'success';
        audit.article_headline = article?.headline || null;
        audit.article_category = article?.category || null;
        audit.article_author = article?.author || null;
      } catch (artErr) {
        audit.article_scrape_attempt = 'failed: ' + artErr.message;
      }
    }

    const enriched = [];
    for (const item of breaking) {
        if (item.url && item.url.includes('error-error-')) {
            enriched.push({ ...item, body: null, tags: [] });
            continue;
        }
        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
            const full = await Promise.race([scraper.getArticleById(item.id), timeoutPromise]);
            if (full && !full.error) {
                enriched.push({ ...item, ...full, basic: undefined });
            } else {
                try {
                    const $ = await scraper.fetchPage(item.url);
                    if ($) {
                        const headline = $('h1').first().text().trim() || item.headline;
                        let body = '';
                        const selectors = ['.article-content', '.story-content', '.news-detail', '.single-news', '.news-content', '#content', 'article'];
                        for (const sel of selectors) {
                            const container = $(sel);
                            if (container.length) {
                                container.clone().find('script, style, .advertisement, .share-buttons, iframe').remove();
                                body = container.text().trim();
                                if (body.length > 300) break;
                            }
                        }
                        enriched.push({ ...item, headline, body: body || null, tags: [] });
                    } else {
                        enriched.push({ ...item, body: null, tags: [] });
                    }
                } catch (e2) {
                    enriched.push({ ...item, body: null, tags: [] });
                }
            }
        } catch (e) {
            enriched.push({ ...item, body: null, tags: [] });
        }
    }

    res.status(200).json({
      success: true,
      audit,
      data: enriched,
      timestamp: new Date().toISOString(),
      source: 'hirunews.lk'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
