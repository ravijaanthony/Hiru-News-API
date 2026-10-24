const HiruNewsScraper = require('../lib/scraper');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const { limit = 10 } = req.query;
        const scraper = new HiruNewsScraper(req.query.lang || 'sin');
        
        const latestNews = await scraper.getLatestNews(parseInt(limit));
        
        const enriched = [];
        for (const item of latestNews) {
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
        
        res.json({
            success: true,
            data: enriched,
            count: latestNews.length,
            timestamp: new Date().toISOString(),
            note: 'Data from hirunews.lk homepage'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            suggestion: 'Try reducing the limit parameter'
        });
    }
};
