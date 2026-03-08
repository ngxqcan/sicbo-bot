'use strict';

const https = require('https');

const BASE_URL = 'api.football-data.org';
const EPL_ID = 2021; // Premier League competition ID

function apiGet(path) {
  return new Promise((resolve, reject) => {
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
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// Lấy các trận EPL sắp diễn ra trong 7 ngày tới (status=SCHEDULED/TIMED)
async function getUpcomingMatches() {
  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dateFrom = now.toISOString().slice(0, 10);
  const dateTo = future.toISOString().slice(0, 10);
  const data = await apiGet(`/v4/competitions/${EPL_ID}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,TIMED`);
  return (data.matches || []).slice(0, 10); // tối đa 10 trận
}

// Lấy kết quả 1 trận theo matchId
async function getMatch(matchId) {
  const data = await apiGet(`/v4/matches/${matchId}`);
  return data;
}

module.exports = { getUpcomingMatches, getMatch };
