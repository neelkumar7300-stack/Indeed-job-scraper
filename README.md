# Indeed Job Scraper Actor

An Apify Actor to scrape job postings from Indeed. It uses **Crawlee** and its `CheerioCrawler` to parse Indeed search result pages without requiring browser automation (using lightweight HTTP requests) and enqueues paginated search results automatically.

## Features

- **Relevance Efficacy Filtering**: Re-validates job titles against customizable keywords (e.g. for Customer Support / Customer Service roles) to filter out unrelated jobs.
- **Configurable UI Inputs**: Easily edit Search Keywords, Locations, Max Items, Age of posts, and Indeed country domains via the Apify UI.
- **Robust Selectors**: Leverages redundant selector mappings and job key extraction logic to ensure scraper stability.
- **Integration Ready**: Outputs clean JSON objects to your Apify dataset.

## Input Parameters

The actor accepts the following inputs via the Apify UI or direct JSON payload:

- `keywords` (Array of Strings): Search keywords (e.g. `["Customer Support Specialist", "Customer Service"]`).
- `locations` (Array of Strings): Search locations (e.g. `["Toronto, ON"]`).
- `maxItems` (Integer): Maximum number of job postings to scrape in total. Default is `40`.
- `postedWithin` (Select): Filter jobs by when they were posted (Indeed's `fromage` parameter in days):
  - `1`: Past 24 Hours (Default)
  - `3`: Past 3 Days
  - `7`: Past Week
  - `14`: Past 14 Days
  - `all`: Anytime
- `relevanceKeywords` (Array of Strings): Only save jobs whose titles contain one of these keywords (case-insensitive).
- `host` (String): The regional Indeed domain to scrape. Defaults to `www.indeed.com`.

## Local Development & Setup

To run the actor locally:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure input parameters locally by creating a file at `storage/key_value_stores/default/INPUT.json`. For example:
   ```json
   {
     "keywords": ["Customer Support Specialist", "Customer Service"],
     "locations": ["Toronto, ON"],
     "maxItems": 10,
     "postedWithin": "1"
   }
   ```

3. Start the scraper:
   ```bash
   npm start
   ```

Outputs will be saved under the `storage/datasets/default/` directory as JSON files.

## Deploying to Apify

### Option A: Using GitHub Integration (Recommended)
1. Push this project to a GitHub repository (e.g. your existing `customer-support` repository, or a new repo).
2. Go to the [Apify Console](https://console.apify.com/) and create a new Actor.
3. Select **Git repository** as the source code option and paste your GitHub repository URL.
4. Click **Save & Deploy** (Apify will automatically rebuild your actor every time you push changes to GitHub).

### Option B: Using Apify CLI
1. Log in to your Apify account:
   ```bash
   apify login
   ```
2. Deploy the Actor from your project directory:
   ```bash
   apify push
   ```
