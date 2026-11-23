// Lighthouse CI (mobile, median of 3 runs) on the built site served like Cloudflare Pages.
// Reports stay on the runner (never uploaded to a public storage).
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node scripts/serve.mjs 4330',
      startServerReadyPattern: 'serving dist',
      url: [
        'http://localhost:4330/',
        'http://localhost:4330/equipes',
        'http://localhost:4330/diagnostic',
      ],
      numberOfRuns: 3,
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
            'categories:accessibility': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
            'categories:best-practices': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
          },
        },
        {
          // /diagnostic is noindex in waitlist mode: SEO checked on the indexable pages only
          matchingUrlPattern: 'localhost:4330/(equipes)?$',
          assertions: {
            'categories:seo': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
          },
        },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
