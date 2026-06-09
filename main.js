import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

// Initialize the Apify SDK
await Actor.init();

// Fetch Actor inputs
const input = await Actor.getInput() || {};
const {
    keywords = [
        "Customer Support Specialist",
        "Customer Service",
        "Customer Success Representative",
        "Customer Support Representative"
    ],
    locations = [
        "Toronto, ON"
    ],
    maxItems = 40,
    postedWithin = "1", // Default: Past 24 Hours (fromage=1)
    relevanceKeywords = [
        "customer",
        "support",
        "service",
        "success",
        "client",
        "care",
        "relations",
        "representative",
        "agent",
        "specialist"
    ],
    host = "www.indeed.com"
} = input;

console.log(`Starting Indeed Job Scraper using Playwright with parameters:`);
console.log(`- Keywords: ${JSON.stringify(keywords)}`);
console.log(`- Locations: ${JSON.stringify(locations)}`);
console.log(`- Max Items: ${maxItems}`);
console.log(`- Date Posted (fromage): ${postedWithin}`);
console.log(`- Relevance Filter: ${relevanceKeywords && relevanceKeywords.length > 0 ? JSON.stringify(relevanceKeywords) : 'Disabled'}`);
console.log(`- Indeed Domain: ${host}`);

// Set to track processed job IDs/keys to prevent duplicates
const processedJobIds = new Set();
// Track saved jobs
let savedJobsCount = 0;

// Helper to construct Indeed search URLs
function buildSearchUrl(domain, keyword, location, ageFilter, start) {
    let url = `https://${domain}/jobs?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}`;
    if (ageFilter && ageFilter !== 'all') {
        url += `&fromage=${ageFilter}`;
    }
    url += `&start=${start}`;
    return url;
}

// Setup Crawlee PlaywrightCrawler
const crawler = new PlaywrightCrawler({
    // Limit concurrency to avoid overloading or detection
    maxConcurrency: 5,
    minConcurrency: 1,

    // Configure Apify proxy
    proxyConfiguration: await Actor.createProxyConfiguration(),

    // Options to launch the browser
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },

    // Handle pages
    async requestHandler({ page, request, parseWithCheerio, log }) {
        const { userData } = request;
        log.info(`Processing search page: ${request.url}`);

        if (savedJobsCount >= maxItems) {
            log.info(`Reached limit of ${maxItems} jobs. Skipping extraction.`);
            return;
        }

        // Wait for job cards to render on the page
        try {
            await page.waitForSelector('.job_seen_beacon, td.result, .tapItem, #resultsCol', { timeout: 15000 });
        } catch (err) {
            log.warning(`Timeout waiting for job cards to render. Page might be empty, no jobs matched, or blocked by anti-bot.`);
        }

        // Use parseWithCheerio to leverage our existing jQuery extraction code
        const $ = await parseWithCheerio();

        // Indeed job cards selectors
        const jobCards = $('.job_seen_beacon, td.result, .tapItem');
        log.info(`Found ${jobCards.length} job cards on page start=${userData.start}`);

        if (jobCards.length === 0) {
            log.info(`No job cards found on this page. Reached the end of listings for this query.`);
            return;
        }

        // Parse each job card
        for (let i = 0; i < jobCards.length; i++) {
            const card = $(jobCards[i]);

            // Extract job key (jk)
            let jk = card.attr('data-jk') || card.find('[data-jk]').attr('data-jk');
            if (!jk) {
                const href = card.find('a[href*="/rc/clk"]').attr('href') || card.find('a[href*="/viewjob"]').attr('href');
                if (href) {
                    const match = href.match(/jk=([a-zA-Z0-9]+)/);
                    if (match) jk = match[1];
                }
            }

            // Extract Title
            let title = card.find('h2.jobTitle').text().trim();
            // Remove "new" prefix or suffix added by Indeed
            title = title.replace(/^(new|new\s+active)\s+/i, '').replace(/\s+(new|new\s+active)$/i, '').trim();

            if (!title) continue;

            // Extract Company Name
            const company = card.find('[data-testid="company-name"]').text().trim()
                || card.find('.companyName').text().trim()
                || card.find('.company_location [data-testid="company-name"]').text().trim()
                || null;

            // Extract Location
            const jobLocation = card.find('[data-testid="text-location"]').text().trim()
                || card.find('.companyLocation').text().trim()
                || card.find('.location').text().trim();

            // Extract Salary (if posted)
            const salary = card.find('.salary-snippet-container').text().trim()
                || card.find('.metadata.salarySnippet').text().trim()
                || card.find('.attribute_snippet').text().trim()
                || card.find('[class*="salary"]').text().trim()
                || null;

            // Extract Description Snippet
            const descriptionSnippet = card.find('.job-snippet').text().trim()
                || card.find('.summary').text().trim();

            // Extract Date Posted
            const postedDate = card.find('span.date').text().trim()
                || card.find('[class*="date"]').text().trim()
                || 'Recently';

            // Build direct link
            const jobUrl = jk ? `https://${host}/viewjob?jk=${jk}` : `https://${host}/jobs`;

            // Relevance filtering by title
            let isRelevant = true;
            if (relevanceKeywords && relevanceKeywords.length > 0) {
                const titleLower = title.toLowerCase();
                isRelevant = relevanceKeywords.some(keyword => {
                    const cleanKeyword = keyword.toLowerCase().trim();
                    return titleLower.includes(cleanKeyword);
                });
            }

            if (!isRelevant) {
                log.info(`[Relevance Skipped] "${title}" at ${company} (does not match relevance keywords)`);
                continue;
            }

            // Prevent duplicate saves
            const uniqueId = jk || `${title}-${company}-${jobLocation}`;
            if (processedJobIds.has(uniqueId)) {
                continue;
            }
            processedJobIds.add(uniqueId);

            if (savedJobsCount >= maxItems) {
                log.info(`Saved requested maximum of ${maxItems} jobs. Crawling complete!`);
                break;
            }

            const result = {
                title,
                company,
                location: jobLocation,
                salary,
                postedDate,
                jobUrl,
                descriptionSnippet,
                searchKeyword: userData.keyword,
                searchLocation: userData.location,
                jobKey: jk || null
            };

            // Push data to Apify dataset
            await Actor.pushData(result);
            savedJobsCount++;
            log.info(`[Job ${savedJobsCount}/${maxItems} Saved] "${title}" at ${company}`);
        }

        // Programmatically enqueue the next page if there are more jobs to fetch
        const nextStart = userData.start + 10;
        if (savedJobsCount < maxItems && jobCards.length > 0 && nextStart < 1000) {
            const nextSearchUrl = buildSearchUrl(host, userData.keyword, userData.location, postedWithin, nextStart);
            log.info(`Enqueuing next page: ${nextSearchUrl}`);
            await crawler.addRequests([{
                url: nextSearchUrl,
                userData: {
                    label: 'search',
                    keyword: userData.keyword,
                    location: userData.location,
                    start: nextStart
                }
            }]);
        }
    },

    // Handle failed requests
    failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed repeatedly. Skipping.`);
    }
});

// Seed initial request queue
const initialRequests = [];
for (const keyword of keywords) {
    for (const loc of locations) {
        const searchUrl = buildSearchUrl(host, keyword, loc, postedWithin, 0);
        initialRequests.push({
            url: searchUrl,
            userData: {
                label: 'search',
                keyword,
                location: loc,
                start: 0
            }
        });
    }
}

// Run crawler
console.log('Seeding initial search requests...');
await crawler.run(initialRequests);

// Clean up
await Actor.exit();
