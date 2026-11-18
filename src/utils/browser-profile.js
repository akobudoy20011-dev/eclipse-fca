'use strict';

const DEFAULT_BROWSER_PROFILE = Object.freeze({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  secChUa: '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="99"',
  secChUaMobile: '?0',
  secChUaPlatform: '"Linux"',
  secFetchSite: 'same-origin',
  secFetchMode: 'cors',
  secFetchDest: 'empty'
});

function createBrowserHeaders(profile = DEFAULT_BROWSER_PROFILE) {
  return {
    'user-agent': profile.userAgent,
    'sec-ch-ua': profile.secChUa,
    'sec-ch-ua-mobile': profile.secChUaMobile,
    'sec-ch-ua-platform': profile.secChUaPlatform,
    'sec-fetch-site': profile.secFetchSite,
    'sec-fetch-mode': profile.secFetchMode,
    'sec-fetch-dest': profile.secFetchDest
  };
}

module.exports = { DEFAULT_BROWSER_PROFILE, createBrowserHeaders };
