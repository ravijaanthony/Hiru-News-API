const HiruNewsScraper = require('../lib/scraper');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const { limit = 5 } = req.query;
        const scraper = new HiruNewsScraper(req.query.lang || 'sin');
        
        const breakingNews = await scraper.getBreakingNews(parseInt(limit));
        
        // Enrich with full article details where available
        const enriched = [];
        for (const item of breakingNews) {
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
                    // Fallback: fetch directly from item.url for English/full articles
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
            data: enriched,
            count: enriched.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
