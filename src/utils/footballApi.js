'use strict';

const https = require('https');

const BASE_URL = 'api.football-data.org';
const EPL_ID = 2021;

function apiGet(path, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const options = {
        hostname: BASE_URL,
        path,
        method: 'GET',
        headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY || '' },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            // API trả về lỗi 429 (rate limit) hay 403 (no key)
            if (res.statusCode === 429) {
              return reject(new Error('Rate limit exceeded — thử lại sau 1 phút'));
            }
            if (res.statusCode === 403) {
              return reject(new Error('API key không hợp lệ hoặc chưa được set'));
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`API error ${res.statusCode}: ${parsed.message || 'Unknown'}`));
            }
            resolve(parsed);
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });
      req.on('error', (err) => {
        if (remaining > 1) {
          console.warn(`Football API retry (${remaining - 1} left): ${err.message}`);
          setTimeout(() => attempt(remaining - 1), 2000);
        } else {
          reject(err);
        }
      });
      req.setTimeout(15000, () => {
        req.destroy();
        if (remaining > 1) {
          console.warn(`Football API timeout, retrying (${remaining - 1} left)...`);
          setTimeout(() => attempt(remaining - 1), 2000);
        } else {
          reject(new Error('Request timeout sau 3 lần thử'));
        }
      });
      req.end();
    };
    attempt(retries);
  });
}

async function getUpcomingMatches() {
  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dateFrom = now.toISOString().slice(0, 10);
  const dateTo = future.toISOString().slice(0, 10);
  const data = await apiGet(`/v4/competitions/${EPL_ID}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,TIMED`);
  return (data.matches || []).slice(0, 10);
}

async function getMatch(matchId) {
  return apiGet(`/v4/matches/${matchId}`);
}

module.exports = { getUpcomingMatches, getMatch };


// Test kết nối — gọi khi bot khởi động
async function testConnection() {
  return new Promise((resolve) => {
    const options = {
      hostname: BASE_URL,
      path: '/v4/competitions/2021',
      method: 'GET',
      headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY || '' },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Football API: kết nối OK');
        } else if (res.statusCode === 403) {
          console.error('❌ Football API: key sai hoặc chưa set FOOTBALL_API_KEY');
        } else if (res.statusCode === 429) {
          console.error('❌ Football API: rate limit — thử lại sau');
        } else {
          console.error(`❌ Football API: HTTP ${res.statusCode} — ${data.slice(0, 100)}`);
        }
        resolve(res.statusCode);
      });
    });
    req.on('error', (e) => {
      console.error(`❌ Football API: không kết nối được — ${e.message}`);
      resolve(null);
    });
    req.setTimeout(10000, () => {
      req.destroy();
      console.error('❌ Football API: timeout — Railway có thể đang block outbound đến api.football-data.org');
      resolve(null);
    });
    req.end();
  });
}

module.exports = { getUpcomingMatches, getMatch, testConnection };
