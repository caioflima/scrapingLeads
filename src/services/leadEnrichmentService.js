const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../database/knex');

const IGNORED_DOMAINS = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'google.com',
  'whatsapp.com', 'wa.me', 'yelp.com', 'tripadvisor.com', 'foursquare.com',
  'guiamais.com.br', 'telelistas.net', 'jusbrasil.com.br', 'reclameaqui.com.br',
  'ifood.com.br', 'rappi.com.br', 'uber.com', '99app.com', 'g1.globo.com',
  'uol.com.br', 'terra.com.br', 'estadao.com.br', 'folha.uol.com.br', 'wikipedia.org',
  'jus.com.br', 'jusbrasil.com'
];

async function searchDuckDuckGo(query) {
  try {
    const res = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result__url').each((i, el) => {
      let url = $(el).text().trim();
      if(url) results.push(url);
    });
    return results;
  } catch (e) {
    console.error('DDG Search error:', e.message);
    return [];
  }
}

async function enrichLead(leadId) {
  const lead = await db('leads').where({ id: leadId }).first();
  if (!lead) throw new Error('Lead not found');

  let rawData = {};
  try {
    rawData = typeof lead.raw_data === 'string' ? JSON.parse(lead.raw_data) : (lead.raw_data || {});
  } catch (e) {}

  // If already enriched recently (e.g. last 7 days), we can skip, but for now let's just do it.
  
  let query = lead.name;
  const address = rawData.address;
  if (address) {
    // Only use the first part of address to avoid overly specific queries that yield no results
    query += ' ' + address.split('-')[0].split(',')[0]; 
  }

  const urls = await searchDuckDuckGo(query);
  
  let instagram = null;
  let facebook = null;
  let linkedin = null;
  let website = rawData.website; // keep existing if any

  for (let url of urls) {
    url = url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    
    if (url.startsWith('instagram.com/')) {
      if (!instagram) instagram = 'https://' + url;
    } else if (url.startsWith('facebook.com/')) {
      if (!facebook) facebook = 'https://' + url;
    } else if (url.startsWith('linkedin.com/')) {
      if (!linkedin) linkedin = 'https://' + url;
    } else {
      // Potential website
      const domain = url.split('/')[0];
      if (!website && !IGNORED_DOMAINS.includes(domain) && domain.includes('.')) {
        website = 'https://' + domain;
      }
    }
  }

  rawData.enriched_at = new Date().toISOString();
  if (instagram) rawData.instagram = instagram;
  if (facebook) rawData.facebook = facebook;
  if (linkedin) rawData.linkedin = linkedin;
  if (website && website !== 'null' && String(website).trim() !== '') rawData.website = website;

  await db('leads')
    .where({ id: leadId })
    .update({ raw_data: JSON.stringify(rawData) });

  return { 
    id: leadId, 
    instagram, 
    facebook, 
    linkedin, 
    website: rawData.website,
    enriched_at: rawData.enriched_at
  };
}

module.exports = { enrichLead };